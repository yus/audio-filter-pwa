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

# ========== AUDIO PROCESSING CLASSES ==========
class AudioFilter:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        
    def apply_lowpass(self, data, cutoff_freq, resonance=0.7):
        """Simple low-pass filter"""
        if not data or len(data) == 0:
            return data if data else []
            
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
        if not data or len(data) == 0:
            return data if data else []
            
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
        """Apply selected filter with validation"""
        if not data or len(data) == 0:
            return data if data else []
            
        if filter_type == 'lowpass':
            return self.apply_lowpass(data, cutoff, resonance)
        elif filter_type == 'highpass':
            return self.apply_highpass(data, cutoff, resonance)
        elif filter_type == 'bandpass':
            lowpassed = self.apply_lowpass(data, cutoff, resonance)
            return self.apply_highpass(lowpassed, cutoff, resonance)
        elif filter_type == 'none':
            return data
        else:
            return data

class AudioProcessor:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        self.filter = AudioFilter(sample_rate)
        
    def process(self, audio_data, params):
        """Main processing function with validation"""
        try:
            # Validate input
            if not audio_data or len(audio_data) == 0:
                raise ValueError("No audio data provided")
                
            if len(audio_data) > 44100 * 30:  # 30 seconds max
                audio_data = audio_data[:44100 * 30]
                print(f"Trimmed audio to {len(audio_data)} samples")
            
            # Apply filter
            filter_type = params.get('filter_type', 'lowpass')
            cutoff = float(params.get('cutoff_freq', 1000))
            resonance = float(params.get('resonance', 0.7))
            
            processed = self.filter.apply_filter(audio_data, filter_type, cutoff, resonance)
            
            # Normalize output
            if processed:
                max_val = max(abs(x) for x in processed) if processed else 1
                if max_val > 0:
                    processed = [x / max_val * 0.9 for x in processed]  # 0.9 to prevent clipping
            
            return processed
            
        except Exception as e:
            print(f"Processing error: {str(e)}")
            raise

# Initialize processor
processor = AudioProcessor()

# ========== ROUTES ==========
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    """Handle favicon requests to prevent 500 errors"""
    try:
        return send_from_directory('static', 'favicon.ico')
    except:
        # Return empty response instead of 500
        return '', 204

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
        'version': '2.0.0',
        'time': time.time()
    })

@app.route('/api/process_audio', methods=['POST'])
def process_audio():
    """Process audio with validation and error handling"""
    start_time = time.time()
    
    try:
        data = request.json or {}
        
        # Validate request
        if not data.get('audio_data'):
            return jsonify({
                'success': False,
                'error': 'No audio data provided',
                'code': 'NO_AUDIO_DATA'
            }), 400
        
        audio_data = data.get('audio_data', [])
        
        # Convert to list of floats with validation
        try:
            if isinstance(audio_data, list):
                audio_data = [float(x) for x in audio_data]
            else:
                return jsonify({
                    'success': False,
                    'error': 'Invalid audio data format',
                    'code': 'INVALID_FORMAT'
                }), 400
        except (ValueError, TypeError) as e:
            return jsonify({
                'success': False,
                'error': f'Invalid audio data: {str(e)}',
                'code': 'INVALID_DATA'
            }), 400
        
        # Validate audio data size
        if len(audio_data) == 0:
            return jsonify({
                'success': False,
                'error': 'Empty audio data',
                'code': 'EMPTY_DATA'
            }), 400
        
        if len(audio_data) > 44100 * 60:  # 60 seconds max
            return jsonify({
                'success': False,
                'error': 'Audio too long (max 60 seconds)',
                'code': 'AUDIO_TOO_LONG'
            }), 400
        
        print(f"Processing {len(audio_data)} samples...")
        
        # Get parameters with defaults
        params = {
            'filter_type': data.get('filter_type', 'lowpass'),
            'cutoff_freq': float(data.get('cutoff_freq', 1000)),
            'resonance': float(data.get('resonance', 0.7)),
            'lfo_enabled': bool(data.get('lfo_enabled', False)),
            'process_type': data.get('process_type', 'uploaded')
        }
        
        # Process audio
        processed = processor.process(audio_data, params)
        
        # Create response
        response_data = {
            'success': True,
            'processed_audio': processed,
            'original_length': len(audio_data),
            'processed_length': len(processed),
            'processing_time': time.time() - start_time,
            'sample_rate': 44100
        }
        
        # Add waveform preview (first 1000 samples)
        if len(processed) > 1000:
            response_data['waveform_preview'] = processed[:1000]
        
        print(f"Processing completed in {time.time() - start_time:.2f}s")
        return jsonify(response_data)
        
    except ValueError as e:
        print(f"Validation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'VALIDATION_ERROR'
        }), 400
        
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'INTERNAL_ERROR',
            'details': str(e)
        }), 500

# ========== ERROR HANDLERS ==========
@app.errorhandler(404)
def not_found(e):
    if request.path == '/favicon.ico':
        return '', 204  # No content for missing favicon
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': 'Method not allowed'}), 405

@app.errorhandler(500)
def server_error(e):
    print(f"500 Error: {str(e)}")
    return jsonify({'error': 'Internal server error'}), 500

# ========== APPLICATION ENTRY ==========
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)  # debug=False for production
else:
    application = app
