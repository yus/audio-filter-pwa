from flask import Flask, render_template, jsonify, request, send_from_directory
import math
import time
import json
import os
import base64
from io import BytesIO

app = Flask(__name__, 
            static_folder='static',
            template_folder='templates',
            static_url_path='/static')

# ========== AUDIO PROCESSING CLASSES ==========
class AudioFilter:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        self.prev_output = 0
        self.prev_input = 0
        
    def apply_lowpass(self, data, cutoff_freq, resonance=0.7):
        """Simple low-pass filter"""
        if not data:
            return data
            
        rc = 1.0 / (cutoff_freq * 2 * math.pi)
        dt = 1.0 / self.sample_rate
        alpha = dt / (rc + dt)
        
        filtered = []
        y_prev = data[0]
        
        for sample in data:
            y = y_prev + alpha * (sample - y_prev)
            filtered.append(y)
            y_prev = y
            
        return filtered
    
    def apply_highpass(self, data, cutoff_freq, resonance=0.7):
        """Simple high-pass filter"""
        if not data:
            return data
            
        rc = 1.0 / (cutoff_freq * 2 * math.pi)
        dt = 1.0 / self.sample_rate
        alpha = rc / (rc + dt)
        
        filtered = []
        y_prev = data[0]
        x_prev = data[0]
        
        for sample in data:
            y = alpha * (y_prev + sample - x_prev)
            filtered.append(y)
            y_prev = y
            x_prev = sample
            
        return filtered
    
    def apply_filter(self, data, filter_type='lowpass', cutoff=1000, resonance=0.7):
        """Apply selected filter"""
        if filter_type == 'lowpass':
            return self.apply_lowpass(data, cutoff, resonance)
        elif filter_type == 'highpass':
            return self.apply_highpass(data, cutoff, resonance)
        elif filter_type == 'bandpass':
            # Bandpass = Highpass(Lowpass(data))
            lowpassed = self.apply_lowpass(data, cutoff, resonance)
            return self.apply_highpass(lowpassed, cutoff, resonance)
        else:
            return data

class LFO:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        self.phase = 0
        
    def generate(self, frequency, waveform='sine', depth=1.0, length=1000):
        """Generate LFO modulation signal"""
        signal = []
        
        for i in range(length):
            t = i / self.sample_rate
            phase = 2 * math.pi * frequency * t + self.phase
            
            if waveform == 'sine':
                value = math.sin(phase)
            elif waveform == 'triangle':
                frac = (frequency * t) - int(frequency * t)
                if frac < 0.25:
                    value = 4 * frac
                elif frac < 0.75:
                    value = 2 - 4 * frac
                else:
                    value = 4 * frac - 4
            elif waveform == 'square':
                value = 1.0 if math.sin(phase) >= 0 else -1.0
            elif waveform == 'sawtooth':
                frac = (frequency * t) - int(frequency * t)
                value = 2 * frac - 1
            else:
                value = 0
                
            signal.append(value * depth)
        
        self.phase += 2 * math.pi * frequency * length / self.sample_rate
        return signal

class AudioSynthesizer:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        
    def generate_waveform(self, frequency, duration=1.0, waveform='sine', 
                         lfo_enabled=False, lfo_freq=5, lfo_waveform='sine', lfo_depth=0.5):
        """Generate audio waveform with optional LFO modulation"""
        samples = int(self.sample_rate * duration)
        audio = []
        
        # Generate base waveform
        for i in range(samples):
            t = i / self.sample_rate
            
            if waveform == 'sine':
                value = math.sin(2 * math.pi * frequency * t)
            elif waveform == 'square':
                value = 1.0 if math.sin(2 * math.pi * frequency * t) >= 0 else -1.0
            elif waveform == 'sawtooth':
                frac = frequency * t - int(frequency * t)
                value = 2 * frac - 1
            elif waveform == 'triangle':
                frac = frequency * t - int(frequency * t)
                if frac < 0.5:
                    value = 4 * frac - 1
                else:
                    value = 3 - 4 * frac
            else:
                value = 0
                
            audio.append(value)
        
        # Apply LFO if enabled
        if lfo_enabled:
            lfo = LFO(self.sample_rate)
            lfo_signal = lfo.generate(lfo_freq, lfo_waveform, lfo_depth, len(audio))
            audio = [a * (1 + l * 0.5) for a, l in zip(audio, lfo_signal)]
        
        # Apply envelope
        audio = self.apply_adsr_envelope(audio, duration)
        
        return audio
    
    def apply_adsr_envelope(self, audio, duration):
        """Apply ADSR envelope to audio"""
        if not audio:
            return audio
            
        attack_time = min(0.1, duration * 0.1)
        decay_time = min(0.1, duration * 0.1)
        sustain_level = 0.7
        release_time = min(0.2, duration * 0.2)
        
        attack_samples = int(attack_time * self.sample_rate)
        decay_samples = int(decay_time * self.sample_rate)
        release_samples = int(release_time * self.sample_rate)
        sustain_samples = len(audio) - attack_samples - decay_samples - release_samples
        
        # Apply envelope
        for i in range(len(audio)):
            if i < attack_samples:
                envelope = i / attack_samples if attack_samples > 0 else 1
            elif i < attack_samples + decay_samples:
                envelope = 1 - (1 - sustain_level) * (i - attack_samples) / decay_samples if decay_samples > 0 else sustain_level
            elif i < attack_samples + decay_samples + sustain_samples:
                envelope = sustain_level
            else:
                release_idx = i - (attack_samples + decay_samples + sustain_samples)
                envelope = sustain_level * (1 - release_idx / release_samples) if release_samples > 0 else 0
            
            audio[i] *= envelope
        
        # Normalize
        max_val = max(abs(x) for x in audio) if audio else 1
        if max_val > 0:
            audio = [x / max_val for x in audio]
        
        return audio

