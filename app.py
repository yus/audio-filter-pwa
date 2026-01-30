from flask import Flask, render_template, jsonify, request, send_from_directory
import math
import time
import json
import os
import numpy as np
from io import BytesIO
import base64

app = Flask(__name__, 
            static_folder='static',
            template_folder='templates',
            static_url_path='/static')

# ========== AUDIO PROCESSING CLASSES ==========
class AudioFilter:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        
    def apply_lowpass(self, data, cutoff_freq, resonance=0.7):
        """Simple low-pass filter"""
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
        """Simple high-pass filter"""
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
        
        max_val = max(abs(x) for x in audio) if audio else 1
        if max_val > 0:
            audio = [x / max_val for x in audio]
        
        return audio

class AudioMixer:
    """New class for proper audio mixing/modulation"""
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        
    def mix_with_modulation(self, audio_data, modulation_params):
        """
        Mix uploaded audio with modulation (like compressor/sidechain)
        modulation_params = {
            'enabled': bool,
            'modulation_type': 'sidechain' or 'tremolo',
            'lfo_freq': float,
            'lfo_waveform': str,
            'lfo_depth': float,
            'threshold': float,
            'ratio': float,
            'attack': float,
            'release': float
        }
        """
        if not modulation_params.get('enabled', False):
            return audio_data
            
        if not audio_data:
            return audio_data
            
        modulation_type = modulation_params.get('modulation_type', 'sidechain')
        lfo_freq = modulation_params.get('lfo_freq', 5)
        lfo_waveform = modulation_params.get('lfo_waveform', 'sine')
        lfo_depth = modulation_params.get('lfo_depth', 0.5)
        
        # Generate modulation signal
        lfo = LFO(self.sample_rate)
        lfo_signal = lfo.generate(lfo_freq, lfo_waveform, lfo_depth, len(audio_data))
        
        # Normalize LFO signal to 0-1 range
        if lfo_signal:
            min_lfo = min(lfo_signal)
            max_lfo = max(lfo_signal)
            if max_lfo > min_lfo:
                lfo_signal = [(l - min_lfo) / (max_lfo - min_lfo) for l in lfo_signal]
        
        mixed_audio = []
        
        if modulation_type == 'sidechain':
            # Sidechain compression-like effect
            for i, sample in enumerate(audio_data):
                # Use LFO to modulate gain (compressor-like)
                gain_reduction = 1.0 - (lfo_signal[i] * lfo_depth if i < len(lfo_signal) else 0)
                mixed_audio.append(sample * gain_reduction)
                
        elif modulation_type == 'tremolo':
            # Tremolo effect (amplitude modulation)
            for i, sample in enumerate(audio_data):
                modulation = 1.0 - (lfo_signal[i] * lfo_depth * 0.5 if i < len(lfo_signal) else 0)
                mixed_audio.append(sample * modulation)
                
        else:
            # Simple amplitude modulation
            for i, sample in enumerate(audio_data):
                modulation = 1.0 + (lfo_signal[i] * lfo_depth if i < len(lfo_signal) else 0)
                mixed_audio.append(sample * modulation)
        
        return mixed_audio

# Initialize processors
audio_filter = AudioFilter()
lfo = LFO()
synthesizer = AudioSynthesizer()
mixer = AudioMixer()

# Track uploaded/recorded audio in memory
uploaded_audio_store = {}
recorded_audio_store = {}

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
        'version': '1.1.0',
        'features': ['synthesizer', 'filter', 'lfo', 'mixer', 'upload', 'record', 'pwa'],
        'time': time.time()
    })

