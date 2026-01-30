from flask import Flask, render_template, jsonify, request, send_from_directory
import math
import time
import json
import os
import traceback
from io import BytesIO

app = Flask(__name__, 
            static_folder='static',
            template_folder='templates',
            static_url_path='/static')

# ========== AUDIO PROCESSING CLASSES (No numpy) ==========
class AudioFilter:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        
    def apply_lowpass(self, data, cutoff_freq, resonance=0.7):
        """Simple low-pass filter without numpy"""
        if not data:
            return data
            
        rc = 1.0 / (cutoff_freq * 2 * math.pi)
        dt = 1.0 / self.sample_rate
        alpha = dt / (rc + dt)
        
        filtered = []
        y_prev = data[0] if data else 0
        
        for sample in data:
            y = y_prev + alpha * (sample - y_prev)
            filtered.append(y)
            y_prev = y
            
        return filtered
    
    def apply_highpass(self, data, cutoff_freq, resonance=0.7):
        """Simple high-pass filter without numpy"""
        if not data:
            return data
            
        rc = 1.0 / (cutoff_freq * 2 * math.pi)
        dt = 1.0 / self.sample_rate
        alpha = rc / (rc + dt)
        
        filtered = []
        y_prev = data[0] if data else 0
        x_prev = data[0] if data else 0
        
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
            lowpassed = self.apply_lowpass(data, cutoff, resonance)
            return self.apply_highpass(lowpassed, cutoff, resonance)
        else:
            return data

class LFO:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        self.phase = 0
        
    def generate(self, frequency, waveform='sine', depth=1.0, length=1000):
        """Generate LFO modulation signal without numpy"""
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
        """Generate audio waveform without numpy"""
        samples = int(self.sample_rate * duration)
        audio = []
        
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
        
        if lfo_enabled:
            lfo = LFO(self.sample_rate)
            lfo_signal = lfo.generate(lfo_freq, lfo_waveform, lfo_depth, len(audio))
            audio = [a * (1 + l * 0.5) for a, l in zip(audio, lfo_signal)]
        
        audio = self.apply_adsr_envelope(audio, duration)
        return audio
    
    def apply_adsr_envelope(self, audio, duration):
        """Apply ADSR envelope without numpy"""
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
        
        # Normalize without numpy
        max_val = 0.0001  # Avoid division by zero
        for sample in audio:
            abs_sample = abs(sample)
            if abs_sample > max_val:
                max_val = abs_sample
        
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
        'features': ['synthesizer', 'filter', 'lfo', 'pwa'],
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
        print(f"Error in /api/generate: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/synthesize', methods=['POST'])
def synthesize():
    """Synthesize complete audio"""
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
        
        return jsonify({
            'success': True,
            'audio': audio,
            'sample_rate': 44100,
            'duration': duration,
            'format': 'float32'
        })
        
    except Exception as e:
        print(f"Error in /api/synthesize: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/process_audio', methods=['POST'])
def process_audio():
    """Process uploaded/recorded audio - FIXED without numpy"""
    try:
        data = request.json or {}
        audio_data = data.get('audio_data', [])
        
        if not audio_data:
            return jsonify({'success': False, 'error': 'No audio data provided'}), 400
        
        # Convert to list of floats
        audio_data = [float(x) for x in audio_data]
        
        # Get processing parameters with safe defaults
        filter_type = data.get('filter_type', 'lowpass')
        cutoff = float(data.get('cutoff_freq', 1000))
        resonance = float(data.get('resonance', 0.7))
        lfo_enabled = bool(data.get('lfo_enabled', False))
        lfo_freq = float(data.get('lfo_freq', 5))
        lfo_waveform = data.get('lfo_waveform', 'sine')
        lfo_depth = float(data.get('lfo_depth', 0.5))
        
        # NEW: Get mixing parameters (provide defaults)
        mixing_enabled = data.get('mixing_enabled', False)
        modulation_type = data.get('modulation_type', 'sidechain')
        modulation_rate = float(data.get('modulation_rate', 5))
        modulation_depth = float(data.get('modulation_depth', 0.5))
        process_type = data.get('process_type', 'uploaded')  # New parameter
        
        print(f"Processing audio: type={process_type}, mixing={mixing_enabled}, modulation={modulation_type}")
        
        # Apply filter first
        if filter_type != 'none':
            filtered = audio_filter.apply_filter(audio_data, filter_type, cutoff, resonance)
        else:
            filtered = audio_data
        
        # Apply mixing if enabled
        if mixing_enabled:
            mixed_audio = []
            sample_rate = 44100
            
            for i in range(len(filtered)):
                t = i / sample_rate
                
                if modulation_type == 'sidechain':
                    # Sidechain compression effect
                    modulation = 0.5 + 0.5 * math.sin(2 * math.pi * modulation_rate * t)
                    mixed_sample = filtered[i] * (0.3 + 0.7 * modulation) * (1.0 - modulation_depth * 0.7)
                elif modulation_type == 'tremolo':
                    # Tremolo effect
                    modulation = 0.5 + 0.5 * math.sin(2 * math.pi * modulation_rate * t)
                    mixed_sample = filtered[i] * (1.0 - modulation_depth * 0.5 * modulation)
                elif modulation_type == 'compressor':
                    # Simple compression
                    modulation = 0.5 + 0.5 * math.sin(2 * math.pi * modulation_rate * t)
                    threshold = 0.3
                    sample = filtered[i]
                    if abs(sample) > threshold:
                        gain_reduction = 1.0 / 2.0
                        mixed_sample = sample * (threshold + (abs(sample) - threshold) * gain_reduction) * (1.0 if sample >= 0 else -1.0)
                    else:
                        mixed_sample = sample
                    mixed_sample *= (1.0 - modulation_depth * 0.3 * modulation)
                else:
                    mixed_sample = filtered[i]
                
                mixed_audio.append(mixed_sample)
            
            final_audio = mixed_audio
        else:
            # Apply regular LFO if mixing not enabled
            if lfo_enabled:
                lfo_signal = lfo.generate(lfo_freq, lfo_waveform, lfo_depth, len(filtered))
                final_audio = [f * (1 + l * 0.3) for f, l in zip(filtered, lfo_signal)]
            else:
                final_audio = filtered
        
        # Get visualization data (first 1000 samples)
        waveform_data = final_audio[:1000] if len(final_audio) > 1000 else final_audio
        
        return jsonify({
            'success': True,
            'processed_audio': final_audio,
            'waveform': waveform_data,
            'audio_type': 'processed_' + process_type,
            'original_length': len(audio_data),
            'processed_length': len(final_audio),
            'mixing_applied': mixing_enabled
        })
        
    except Exception as e:
        print(f"Error in /api/process_audio: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== ERROR HANDLERS ==========
@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(e):
    print(f"500 Error: {str(e)}")
    traceback.print_exc()
    return jsonify({'error': 'Internal server error'}), 500

# ========== APPLICATION ENTRY ==========
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
else:
    application = app