# Initialize processors
audio_filter = AudioFilter()
lfo = LFO()
synthesizer = AudioSynthesizer()

# ========== ROUTES ==========
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

# ========== API ENDPOINTS ==========
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'name': 'Audio Filter PWA',
        'version': '1.0.0',
        'features': ['synthesizer', 'filter', 'lfo', 'visualizer', 'pwa'],
        'time': time.time()
    })

@app.route('/api/generate', methods=['POST'])
def generate():
    """Generate waveform for visualization"""
    try:
        data = request.json or {}
        
        freq = float(data.get('frequency', 440))
        duration = float(data.get('duration', 1.0))
        waveform = data.get('waveform', 'sine')
        filter_type = data.get('filter_type', 'lowpass')
        cutoff = float(data.get('cutoff_freq', 1000))
        resonance = float(data.get('resonance', 0.7))
        lfo_enabled = bool(data.get('lfo_enabled', False))
        lfo_freq = float(data.get('lfo_freq', 5))
        lfo_waveform = data.get('lfo_waveform', 'sine')
        lfo_depth = float(data.get('lfo_depth', 0.5))
        
        # Generate audio
        audio = synthesizer.generate_waveform(
            freq, duration, waveform, 
            lfo_enabled, lfo_freq, lfo_waveform, lfo_depth
        )
        
        # Apply filter
        if filter_type != 'none':
            audio = audio_filter.apply_filter(audio, filter_type, cutoff, resonance)
        
        # Return only first 1000 points for visualization
        waveform_data = audio[:1000] if len(audio) > 1000 else audio
        
        return jsonify({
            'success': True,
            'waveform': waveform_data,
            'full_audio': audio[:44100],  # First second of audio
            'frequency': freq,
            'duration': duration,
            'samples': len(audio),
            'sample_rate': 44100
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/synthesize', methods=['POST'])
def synthesize():
    """Synthesize complete audio with all effects"""
    try:
        data = request.json or {}
        
        freq = float(data.get('frequency', 440))
        duration = float(data.get('duration', 1.0))
        waveform = data.get('waveform', 'sine')
        filter_type = data.get('filter_type', 'lowpass')
        cutoff = float(data.get('cutoff_freq', 1000))
        resonance = float(data.get('resonance', 0.7))
        lfo_enabled = bool(data.get('lfo_enabled', False))
        lfo_freq = float(data.get('lfo_freq', 5))
        lfo_waveform = data.get('lfo_waveform', 'sine')
        lfo_depth = float(data.get('lfo_depth', 0.5))
        
        # Generate audio
        audio = synthesizer.generate_waveform(
            freq, duration, waveform, 
            lfo_enabled, lfo_freq, lfo_waveform, lfo_depth
        )
        
        # Apply filter
        if filter_type != 'none':
            audio = audio_filter.apply_filter(audio, filter_type, cutoff, resonance)
        
        # Convert to base64 for audio element
        # Note: In production, you'd want to generate actual WAV bytes
        # For simplicity, we'll return the raw samples
        
        return jsonify({
            'success': True,
            'audio': audio,
            'sample_rate': 44100,
            'duration': duration,
            'format': 'float32'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/process_audio', methods=['POST'])
def process_audio():
    """Process uploaded/recorded audio"""
    try:
        data = request.json or {}
        audio_data = data.get('audio_data', [])
        
        if not audio_data:
            return jsonify({'success': False, 'error': 'No audio data provided'}), 400
        
        # Convert to list of floats
        audio_data = [float(x) for x in audio_data]
        
        # Get processing parameters
        filter_type = data.get('filter_type', 'lowpass')
        cutoff = float(data.get('cutoff_freq', 1000))
        resonance = float(data.get('resonance', 0.7))
        lfo_enabled = bool(data.get('lfo_enabled', False))
        lfo_freq = float(data.get('lfo_freq', 5))
        lfo_waveform = data.get('lfo_waveform', 'sine')
        lfo_depth = float(data.get('lfo_depth', 0.5))
        
        # Apply filter
        filtered = audio_filter.apply_filter(audio_data, filter_type, cutoff, resonance)
        
        # Apply LFO if enabled
        if lfo_enabled:
            lfo_signal = lfo.generate(lfo_freq, lfo_waveform, lfo_depth, len(filtered))
            filtered = [f * (1 + l * 0.3) for f, l in zip(filtered, lfo_signal)]
        
        return jsonify({
            'success': True,
            'processed_audio': filtered,
            'original_length': len(audio_data),
            'processed_length': len(filtered)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== ERROR HANDLERS ==========
@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500

# ========== APPLICATION ENTRY ==========
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
else:
    application = app