@app.route('/api/generate', methods=['POST'])
def generate():
    """Generate waveform for visualization - SYNTHESIZED AUDIO ONLY"""
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
        
        # Generate audio - SYNTHESIZED ONLY
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
            'full_audio': audio[:44100],
            'audio_type': 'synthesized',
            'frequency': freq,
            'duration': duration,
            'samples': len(audio),
            'sample_rate': 44100
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/synthesize', methods=['POST'])
def synthesize():
    """Synthesize complete audio - SYNTHESIZED AUDIO ONLY"""
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
        
        # Generate audio - SYNTHESIZED ONLY
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
            'audio_type': 'synthesized',
            'sample_rate': 44100,
            'duration': duration,
            'format': 'float32'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/upload_audio', methods=['POST'])
def upload_audio():
    """Handle uploaded audio - stores separately from synthesized"""
    try:
        data = request.json or {}
        audio_data = data.get('audio_data', [])
        
        if not audio_data:
            return jsonify({'success': False, 'error': 'No audio data provided'}), 400
        
        # Convert to list of floats
        audio_data = [float(x) for x in audio_data]
        
        # Store with session ID
        session_id = data.get('session_id', 'default')
        uploaded_audio_store[session_id] = {
            'audio': audio_data,
            'timestamp': time.time(),
            'length': len(audio_data)
        }
        
        # Get first 1000 samples for visualization
        waveform_data = audio_data[:1000] if len(audio_data) > 1000 else audio_data
        
        return jsonify({
            'success': True,
            'message': 'Audio uploaded successfully',
            'waveform': waveform_data,
            'audio_type': 'uploaded',
            'samples': len(audio_data),
            'session_id': session_id
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Audio mixing route
@app.route('/api/mix_audio', methods=['POST'])
def mix_audio():
    """Proper audio mixing endpoint that works with existing frontend"""
    try:
        data = request.json or {}
        audio_data = data.get('audio_data', [])
        
        if not audio_data:
            return jsonify({'success': False, 'error': 'No audio data provided'}), 400
        
        # Convert to list of floats
        audio_data = [float(x) for x in audio_data]
        
        # Get mixing parameters
        mix_enabled = data.get('mix_enabled', False)
        mix_type = data.get('mix_type', 'compressor')  # 'compressor', 'tremolo', 'sidechain'
        mix_rate = float(data.get('mix_rate', 5))
        mix_depth = float(data.get('mix_depth', 0.5))
        
        if not mix_enabled:
            # Just apply regular filter if mixing is disabled
            filter_type = data.get('filter_type', 'lowpass')
            cutoff = float(data.get('cutoff_freq', 1000))
            resonance = float(data.get('resonance', 0.7))
            
            if filter_type != 'none':
                filtered = audio_filter.apply_filter(audio_data, filter_type, cutoff, resonance)
                return jsonify({
                    'success': True,
                    'processed_audio': filtered,
                    'mixing_applied': False
                })
            else:
                return jsonify({
                    'success': True,
                    'processed_audio': audio_data,
                    'mixing_applied': False
                })
        
        # Apply mixing effect
        mixed_audio = []
        sample_rate = 44100
        
        for i in range(len(audio_data)):
            t = i / sample_rate
            
            # Generate modulation signal
            if mix_type == 'compressor':
                # Compressor-like effect: reduce dynamic range
                modulation = 0.5 + 0.5 * math.sin(2 * math.pi * mix_rate * t)
                threshold = 0.3
                ratio = 2.0
                
                # Simple compression algorithm
                sample = audio_data[i]
                if abs(sample) > threshold:
                    gain_reduction = 1.0 / ratio
                    mixed_sample = sample * (threshold + (abs(sample) - threshold) * gain_reduction) * (1.0 if sample >= 0 else -1.0)
                else:
                    mixed_sample = sample
                    
                # Apply modulation
                mixed_sample *= (1.0 - mix_depth * 0.3 * modulation)
                
            elif mix_type == 'tremolo':
                # Tremolo effect: amplitude modulation
                modulation = 0.5 + 0.5 * math.sin(2 * math.pi * mix_rate * t)
                mixed_sample = audio_data[i] * (1.0 - mix_depth * 0.5 * modulation)
                
            elif mix_type == 'sidechain':
                # Sidechain effect: rhythmic volume ducking
                modulation = 0.5 + 0.5 * math.sin(2 * math.pi * mix_rate * t)
                mixed_sample = audio_data[i] * (0.3 + 0.7 * modulation) * (1.0 - mix_depth * 0.7)
                
            else:
                mixed_sample = audio_data[i]
            
            mixed_audio.append(mixed_sample)
        
        # Apply filter after mixing
        filter_type = data.get('filter_type', 'lowpass')
        cutoff = float(data.get('cutoff_freq', 1000))
        resonance = float(data.get('resonance', 0.7))
        
        if filter_type != 'none':
            mixed_audio = audio_filter.apply_filter(mixed_audio, filter_type, cutoff, resonance)
        
        return jsonify({
            'success': True,
            'processed_audio': mixed_audio,
            'mixing_applied': True,
            'mix_type': mix_type,
            'original_length': len(audio_data),
            'processed_length': len(mixed_audio)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/process_audio', methods=['POST'])
def process_audio():
    """Process UPLOADED/RECORDED audio only - NOT synthesized"""
    try:
        data = request.json or {}
        session_id = data.get('session_id', 'default')
        process_type = data.get('process_type', 'uploaded')  # 'uploaded' or 'recorded'
        
        # Get the correct audio source
        if process_type == 'uploaded':
            if session_id not in uploaded_audio_store:
                return jsonify({'success': False, 'error': 'No uploaded audio found'}), 404
            audio_source = uploaded_audio_store[session_id]['audio']
        elif process_type == 'recorded':
            if session_id not in recorded_audio_store:
                return jsonify({'success': False, 'error': 'No recorded audio found'}), 404
            audio_source = recorded_audio_store[session_id]['audio']
        else:
            return jsonify({'success': False, 'error': 'Invalid process type'}), 400
        
        # Get processing parameters
        filter_type = data.get('filter_type', 'lowpass')
        cutoff = float(data.get('cutoff_freq', 1000))
        resonance = float(data.get('resonance', 0.7))
        lfo_enabled = bool(data.get('lfo_enabled', False))
        lfo_freq = float(data.get('lfo_freq', 5))
        lfo_waveform = data.get('lfo_waveform', 'sine')
        lfo_depth = float(data.get('lfo_depth', 0.5))
        
        # NEW: Get mixing parameters
        mixing_enabled = bool(data.get('mixing_enabled', False))
        modulation_params = {
            'enabled': mixing_enabled,
            'modulation_type': data.get('modulation_type', 'sidechain'),
            'lfo_freq': lfo_freq,
            'lfo_waveform': lfo_waveform,
            'lfo_depth': lfo_depth,
            'threshold': float(data.get('threshold', 0.5)),
            'ratio': float(data.get('ratio', 2.0)),
            'attack': float(data.get('attack', 0.01)),
            'release': float(data.get('release', 0.1))
        }
        
        # Apply processing in correct order
        processed_audio = audio_source.copy()
        
        # 1. First apply filter
        if filter_type != 'none':
            processed_audio = audio_filter.apply_filter(processed_audio, filter_type, cutoff, resonance)
        
        # 2. Then apply mixing/modulation if enabled
        if mixing_enabled:
            processed_audio = mixer.mix_with_modulation(processed_audio, modulation_params)
        # 3. Otherwise apply regular LFO if mixing not enabled but LFO is
        elif lfo_enabled:
            lfo_signal = lfo.generate(lfo_freq, lfo_waveform, lfo_depth, len(processed_audio))
            processed_audio = [f * (1 + l * 0.3) for f, l in zip(processed_audio, lfo_signal)]
        
        # Store processed audio
        processed_key = f"{session_id}_processed"
        if process_type == 'uploaded':
            uploaded_audio_store[processed_key] = {
                'audio': processed_audio,
                'timestamp': time.time(),
                'length': len(processed_audio),
                'source': 'processed_uploaded'
            }
        else:
            recorded_audio_store[processed_key] = {
                'audio': processed_audio,
                'timestamp': time.time(),
                'length': len(processed_audio),
                'source': 'processed_recorded'
            }
        
        # Get visualization data
        waveform_data = processed_audio[:1000] if len(processed_audio) > 1000 else processed_audio
        
        return jsonify({
            'success': True,
            'processed_audio': processed_audio,
            'waveform': waveform_data,
            'audio_type': 'processed_' + process_type,
            'original_length': len(audio_source),
            'processed_length': len(processed_audio),
            'mixing_applied': mixing_enabled,
            'session_id': session_id,
            'processed_key': processed_key
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/record_audio', methods=['POST'])
def record_audio():
    """Handle microphone recording"""
    try:
        data = request.json or {}
        audio_data = data.get('audio_data', [])
        action = data.get('action', 'store')  # 'store', 'clear', 'deactivate'
        session_id = data.get('session_id', 'default')
        
        if action == 'clear' or action == 'deactivate':
            if session_id in recorded_audio_store:
                del recorded_audio_store[session_id]
            return jsonify({
                'success': True,
                'message': f'Recording {action}ed',
                'session_id': session_id
            })
        
        if not audio_data:
            return jsonify({'success': False, 'error': 'No audio data provided'}), 400
        
        # Convert to list of floats
        audio_data = [float(x) for x in audio_data]
        
        # Store recording
        recorded_audio_store[session_id] = {
            'audio': audio_data,
            'timestamp': time.time(),
            'length': len(audio_data),
            'active': True
        }
        
        # Get first 1000 samples for visualization
        waveform_data = audio_data[:1000] if len(audio_data) > 1000 else audio_data
        
        return jsonify({
            'success': True,
            'message': 'Audio recorded successfully',
            'waveform': waveform_data,
            'audio_type': 'recorded',
            'samples': len(audio_data),
            'session_id': session_id,
            'is_active': True
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/get_audio/<audio_type>/<session_id>', methods=['GET'])
def get_audio(audio_type, session_id):
    """Get audio data by type and session ID"""
    try:
        if audio_type == 'uploaded':
            if session_id in uploaded_audio_store:
                audio_data = uploaded_audio_store[session_id]['audio']
                return jsonify({
                    'success': True,
                    'audio': audio_data[:44100],  # First second
                    'audio_type': 'uploaded',
                    'session_id': session_id
                })
        elif audio_type == 'recorded':
            if session_id in recorded_audio_store:
                audio_data = recorded_audio_store[session_id]['audio']
                return jsonify({
                    'success': True,
                    'audio': audio_data[:44100],
                    'audio_type': 'recorded',
                    'session_id': session_id
                })
        elif audio_type == 'synthesized':
            # For synthesized, we need parameters - can't store all combinations
            return jsonify({'success': False, 'error': 'Use /api/synthesize for synthesized audio'}), 400
        
        return jsonify({'success': False, 'error': 'Audio not found'}), 404
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/clear_audio', methods=['POST'])
def clear_audio():
    """Clear all stored audio for a session"""
    try:
        data = request.json or {}
        session_id = data.get('session_id', 'default')
        
        if session_id in uploaded_audio_store:
            del uploaded_audio_store[session_id]
        
        if session_id in recorded_audio_store:
            del recorded_audio_store[session_id]
        
        # Also clear any processed versions
        processed_keys = [k for k in uploaded_audio_store.keys() if session_id in k]
        for key in processed_keys:
            del uploaded_audio_store[key]
        
        processed_keys = [k for k in recorded_audio_store.keys() if session_id in k]
        for key in processed_keys:
            del recorded_audio_store[key]
        
        return jsonify({
            'success': True,
            'message': 'Audio cleared successfully',
            'session_id': session_id
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
