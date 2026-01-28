from flask import Flask, render_template, jsonify, request, send_from_directory
import math
import time
import os

app = Flask(__name__)

# CORS headers
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

# Static files
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

# Manifest
@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

# API Routes
@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'time': time.time()
    })

@app.route('/api/generate', methods=['POST'])
def generate():
    data = request.json
    freq = data.get('frequency', 440)
    
    # Generate simple waveform
    samples = 1000
    waveform = []
    for i in range(samples):
        t = i / 44100
        value = math.sin(2 * math.pi * freq * t)
        waveform.append(value)
    
    return jsonify({'waveform': waveform})

# Main route
@app.route('/')
def index():
    return render_template('index.html')

# For Vercel
if __name__ == '__main__':
    app.run(debug=True)
else:
    application = app
