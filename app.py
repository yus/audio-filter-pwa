from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import numpy as np
import soundfile as sf
import io
import base64
import json
import time

app = Flask(__name__)
CORS(app)

class AudioFilter:
    def __init__(self):
        self.sample_rate = 44100
        
    def apply_filter(self, audio_data, filter_type='lowpass', cutoff=1000, resonance=0.7):
        """Apply various audio filters"""
        if filter_type == 'lowpass':
            return self._lowpass_filter(audio_data, cutoff, resonance)
        elif filter_type == 'highpass':
            return self._highpass_filter(audio_data, cutoff, resonance)
        elif filter_type == 'bandpass':
            return self._bandpass_filter(audio_data, cutoff, resonance)
        return audio_data
    
    def _lowpass_filter(self, data, cutoff, resonance):
        """Simple low-pass filter implementation"""
        rc = 1.0 / (cutoff * 2 * np.pi)
        dt = 1.0 / self.sample_rate
        alpha = dt / (rc + dt)
        filtered = np.zeros_like(data)
        filtered[0] = data[0]
        for i in range(1, len(data)):
            filtered[i] = filtered[i-1] + alpha * (data[i] - filtered[i-1])
        return filtered
    
    def _highpass_filter(self, data, cutoff, resonance):
        """Simple high-pass filter implementation"""
        rc = 1.0 / (cutoff * 2 * np.pi)
        dt = 1.0 / self.sample_rate
        alpha = rc / (rc + dt)
        filtered = np.zeros_like(data)
        filtered[0] = data[0]
        for i in range(1, len(data)):
            filtered[i] = alpha * (filtered[i-1] + data[i] - data[i-1])
        return filtered
    
    def _bandpass_filter(self, data, cutoff, resonance):
        """Simple band-pass filter implementation"""
        low = self._lowpass_filter(data, cutoff, resonance)
        high = self._highpass_filter(data, cutoff, resonance)
        return low - high

class LFO:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        self.phase = 0
        
    def generate(self, frequency, waveform='sine', depth=1.0):
        """Generate LFO signal"""
        length = int(self.sample_rate)
        t = np.arange(length) / self.sample_rate
        
        if waveform == 'sine':
            signal = np.sin(2 * np.pi * frequency * t + self.phase)
        elif waveform == 'triangle':
            signal = 2 * np.abs(2 * (frequency * t + self.phase/2 - np.floor(frequency * t + self.phase/2 + 0.5))) - 1
        elif waveform == 'square':
            signal = np.sign(np.sin(2 * np.pi * frequency * t + self.phase))
        elif waveform == 'sawtooth':
            signal = 2 * (frequency * t + self.phase/(2*np.pi) - np.floor(0.5 + frequency * t + self.phase/(2*np.pi)))
        else:
            signal = np.zeros(length)
        
        self.phase += 2 * np.pi * frequency * length / self.sample_rate
        return signal * depth

audio_filter = AudioFilter()
lfo = LFO()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/generate_waveform', methods=['POST'])
def generate_waveform():
    """Generate audio waveform for visualization"""
    data = request.json
    freq = data.get('frequency', 440)
    duration = data.get('duration', 1.0)
    
    # Generate sine wave
    t = np.linspace(0, duration, int(44100 * duration))
    waveform = np.sin(2 * np.pi * freq * t)
    
    # Apply LFO if requested
    if data.get('lfo_enabled', False):
        lfo_signal = lfo.generate(
            data.get('lfo_freq', 5),
            data.get('lfo_waveform', 'sine'),
            data.get('lfo_depth', 0.5)
        )
        # Trim LFO to match waveform length
        lfo_signal = lfo_signal[:len(waveform)]
        waveform = waveform * (1 + lfo_signal * 0.5)
    
    # Convert to list for JSON response
    points = waveform[:1000].tolist()  # First 1000 points for visualization
    
    return jsonify({
        'waveform': points,
        'sampling_rate': 44100
    })

@app.route('/api/process_audio', methods=['POST'])
def process_audio():
    """Process audio data with filters"""
    try:
        data = request.json
        audio_data = np.array(data.get('audio_data', []))
        
        if len(audio_data) == 0:
            return jsonify({'error': 'No audio data provided'}), 400
        
        # Apply filter
        filtered = audio_filter.apply_filter(
            audio_data,
            data.get('filter_type', 'lowpass'),
            data.get('cutoff_freq', 1000),
            data.get('resonance', 0.7)
        )
        
        # Apply LFO modulation if enabled
        if data.get('lfo_enabled', False):
            lfo_signal = lfo.generate(
                data.get('lfo_freq', 5),
                data.get('lfo_waveform', 'sine'),
                data.get('lfo_depth', 0.5)
            )
            # Trim LFO to match audio length
            lfo_signal = lfo_signal[:len(filtered)]
            filtered = filtered * (1 + lfo_signal * 0.3)
        
        return jsonify({
            'processed_audio': filtered.tolist(),
            'original_rms': float(np.sqrt(np.mean(audio_data**2))),
            'processed_rms': float(np.sqrt(np.mean(filtered**2)))
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/synthesize', methods=['POST'])
def synthesize():
    """Synthesize audio with parameters"""
    data = request.json
    freq = data.get('frequency', 440)
    duration = data.get('duration', 1.0)
    waveform_type = data.get('waveform', 'sine')
    
    t = np.linspace(0, duration, int(44100 * duration))
    
    # Generate different waveforms
    if waveform_type == 'sine':
        audio = np.sin(2 * np.pi * freq * t)
    elif waveform_type == 'square':
        audio = np.sign(np.sin(2 * np.pi * freq * t))
    elif waveform_type == 'sawtooth':
        audio = 2 * (t * freq - np.floor(t * freq + 0.5))
    elif waveform_type == 'triangle':
        audio = 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1
    else:
        audio = np.zeros_like(t)
    
    # Apply envelope
    envelope = np.ones_like(t)
    attack = min(0.1, duration * 0.1)
    decay = min(0.1, duration * 0.1)
    sustain_level = 0.7
    release = min(0.2, duration * 0.2)
    
    # ADSR envelope
    attack_samples = int(attack * 44100)
    decay_samples = int(decay * 44100)
    release_samples = int(release * 44100)
    sustain_samples = len(t) - attack_samples - decay_samples - release_samples
    
    if attack_samples > 0:
        envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
    if decay_samples > 0:
        envelope[attack_samples:attack_samples+decay_samples] = np.linspace(1, sustain_level, decay_samples)
    if sustain_samples > 0:
        envelope[attack_samples+decay_samples:attack_samples+decay_samples+sustain_samples] = sustain_level
    if release_samples > 0:
        envelope[-release_samples:] = np.linspace(sustain_level, 0, release_samples)
    
    audio = audio * envelope
    
    # Normalize
    audio = audio / np.max(np.abs(audio)) if np.max(np.abs(audio)) > 0 else audio
    
    return jsonify({
        'audio': audio.tolist(),
        'sample_rate': 44100,
        'duration': duration
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
