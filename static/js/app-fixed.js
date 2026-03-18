// Audio Filter - COMPLETE WORKING VERSION (Using userActivation API)
console.log('Audio Filter LOADING...');

let uploadedAudio = null;
let processedAudio = null;
let audioContext = null;
let sourceNode = null;
let currentFilter = 'lowpass';

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready, setting up...');
    setupUI();
});

function setupUI() {
    console.log('Setting up UI...');
    
    // Get button elements
    const uploadBtn = document.getElementById('uploadBtn');
    const processBtn = document.getElementById('processBtn');
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetBtn = document.getElementById('resetBtn');
    
    // Setup upload button with proper user activation handling
    if (uploadBtn) {
        const newUploadBtn = uploadBtn.cloneNode(true);
        uploadBtn.parentNode.replaceChild(newUploadBtn, uploadBtn);
        
        newUploadBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Check if we have user activation
            if (navigator.userActivation && !navigator.userActivation.isActive) {
                console.log('Waiting for user activation...');
                // Still allow the file picker - it will trigger activation
            }
            
            console.log('Upload clicked - has user activation:', 
                       navigator.userActivation?.isActive);
            
            // Create file input directly in click handler
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'audio/*';
            fileInput.style.position = 'fixed';
            fileInput.style.top = '0';
            fileInput.style.left = '0';
            fileInput.style.opacity = '0';
            fileInput.style.pointerEvents = 'none';
            
            fileInput.onchange = function(event) {
                const file = event.target.files[0];
                if (file) {
                    handleSelectedFile(file);
                }
                // Clean up
                setTimeout(() => {
                    if (fileInput.parentNode) {
                        fileInput.parentNode.removeChild(fileInput);
                    }
                }, 100);
            };
            
            document.body.appendChild(fileInput);
            fileInput.click();
        });
        console.log('Upload button setup OK');
    }
    
    // Setup process button
    if (processBtn) {
        const newProcessBtn = processBtn.cloneNode(true);
        processBtn.parentNode.replaceChild(newProcessBtn, processBtn);
        newProcessBtn.addEventListener('click', function(e) {
            e.preventDefault();
            processAudio();
        });
    }
    
    // Setup play button
    if (playBtn) {
        const newPlayBtn = playBtn.cloneNode(true);
        playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
        newPlayBtn.addEventListener('click', function(e) {
            e.preventDefault();
            playAudio();
        });
    }
    
    // Setup stop button
    if (stopBtn) {
        const newStopBtn = stopBtn.cloneNode(true);
        stopBtn.parentNode.replaceChild(newStopBtn, stopBtn);
        newStopBtn.addEventListener('click', function(e) {
            e.preventDefault();
            stopAudio();
        });
    }
    
    // Setup reset button
    if (resetBtn) {
        const newResetBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
        newResetBtn.addEventListener('click', function(e) {
            e.preventDefault();
            resetApp();
        });
    }
    
    // Setup filter buttons
    setupFilterButtons();
    
    // Setup cutoff slider
    setupCutoffSlider();
    
    // Setup canvas
    const canvas = document.getElementById('waveVisualizer');
    if (canvas) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        drawEmpty(canvas);
    }
    
    showMessage('Ready - Click Upload to begin');
    console.log('Setup complete');
    
    // Log user activation status
    if (navigator.userActivation) {
        console.log('User activation API supported');
        console.log('Has ever been active:', navigator.userActivation.hasBeenActive);
    } else {
        console.log('User activation API not supported (older browser)');
    }
}

function setupFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
    });
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter || 'lowpass';
            console.log('Filter set to:', currentFilter);
            showMessage('Filter: ' + currentFilter);
            if (uploadedAudio) {
                processAudio();
            }
        });
    });
}

function setupCutoffSlider() {
    const cutoffSlider = document.getElementById('cutoffFreq');
    if (!cutoffSlider) return;
    
    const newSlider = cutoffSlider.cloneNode(true);
    cutoffSlider.parentNode.replaceChild(newSlider, cutoffSlider);
    
    newSlider.addEventListener('input', function() {
        const valueEl = document.getElementById('cutoffValue');
        if (valueEl) valueEl.textContent = this.value + ' Hz';
    });
    
    newSlider.addEventListener('change', function() {
        if (uploadedAudio) {
            processAudio();
        }
    });
    
    // Set initial value display
    const valueEl = document.getElementById('cutoffValue');
    if (valueEl) valueEl.textContent = newSlider.value + ' Hz';
}

