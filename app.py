from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
import numpy as np
import io
import base64
import json
import time
from scipy import signal  # Use scipy for filtering instead

app = Flask(__name__)
CORS(app)

# Serve static files
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

class AudioFilter:
    def __init__(self):
        self.sample_rate = 44100
        
    def apply_filter(self, audio_data, filter_type='lowpass', cutoff=1000, resonance=0.7):
        """Apply various audio filters using scipy"""
        nyquist = self.sample_rate / 2
        normalized_cutoff = cutoff / nyquist
        
        if filter_type == 'lowpass':
            b, a = signal.butter(4, normalized_cutoff, btype='low')
        elif filter_type == 'highpass':
            b, a = signal.butter(4, normalized_cutoff, btype='high')
        elif filter_type == 'bandpass':
            b, a = signal.butter(4, [normalized_cutoff*0.9, normalized_cutoff*1.1], btype='band')
        else:
            return audio_data
            
        filtered = signal.filtfilt(b, a, audio_data)
        return filtered

class LFO:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        self.phase = 0
        
    def generate(self, frequency, waveform='sine', depth=1.0, length=None):
        """Generate LFO signal"""
        if length is None:
            length = int(self.sample_rate)
        
        t = np.arange(length) / self.sample_rate
        
        if waveform == 'sine':
            signal = np.sin(2 * np.pi * frequency * t + self.phase)
        elif waveform == 'triangle':
            signal = 2 * np.abs(2 * (frequency * t - np.floor(frequency * t + 0.5))) - 1
        elif waveform == 'square':
            signal = np.sign(np.sin(2 * np.pi * frequency * t + self.phase))
        elif waveform == 'sawtooth':
            signal = 2 * (frequency * t - np.floor(frequency * t + 0.5))
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
    try:
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
                data.get('lfo_depth', 0.5),
                len(waveform)
            )
            waveform = waveform * (1 + lfo_signal * 0.5)
        
        # Apply filter if requested
        filter_type = data.get('filter_type', 'lowpass')
        if filter_type != 'none':
            filtered = audio_filter.apply_filter(
                waveform,
                filter_type,
                data.get('cutoff_freq', 1000),
                data.get('resonance', 0.7)
            )
            waveform = filtered
        
        # Convert to list for JSON response
        points = waveform[:1000].tolist()  # First 1000 points for visualization
        
        return jsonify({
            'waveform': points,
            'sampling_rate': 44100
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/process_audio', methods=['POST'])
def process_audio():
    """Process audio data with filters"""
    try:
        data = request.json
        audio_data = np.array(data.get('audio_data', []))
        
        if len(audio_data) == 0:
            # Generate test audio if none provided
            duration = data.get('duration', 1.0)
            freq = data.get('frequency', 440)
            t = np.linspace(0, duration, int(44100 * duration))
            audio_data = np.sin(2 * np.pi * freq * t)
        
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
                data.get('lfo_depth', 0.5),
                len(filtered)
            )
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
    try:
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
        
        # Apply ADSR envelope
        attack = min(0.1, duration * 0.1)
        decay = min(0.1, duration * 0.1)
        sustain_level = 0.7
        release = min(0.2, duration * 0.2)
        
        # Calculate envelope
        attack_samples = int(attack * 44100)
        decay_samples = int(decay * 44100)
        release_samples = int(release * 44100)
        sustain_samples = len(t) - attack_samples - decay_samples - release_samples
        
        envelope = np.ones(len(t))
        
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
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val
        
        return jsonify({
            'audio': audio.tolist(),
            'sample_rate': 44100,
            'duration': duration,
            'max_amplitude': float(max_val) if max_val > 0 else 0
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for Vercel"""
    return jsonify({
        'status': 'ok',
        'message': 'Audio Filter PWA is running',
        'timestamp': time.time()
    })

# Required for Vercel
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
else:
    # This is needed for Vercel serverless
    application = app
