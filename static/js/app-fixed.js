// Audio Filter - ULTRA SIMPLE WORKING VERSION
console.log('Audio Filter LOADING...');

let uploadedAudio = null;
let processedAudio = null;
let audioContext = null;
let sourceNode = null;
let currentFilter = 'lowpass';

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready, setting up...');
    
    // Setup buttons
    setupButton('uploadBtn', uploadAudio);
    setupButton('processBtn', processAudio);
    setupButton('playBtn', playAudio);
    setupButton('stopBtn', stopAudio);
    setupButton('resetBtn', resetApp);
    
    // Setup filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter || 'lowpass';
            console.log('Filter set to:', currentFilter);
            showMessage('Filter: ' + currentFilter);
            if (uploadedAudio) processAudio();
        });
    });
    
    // Setup cutoff slider
    const cutoffSlider = document.getElementById('cutoffFreq');
    if (cutoffSlider) {
        cutoffSlider.addEventListener('input', function() {
            const valueEl = document.getElementById('cutoffValue');
            if (valueEl) valueEl.textContent = this.value + ' Hz';
            if (uploadedAudio) processAudio();
        });
    }
    
    // Setup canvas
    const canvas = document.getElementById('waveVisualizer');
    if (canvas) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        drawEmpty(canvas);
    }
    
    showMessage('Ready - Upload audio to begin');
    console.log('Setup complete');
});

function setupButton(id, handler) {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('click', handler);
        console.log('Button', id, 'setup OK');
    } else {
        console.log('Button', id, 'not found');
    }
}

function uploadAudio() {
    console.log('Upload clicked');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = handleFileSelect;
    input.click();
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('File selected:', file.name);
    showMessage('Loading audio...');
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        uploadedAudio = {
            buffer: audioBuffer,
            data: audioBuffer.getChannelData(0),
            sampleRate: audioBuffer.sampleRate,
            duration: audioBuffer.duration
        };
        
        console.log('Audio loaded:', uploadedAudio.data.length, 'samples');
        drawWaveform(uploadedAudio.data, '#48bb78');
        showMessage('Audio loaded! Click Process to filter.');
        
    } catch (error) {
        console.error('Upload error:', error);
        showMessage('Upload failed: ' + error.message, true);
    }
}

async function processAudio() {
    if (!uploadedAudio) {
        showMessage('Please upload audio first', true);
        return;
    }
    
    showMessage('Processing...');
    
    try {
        // Get cutoff value
        const cutoffSlider = document.getElementById('cutoffFreq');
        const cutoffValue = cutoffSlider ? parseFloat(cutoffSlider.value) : 1000;
        
        // Limit data size
        const maxSamples = 44100 * 5; // 5 seconds
        const audioData = uploadedAudio.data.slice(0, Math.min(uploadedAudio.data.length, maxSamples));
        const audioArray = Array.from(audioData);
        
        const requestData = {
            audio_data: audioArray,
            filter_type: currentFilter,
            cutoff_freq: cutoffValue,
            resonance: 0.7,
            lfo_enabled: false,
            process_type: 'uploaded'
        };
        
        console.log('Sending to server...');
        
        const response = await fetch('/api/process_audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            processedAudio = {
                data: data.processed_audio,
                sampleRate: uploadedAudio.sampleRate
            };
            
            drawWaveform(data.processed_audio, '#667eea');
            showMessage('Processing complete! Click Play to hear.');
        } else {
            throw new Error(data.error || 'Processing failed');
        }
        
    } catch (error) {
        console.error('Process error:', error);
        showMessage('Processing failed: ' + error.message, true);
    }
}

async function playAudio() {
    if (!processedAudio && !uploadedAudio) {
        showMessage('No audio to play', true);
        return;
    }
    
    const audioToPlay = processedAudio || uploadedAudio;
    console.log('Playing:', processedAudio ? 'processed' : 'original');
    
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    stopAudio();
    
    try {
        let audioBuffer;
        if (audioToPlay.buffer) {
            audioBuffer = audioToPlay.buffer;
        } else {
            audioBuffer = audioContext.createBuffer(1, audioToPlay.data.length, audioToPlay.sampleRate);
            const channel = audioBuffer.getChannelData(0);
            
            // Normalize
            let max = 0.001;
            for (const sample of audioToPlay.data) {
                const abs = Math.abs(sample);
                if (abs > max) max = abs;
            }
            
            const scale = 0.8 / max;
            for (let i = 0; i < audioToPlay.data.length; i++) {
                channel[i] = audioToPlay.data[i] * scale;
            }
        }
        
        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(audioContext.destination);
        sourceNode.start();
        
        showMessage('Playing...');
        
        sourceNode.onended = () => {
            sourceNode = null;
            showMessage('Playback finished');
        };
        
    } catch (error) {
        console.error('Play error:', error);
        showMessage('Play failed: ' + error.message, true);
    }
}

function stopAudio() {
    if (sourceNode) {
        try {
            sourceNode.stop();
            sourceNode.disconnect();
        } catch (e) {
            // Ignore
        }
        sourceNode = null;
    }
}

function resetApp() {
    stopAudio();
    uploadedAudio = null;
    processedAudio = null;
    const canvas = document.getElementById('waveVisualizer');
    if (canvas) drawEmpty(canvas);
    showMessage('Reset complete');
}

function drawEmpty(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth;
    const h = canvas.height = canvas.offsetHeight;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Upload audio to begin', w/2, h/2);
    ctx.textAlign = 'left';
}

function drawWaveform(data, color) {
    const canvas = document.getElementById('waveVisualizer');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth;
    const h = canvas.height = canvas.offsetHeight;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const skip = Math.max(1, Math.floor(data.length / w));
    
    for (let i = 0; i < data.length; i += skip) {
        const x = (i / data.length) * w;
        const y = (1 - (data[i] + 1) / 2) * h;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    
    ctx.stroke();
}

function showMessage(text, isError = false) {
    console.log(isError ? 'ERROR:' : 'INFO:', text);
    
    // Update status element if exists
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = isError ? '#f56565' : '#48bb78';
    }
    
    // Also show as alert for testing
    if (isError) alert('ERROR: ' + text);
}