async function handleSelectedFile(file) {
    console.log('Processing file:', file.name);
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
            duration: audioBuffer.duration,
            fileName: file.name
        };
        
        console.log('Audio loaded:', {
            samples: uploadedAudio.data.length,
            duration: uploadedAudio.duration.toFixed(2) + 's',
            sampleRate: uploadedAudio.sampleRate + 'Hz'
        });
        
        drawWaveform(uploadedAudio.data, '#48bb78');
        showMessage(`Loaded: ${uploadedAudio.duration.toFixed(2)}s - Processing...`);
        
        // Auto-process after load
        setTimeout(() => processAudio(), 100);
        
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
        const cutoffSlider = document.getElementById('cutoffFreq');
        const cutoffValue = cutoffSlider ? parseFloat(cutoffSlider.value) : 1000;
        
        console.log(`Processing: filter=${currentFilter}, cutoff=${cutoffValue}Hz`);
        
        // Limit to 30 seconds for performance
        const maxSamples = 44100 * 30;
        const originalData = uploadedAudio.data;
        const samplesToProcess = Math.min(originalData.length, maxSamples);
        
        // Create copy of data
        const audioArray = new Array(samplesToProcess);
        for (let i = 0; i < samplesToProcess; i++) {
            audioArray[i] = originalData[i];
        }
        
        console.log(`Sending ${audioArray.length} samples to server...`);
        
        const requestData = {
            audio_data: audioArray,
            filter_type: currentFilter,
            cutoff_freq: cutoffValue,
            resonance: 0.7,
            lfo_enabled: false,
            process_type: 'uploaded'
        };
        
        const response = await fetch('/api/process_audio', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server ${response.status}: ${errorText.substring(0, 100)}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            processedAudio = {
                data: data.processed_audio,
                sampleRate: uploadedAudio.sampleRate,
                duration: data.processed_audio.length / uploadedAudio.sampleRate
            };
            
            console.log(`Processing complete: ${data.processed_length} samples`);
            drawWaveform(data.processed_audio, '#667eea');
            showMessage(`Processed! Click Play to hear`);
            
        } else {
            throw new Error(data.error || 'Processing failed');
        }
        
    } catch (error) {
        console.error('Process error:', error);
        showDetailedError(error, 'Processing');
    }
}

async function playAudio() {
    const audioToPlay = processedAudio || uploadedAudio;
    
    if (!audioToPlay) {
        showMessage('Please upload audio first', true);
        return;
    }
    
    console.log('Playing:', processedAudio ? 'processed' : 'original');
    
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        stopAudio();
        
        let audioBuffer;
        if (audioToPlay.buffer) {
            audioBuffer = audioToPlay.buffer;
        } else {
            audioBuffer = audioContext.createBuffer(
                1, 
                audioToPlay.data.length, 
                audioToPlay.sampleRate
            );
            
            const channelData = audioBuffer.getChannelData(0);
            
            // Normalize to prevent clipping
            let maxAmp = 0.001;
            for (const sample of audioToPlay.data) {
                const abs = Math.abs(sample);
                if (abs > maxAmp) maxAmp = abs;
            }
            
            const scale = 0.8 / maxAmp;
            for (let i = 0; i < audioToPlay.data.length; i++) {
                channelData[i] = audioToPlay.data[i] * scale;
            }
        }
        
        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(audioContext.destination);
        
        sourceNode.onended = () => {
            sourceNode = null;
            showMessage('Playback finished');
        };
        
        sourceNode.start();
        showMessage('Playing...');
        
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
        } catch (e) {}
        sourceNode = null;
    }
}

function resetApp() {
    stopAudio();
    
    uploadedAudio = null;
    processedAudio = null;
    
    // Reset filter
    currentFilter = 'lowpass';
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === 'lowpass') {
            btn.classList.add('active');
        }
    });
    
    // Reset cutoff
    const cutoffSlider = document.getElementById('cutoffFreq');
    if (cutoffSlider) {
        cutoffSlider.value = 1000;
        const valueEl = document.getElementById('cutoffValue');
        if (valueEl) valueEl.textContent = '1000 Hz';
    }
    
    // Clear canvas
    const canvas = document.getElementById('waveVisualizer');
    if (canvas) drawEmpty(canvas);
    
    showMessage('Reset complete');
}

function drawEmpty(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Click Upload to begin', width / 2, height / 2);
}

function drawWaveform(data, color) {
    const canvas = document.getElementById('waveVisualizer');
    if (!canvas || !data) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Center line
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
    
    const skip = Math.max(1, Math.floor(data.length / width));
    
    for (let i = 0; i < data.length; i += skip) {
        const x = (i / data.length) * width;
        const y = (1 - (data[i] + 1) / 2) * height;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    
    // Info text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    
    if (color === '#48bb78' && uploadedAudio) {
        ctx.fillText(`Original: ${uploadedAudio.duration.toFixed(2)}s`, 10, 20);
    } else if (color === '#667eea' && processedAudio) {
        ctx.fillText(`Processed: ${currentFilter}`, 10, 20);
        const cutoff = document.getElementById('cutoffFreq');
        if (cutoff) ctx.fillText(`Cutoff: ${cutoff.value}Hz`, 10, 40);
    }
}

function showMessage(text, isError = false) {
    console.log(isError ? 'ERROR:' : 'INFO:', text);
    
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = isError ? '#f56565' : '#48bb78';
    }
    
    showNotification(text, isError);
}

function showNotification(text, isError = false) {
    const old = document.getElementById('temp-notification');
    if (old) old.remove();
    
    const notif = document.createElement('div');
    notif.id = 'temp-notification';
    notif.textContent = text;
    notif.style.cssText = `
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
    `;
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
        if (notif.parentNode) notif.remove();
    }, 3000);
}

function showDetailedError(error, context) {
    console.error(`Error in ${context}:`, error);
    
    let message = error.message || 'Unknown error';
    
    if (message.includes('detached ArrayBuffer')) {
        message = 'Audio processing error. Please try uploading again.';
    } else if (message.includes('NetworkError') || message.includes('fetch')) {
        message = 'Network error. Check connection and try again.';
    } else if (message.includes('404')) {
        message = 'Server not responding. Please try again.';
    }
    
    showMessage(`${context} failed: ${message}`, true);
}

// Debug helper
window.debug = {
    upload: () => {
        const btn = document.getElementById('uploadBtn');
        if (btn) btn.click();
    },
    userActivation: () => {
        if (navigator.userActivation) {
            return {
                isActive: navigator.userActivation.isActive,
                hasBeenActive: navigator.userActivation.hasBeenActive
            };
        }
        return 'Not supported';
    }
};
