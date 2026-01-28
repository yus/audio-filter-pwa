from flask import Flask, render_template, jsonify, request, send_from_directory, abort
import math
import time
import os
import traceback

app = Flask(__name__, 
            static_folder='static',
            template_folder='templates')

# Get absolute paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# CORS headers
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# Handle OPTIONS requests for CORS
@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        return '', 200

# ========== STATIC FILES ==========
@app.route('/static/<path:filename>')
def serve_static(filename):
    try:
        return send_from_directory('static', filename)
    except:
        abort(404)

@app.route('/favicon.ico')
def favicon():
    try:
        return send_from_directory('static', 'favicon.ico')
    except:
        return '', 404

# ========== API ENDPOINTS ==========
@app.route('/api/health')
def health_check():
    return jsonify({
        'status': 'ok',
        'server_time': time.time(),
        'python_version': os.sys.version,
        'flask_ready': True
    })

@app.route('/api/generate', methods=['POST'])
def generate_waveform():
    try:
        data = request.get_json() or {}
        freq = float(data.get('frequency', 440))
        duration = float(data.get('duration', 1.0))
        
        # Limit to reasonable values
        freq = max(20, min(20000, freq))
        duration = max(0.1, min(5.0, duration))
        
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
            'samples': len(waveform)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

# ========== MAIN ROUTES ==========
@app.route('/')
def index():
    try:
        return render_template('index.html')
    except Exception as e:
        return f"""
        <html>
            <head><title>Audio Filter PWA</title></head>
            <body>
                <h1>Audio Filter PWA</h1>
                <p>Template rendering error: {str(e)}</p>
                <p>Template folder: {app.template_folder}</p>
                <p>Current directory: {os.getcwd()}</p>
            </body>
        </html>
        """, 500

@app.route('/<path:path>')
def catch_all(path):
    if path.startswith('api/'):
        abort(404)
    return render_template('index.html')

# ========== ERROR HANDLERS ==========
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'error': 'Internal server error',
        'message': str(error) if str(error) else 'Unknown error'
    }), 500

# ========== DEBUG INFO ==========
@app.route('/debug')
def debug_info():
    return jsonify({
        'cwd': os.getcwd(),
        'files': os.listdir('.'),
        'static_exists': os.path.exists('static'),
        'templates_exists': os.path.exists('templates'),
        'template_files': os.listdir('templates') if os.path.exists('templates') else [],
        'static_files': os.listdir('static') if os.path.exists('static') else []
    })
            
# ========== TEST ENDPOINT =========
@app.route('/test')
def test():
    return """
    <html>
        <head><title>Test Page</title></head>
        <body>
            <h1>Flask is working!</h1>
            <p>If you see this, Flask is running correctly.</p>
            <p><a href="/">Go to main app</a></p>
            <p><a href="/debug">Debug info</a></p>
            <p><a href="/api/health">API Health</a></p>
        </body>
    </html>
    """


# ========== APPLICATION START ==========
if __name__ == '__main__':
    app.run(debug=True)
else:
    application = app
