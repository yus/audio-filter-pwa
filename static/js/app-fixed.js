// Audio Filter - COMPLETE WORKING VERSION
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
        
        // Set initial value display
        const valueEl = document.getElementById('cutoffValue');
        if (valueEl) valueEl.textContent = cutoffSlider.value + ' Hz';
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
    
    console.log('File selected:', file.name, '(', (file.size / 1024 / 1024).toFixed(2), 'MB)');
    showMessage('Loading audio...');
    
    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Create audio context on first user interaction
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Decode audio data
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        uploadedAudio = {
            buffer: audioBuffer,
            data: audioBuffer.getChannelData(0),
            sampleRate: audioBuffer.sampleRate,
            duration: audioBuffer.duration,
            fileName: file.name
        };
        
        console.log('Audio loaded:', uploadedAudio.data.length, 'samples,', 
                   uploadedAudio.duration.toFixed(2), 'seconds,',
                   uploadedAudio.sampleRate, 'Hz');
        
        // Visualize the uploaded audio
        drawWaveform(uploadedAudio.data, '#48bb78');
        
        // Auto-process with current filter
        setTimeout(() => processAudio(), 100);
        
        showMessage(`Loaded: ${uploadedAudio.duration.toFixed(2)}s - Click Process to filter`);
        
    } catch (error) {
        console.error('Upload error:', error);
        showDetailedError(error, 'Upload');
    }
}

