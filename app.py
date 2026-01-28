from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
import math
import json
import time
import os

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# ========== STATIC FILE ROUTES (MUST COME FIRST) ==========
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/favicon.ico')
def favicon():
    return send_from_directory('static', 'favicon.ico', mimetype='image/vnd.microsoft.icon')

# ========== API ROUTES ==========
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'message': 'Audio Filter PWA is running',
        'timestamp': time.time(),
        'version': '1.0.0'
    })

@app.route('/api/generate_waveform', methods=['POST'])
def generate_waveform():
    """Generate audio waveform for visualization without numpy"""
    try:
        data = request.json
        freq = data.get('frequency', 440)
        duration = data.get('duration', 1.0)
        samples = int(44100 * duration)
        
        # Generate sine wave
        waveform = []
        for i in range(min(1000, samples)):  # Only first 1000 points
            t = i / 44100
            value = math.sin(2 * math.pi * freq * t)
            waveform.append(value)
        
        # Apply LFO if requested
        if data.get('lfo_enabled', False):
            lfo_signal = LFO().generate(
                data.get('lfo_freq', 5),
                data.get('lfo_waveform', 'sine'),
                data.get('lfo_depth', 0.5),
                len(waveform)
            )
            waveform = [w * (1 + l * 0.5) for w, l in zip(waveform, lfo_signal)]
        
        return jsonify({
            'waveform': waveform,
            'sampling_rate': 44100
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/process_audio', methods=['POST'])
def process_audio():
    """Process audio data with filters"""
    try:
        data = request.json
        audio_data = data.get('audio_data', [])
        
        if not audio_data:
            # Generate test audio if none provided
            duration = data.get('duration', 1.0)
            freq = data.get('frequency', 440)
            samples = int(44100 * duration)
            audio_data = [math.sin(2 * math.pi * freq * (i/44100)) 
                         for i in range(min(1000, samples))]
        
        # Apply filter
        filtered = AudioFilter().apply_filter(
            audio_data,
            data.get('filter_type', 'lowpass'),
            data.get('cutoff_freq', 1000),
            data.get('resonance', 0.7)
        )
        
        # Apply LFO modulation if enabled
        if data.get('lfo_enabled', False):
            lfo_signal = LFO().generate(
                data.get('lfo_freq', 5),
                data.get('lfo_waveform', 'sine'),
                data.get('lfo_depth', 0.5),
                len(filtered)
            )
            filtered = [f * (1 + l * 0.3) for f, l in zip(filtered, lfo_signal)]
        
        # Calculate RMS
        original_rms = math.sqrt(sum(x*x for x in audio_data) / len(audio_data)) if audio_data else 0
        processed_rms = math.sqrt(sum(x*x for x in filtered) / len(filtered)) if filtered else 0
        
        return jsonify({
            'processed_audio': filtered,
            'original_rms': original_rms,
            'processed_rms': processed_rms
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
        
        samples = int(44100 * duration)
        audio = []
        
        # Generate waveform
        for i in range(min(samples, 10000)):  # Limit to 10000 samples max
            t = i / 44100
            
            if waveform_type == 'sine':
                value = math.sin(2 * math.pi * freq * t)
            elif waveform_type == 'square':
                value = 1.0 if math.sin(2 * math.pi * freq * t) >= 0 else -1.0
            elif waveform_type == 'sawtooth':
                value = 2 * (freq * t - math.floor(freq * t + 0.5))
            elif waveform_type == 'triangle':
                value = 2 * abs(2 * (freq * t - math.floor(freq * t + 0.5))) - 1
            else:
                value = 0
                
            audio.append(value)
        
        # Apply ADSR envelope
        attack = min(0.1, duration * 0.1)
        decay = min(0.1, duration * 0.1)
        sustain_level = 0.7
        release = min(0.2, duration * 0.2)
        
        # Calculate envelope
        attack_samples = int(attack * 44100)
        decay_samples = int(decay * 44100)
        release_samples = int(release * 44100)
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
            
            audio[i] = audio[i] * envelope
        
        # Normalize
        max_val = max(abs(x) for x in audio) if audio else 0
        if max_val > 0:
            audio = [x / max_val for x in audio]
        
        return jsonify({
            'audio': audio[:1000],  # First 1000 samples
            'sample_rate': 44100,
            'duration': duration,
            'max_amplitude': max_val
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ========== CLASS DEFINITIONS ==========
class AudioFilter:
    def __init__(self):
        self.sample_rate = 44100
        
    def apply_filter(self, audio_data, filter_type='lowpass', cutoff=1000, resonance=0.7):
        """Simple filter implementation without numpy"""
        if not audio_data:
            return audio_data
            
        filtered = []
        
        if filter_type == 'lowpass':
            # Simple RC low-pass filter
            rc = 1.0 / (cutoff * 2 * math.pi)
            dt = 1.0 / self.sample_rate
            alpha = dt / (rc + dt)
            
            y_prev = audio_data[0]
            for sample in audio_data:
                y = y_prev + alpha * (sample - y_prev)
                filtered.append(y)
                y_prev = y
                
        elif filter_type == 'highpass':
            # Simple RC high-pass filter
            rc = 1.0 / (cutoff * 2 * math.pi)
            dt = 1.0 / self.sample_rate
            alpha = rc / (rc + dt)
            
            y_prev = audio_data[0]
            x_prev = audio_data[0]
            for sample in audio_data:
                y = alpha * (y_prev + sample - x_prev)
                filtered.append(y)
                y_prev = y
                x_prev = sample
                
        else:
            # For other filters, return as-is for now
            filtered = audio_data[:]
            
        return filtered

class LFO:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        self.phase = 0
        
    def generate(self, frequency, waveform='sine', depth=1.0, length=1000):
        """Generate LFO signal without numpy"""
        signal = []
        for i in range(length):
            t = i / self.sample_rate
            angle = 2 * math.pi * frequency * t + self.phase
            
            if waveform == 'sine':
                value = math.sin(angle)
            elif waveform == 'triangle':
                frac = frequency * t - math.floor(frequency * t)
                if frac < 0.25:
                    value = 4 * frac
                elif frac < 0.75:
                    value = 2 - 4 * frac
                else:
                    value = 4 * frac - 4
            elif waveform == 'square':
                value = 1.0 if math.sin(angle) >= 0 else -1.0
            elif waveform == 'sawtooth':
                value = 2 * (frequency * t - math.floor(frequency * t + 0.5))
            else:
                value = 0
                
            signal.append(value * depth)
        
        self.phase += 2 * math.pi * frequency * length / self.sample_rate
        return signal

# ========== MAIN APP ROUTE (MUST COME LAST) ==========
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    """Catch-all route for SPA - MUST BE LAST"""
    if path and os.path.exists(os.path.join(app.template_folder, path)):
        return render_template(path)
    return render_template('index.html')

# ========== ERROR HANDLERS ==========
@app.errorhandler(404)
def not_found(e):
    return render_template('index.html'), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

# ========== APPLICATION ENTRY POINT ==========
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
else:
    # For Vercel serverless
    application = app
