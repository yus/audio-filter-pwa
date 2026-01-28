from flask import Flask, render_template, jsonify, request, send_from_directory, make_response
import math
import time
import os

app = Flask(__name__, static_folder='static', template_folder='templates')

# Enable CORS for all routes
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Handle OPTIONS requests for CORS
@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response

# Serve static files with correct MIME types
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

# Serve manifest
@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('static', 'manifest.json')

# API Health Check
@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'time': time.time(),
        'message': 'Audio Filter PWA API is running',
        'endpoints': {
            'generate_waveform': '/api/generate (POST)',
            'synthesize': '/api/synthesize (POST)',
            'health': '/api/health (GET)'
        }
    })

# Generate waveform endpoint
@app.route('/api/generate', methods=['POST', 'OPTIONS'])
def generate_waveform():
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        freq = float(data.get('frequency', 440))
        duration = float(data.get('duration', 1.0))
        
        # Generate waveform
        samples = min(1000, int(44100 * duration))
        waveform = []
        for i in range(samples):
            t = i / 44100
            value = math.sin(2 * math.pi * freq * t)
            waveform.append(float(value))
        
        return jsonify({
            'success': True,
            'waveform': waveform,
            'frequency': freq,
            'duration': duration,
            'samples': samples
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Synthesize audio endpoint
@app.route('/api/synthesize', methods=['POST', 'OPTIONS'])
def synthesize():
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        freq = float(data.get('frequency', 440))
        duration = float(data.get('duration', 1.0))
        waveform_type = data.get('waveform', 'sine')
        
        samples = min(10000, int(44100 * duration))
        audio = []
        
        for i in range(samples):
            t = i / 44100
            
            if waveform_type == 'sine':
                value = math.sin(2 * math.pi * freq * t)
            elif waveform_type == 'square':
                value = 1.0 if math.sin(2 * math.pi * freq * t) >= 0 else -1.0
            elif waveform_type == 'sawtooth':
                frac = freq * t - int(freq * t)
                value = 2 * frac - 1
            elif waveform_type == 'triangle':
                frac = freq * t - int(freq * t)
                value = 4 * abs(frac - 0.5) - 1
            else:
                value = 0
            
            audio.append(float(value))
        
        # Simple envelope
        for i in range(len(audio)):
            if i < 100:  # fade in
                audio[i] *= i / 100
            elif i > len(audio) - 100:  # fade out
                audio[i] *= (len(audio) - i) / 100
        
        return jsonify({
            'success': True,
            'audio': audio[:1000],  # First 1000 samples
            'sample_rate': 44100,
            'duration': duration,
            'waveform': waveform_type
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Main route
@app.route('/')
def index():
    return render_template('index.html')

# Catch-all for SPA routing
@app.route('/<path:path>')
def catch_all(path):
    if path.startswith('api/') or path.startswith('static/'):
        return '', 404
    return render_template('index.html')

# Error handlers
@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error'}), 500

# Application entry point
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
else:
    application = app