async function processAudio() {
    if (!uploadedAudio) {
        showMessage('Please upload audio first', true);
        return;
    }
    
    showMessage('Processing audio...');
    
    try {
        // Get parameters from UI
        const cutoffSlider = document.getElementById('cutoffFreq');
        const cutoffValue = cutoffSlider ? parseFloat(cutoffSlider.value) : 1000;
        
        console.log(`Processing with filter: ${currentFilter}, cutoff: ${cutoffValue}Hz`);
        
        // Create a fresh copy of audio data to avoid detached ArrayBuffer
        const originalData = uploadedAudio.data;
        const maxProcessingSamples = 44100 * 30; // Process max 30 seconds for performance
        
        // Determine how many samples to process
        let samplesToProcess = originalData.length;
        if (samplesToProcess > maxProcessingSamples) {
            samplesToProcess = maxProcessingSamples;
            console.log(`Limiting processing to first ${maxProcessingSamples} samples (${(maxProcessingSamples/44100).toFixed(1)}s)`);
        }
        
        // Copy data to regular array (prevents detached ArrayBuffer issues)
        const audioArray = new Array(samplesToProcess);
        for (let i = 0; i < samplesToProcess; i++) {
            audioArray[i] = originalData[i];
        }
        
        console.log(`Sending ${audioArray.length} samples to server...`);
        
        // Prepare request data
        const requestData = {
            audio_data: audioArray,
            filter_type: currentFilter,
            cutoff_freq: cutoffValue,
            resonance: 0.7,
            lfo_enabled: false,
            process_type: 'uploaded'
        };
        
        // Send to server
        const response = await fetch('/api/process_audio', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        // Check response status
        if (!response.ok) {
            let errorMsg = `Server error: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg += ` - ${errorData.error || 'Unknown error'}`;
            } catch (e) {
                // Could not parse JSON error response
            }
            throw new Error(errorMsg);
        }
        
        // Parse response
        const data = await response.json();
        
        if (data.success) {
            // Store processed audio
            processedAudio = {
                data: data.processed_audio,
                sampleRate: uploadedAudio.sampleRate,
                duration: data.processed_audio.length / uploadedAudio.sampleRate
            };
            
            console.log(`Processing complete: ${data.processed_length} samples, ${(data.processing_time || 0).toFixed(2)}s`);
            
            // Visualize processed audio
            drawWaveform(data.processed_audio, '#667eea');
            
            showMessage(`Processed! ${processedAudio.duration.toFixed(2)}s - Click Play to hear`);
            
        } else {
            throw new Error(data.error || 'Processing failed on server');
        }
        
    } catch (error) {
        console.error('Process error:', error);
        showDetailedError(error, 'Processing');
    }
}

async function playAudio() {
    // Determine which audio to play (processed first, then original)
    const audioToPlay = processedAudio || uploadedAudio;
    
    if (!audioToPlay) {
        showMessage('No audio to play. Please upload audio first.', true);
        return;
    }
    
    console.log('Playing:', processedAudio ? 'processed' : 'original', 'audio');
    
    // Ensure audio context exists and is resumed
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    // Stop any currently playing audio
    stopAudio();
    
    try {
        let audioBuffer;
        
        if (audioToPlay.buffer) {
            // Use existing AudioBuffer
            audioBuffer = audioToPlay.buffer;
        } else {
            // Create new AudioBuffer from array data
            audioBuffer = audioContext.createBuffer(
                1, // mono
                audioToPlay.data.length,
                audioToPlay.sampleRate
            );
            
            const channelData = audioBuffer.getChannelData(0);
            
            // Copy and normalize data to prevent clipping
            let maxAmplitude = 0.001;
            for (const sample of audioToPlay.data) {
                const absSample = Math.abs(sample);
                if (absSample > maxAmplitude) maxAmplitude = absSample;
            }
            
            const normalizeFactor = 0.8 / maxAmplitude; // 0.8 for headroom
            
            for (let i = 0; i < audioToPlay.data.length; i++) {
                channelData[i] = audioToPlay.data[i] * normalizeFactor;
            }
        }
        
        // Create and play audio source
        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(audioContext.destination);
        
        // Set up playback completion handler
        sourceNode.onended = () => {
            sourceNode = null;
            showMessage('Playback finished');
        };
        
        // Start playback
        sourceNode.start();
        
        showMessage(`Playing ${processedAudio ? 'processed' : 'original'} audio...`);
        
    } catch (error) {
        console.error('Play error:', error);
        showDetailedError(error, 'Playback');
    }
}

function stopAudio() {
    if (sourceNode) {
        try {
            sourceNode.stop();
            sourceNode.disconnect();
        } catch (e) {
            // Source might already be stopped, ignore error
        }
        sourceNode = null;
    }
}

function resetApp() {
    // Stop any playing audio
    stopAudio();
    
    // Clear audio data
    uploadedAudio = null;
    processedAudio = null;
    
    // Reset filter UI
    currentFilter = 'lowpass';
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === 'lowpass') {
            btn.classList.add('active');
        }
    });
    
    // Reset cutoff slider
    const cutoffSlider = document.getElementById('cutoffFreq');
    if (cutoffSlider) {
        cutoffSlider.value = 1000;
        const valueEl = document.getElementById('cutoffValue');
        if (valueEl) valueEl.textContent = '1000 Hz';
    }
    
    // Clear visualization
    const canvas = document.getElementById('waveVisualizer');
    if (canvas) drawEmpty(canvas);
    
    showMessage('Reset complete - Ready for new audio');
}

function drawEmpty(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    
    // Clear with dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw subtle grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // Draw instruction text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Upload audio to begin', width / 2, height / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

function drawWaveform(data, color) {
    const canvas = document.getElementById('waveVisualizer');
    if (!canvas || !data || data.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // Draw waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    // Optimize: Don't draw every sample for long audio
    const skip = Math.max(1, Math.floor(data.length / width));
    
    for (let i = 0; i < data.length; i += skip) {
        const x = (i / data.length) * width;
        const y = (1 - (data[i] + 1) / 2) * height;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
    
    // Draw info text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '12px sans-serif';
    
    if (color === '#48bb78') {
        // Original audio info
        ctx.fillText(`Original: ${uploadedAudio.duration.toFixed(2)}s`, 10, 20);
        ctx.fillText(`${uploadedAudio.sampleRate}Hz`, 10, 40);
    } else {
        // Processed audio info
        ctx.fillText(`Processed: ${currentFilter}`, 10, 20);
        const cutoffSlider = document.getElementById('cutoffFreq');
        if (cutoffSlider) {
            ctx.fillText(`Cutoff: ${cutoffSlider.value}Hz`, 10, 40);
        }
    }
}

function showMessage(text, isError = false) {
    console.log(isError ? 'ERROR:' : 'INFO:', text);
    
    // Update status element
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = isError ? '#f56565' : '#48bb78';
        statusEl.style.fontWeight = isError ? 'bold' : 'normal';
    }
    
    // Also show temporary notification
    showNotification(text, isError);
}

function showNotification(text, isError = false) {
    // Remove any existing notification
    const oldNotification = document.getElementById('temp-notification');
    if (oldNotification) oldNotification.remove();
    
    // Create new notification
    const notification = document.createElement('div');
    notification.id = 'temp-notification';
    notification.textContent = text;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 20px;
        background: ${isError ? '#f56565' : '#48bb78'};
        color: white;
        border-radius: 4px;
        font-family: sans-serif;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        max-width: 300px;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function showDetailedError(error, context) {
    console.error(`Error in ${context}:`, error);
    
    let userMessage = error.message || 'An unknown error occurred';
    
    // Provide user-friendly error messages
    if (userMessage.includes('detached ArrayBuffer')) {
        userMessage = 'Audio processing error. Please try uploading the file again.';
    } else if (userMessage.includes('NetworkError') || userMessage.includes('Failed to fetch')) {
        userMessage = 'Network error. Please check your connection and try again.';
    } else if (userMessage.includes('404')) {
        userMessage = 'Server not responding. Please try again later.';
    } else if (userMessage.includes('500')) {
        userMessage = 'Server error. Please try again or use a different audio file.';
    }
    
    showMessage(`${context} failed: ${userMessage}`, true);
}

// Add global access for debugging
window.audioApp = {
    getState: () => ({
        uploaded: !!uploadedAudio,
        processed: !!processedAudio,
        filter: currentFilter,
        context: audioContext ? audioContext.state : 'none'
    }),
    testAPI: async () => {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            console.log('API Test:', data);
            showMessage(`API OK: ${data.status} (v${data.version})`);
            return data;
        } catch (error) {
            console.error('API Test failed:', error);
            showMessage('API Test failed: ' + error.message, true);
            return null;
        }
    }
};
