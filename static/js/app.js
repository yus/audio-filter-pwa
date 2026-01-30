// Audio Filter PWA - Simple Upload & Filter Version
class AudioFilterApp {
    constructor() {
        this.audioContext = null;
        this.sourceNode = null;
        this.audioBuffer = null;
        this.isPlaying = false;
        this.isRecording = false;
        this.currentFilter = 'lowpass';
        this.uploadedAudio = null;
        this.processedAudio = null;
        
        this.init();
    }
    
    init() {
        console.log('Audio Filter PWA - Simple Upload Version');
        this.initUI();
        this.updateUI();
    }
    
    initUI() {
        // Remove all waveform generation buttons - we don't need them
        const elementsToRemove = ['generateBtn', 'synthesizeBtn'];
        elementsToRemove.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.updateUI();
                if (this.uploadedAudio) {
                    this.processAudio();
                }
            });
        });
        
        // Sliders - only keep cutoff frequency
        const cutoffSlider = document.getElementById('cutoffFreq');
        if (cutoffSlider) {
            cutoffSlider.addEventListener('input', () => {
                this.updateUI();
                if (this.uploadedAudio) {
                    this.processAudio();
                }
            });
        }
        
        // Remove LFO and modulation controls
        const lfoElements = ['lfoEnabled', 'lfoRate', 'lfoDepth', 'mixingToggle', 'modulationType', 'modRate', 'modDepth'];
        lfoElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // Button events - only essential buttons
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.addEventListener('click', () => this.togglePlay());
        }
        
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopAudio());
        }
        
        const processBtn = document.getElementById('processBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processAudio());
        }
        
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.reset());
        }
        
        // Upload button (the original one that works)
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                const uploadInput = document.createElement('input');
                uploadInput.type = 'file';
                uploadInput.accept = 'audio/*';
                uploadInput.onchange = (e) => this.handleUpload(e);
                uploadInput.click();
            });
        }
        
        // Initialize canvas
        this.canvas = document.getElementById('waveVisualizer');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        }
        
        // Draw empty waveform
        this.drawEmptyWaveform();
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.drawWaveform();
    }
    
    updateUI() {
        // Only update cutoff value
        const cutoffValue = document.getElementById('cutoffValue');
        const cutoffSlider = document.getElementById('cutoffFreq');
        if (cutoffValue && cutoffSlider) {
            cutoffValue.textContent = cutoffSlider.value + ' Hz';
        }
        
        // Update filter display
        const filterDisplay = document.getElementById('filterDisplay');
        if (filterDisplay) {
            filterDisplay.textContent = this.currentFilter.toUpperCase();
        }
    }
    
    // FIXED: Handle upload properly
    async handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('audio/')) {
            this.showNotification('Please select an audio file', 'error');
            return;
        }
        
        this.showNotification('Loading audio...');
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            
            // Create audio context on user gesture (fixes autoplay issue)
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Store original audio
            this.uploadedAudio = {
                buffer: audioBuffer,
                data: audioBuffer.getChannelData(0),
                sampleRate: audioBuffer.sampleRate
            };
            
            console.log(`Uploaded: ${this.uploadedAudio.data.length} samples at ${this.uploadedAudio.sampleRate}Hz`);
            
            // Visualize the uploaded audio
            this.drawUploadedWaveform();
            
            // Auto-process with current filter
            this.processAudio();
            
            this.showNotification('Audio uploaded successfully');
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification('Upload failed: ' + error.message, 'error');
        }
    }
    
    // FIXED: Process audio with current filter
    async processAudio() {
        if (!this.uploadedAudio) {
            this.showNotification('Please upload audio first', 'warning');
            return;
        }
        
        this.showNotification('Processing audio...');
        
        try {
            // Get audio data as array
            const audioData = Array.from(this.uploadedAudio.data);
            const sampleRate = this.uploadedAudio.sampleRate;
            
            // Prepare parameters for backend
            const params = {
                audio_data: audioData,
                filter_type: this.currentFilter,
                cutoff_freq: parseFloat(document.getElementById('cutoffFreq').value),
                resonance: 0.7,
                lfo_enabled: false,  // We disabled LFO
                process_type: 'uploaded'
            };
            
            console.log('Sending to server for processing...');
            
            const response = await fetch('/api/process_audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Store processed audio
                this.processedAudio = {
                    data: data.processed_audio,
                    sampleRate: sampleRate
                };
                
                // Visualize processed audio
                this.drawProcessedWaveform(data.processed_audio);
                
                this.showNotification('Audio processed');
            } else {
                this.showNotification('Processing failed: ' + data.error, 'error');
            }
            
        } catch (error) {
            console.error('Process error:', error);
            this.showNotification('Failed to process: ' + error.message, 'error');
        }
    }
    
    // FIXED: Play audio - only plays uploaded/processed audio
    async playAudio() {
        if (!this.audioContext) {
            // Create audio context on user gesture
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Resume context if suspended (required by browsers)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        // Stop any existing playback
        this.stopAudio();
        
        try {
            let audioToPlay = null;
            
            // Prefer processed audio, fall back to uploaded
            if (this.processedAudio && this.processedAudio.data) {
                console.log('Playing processed audio');
                audioToPlay = this.processedAudio;
            } else if (this.uploadedAudio && this.uploadedAudio.buffer) {
                console.log('Playing uploaded audio');
                audioToPlay = this.uploadedAudio;
            } else {
                this.showNotification('No audio to play', 'warning');
                return;
            }
            
            // Create audio buffer from data
            let audioBuffer;
            if (audioToPlay.buffer) {
                // Already have AudioBuffer
                audioBuffer = audioToPlay.buffer;
            } else if (audioToPlay.data) {
                // Need to create AudioBuffer from array
                audioBuffer = this.audioContext.createBuffer(1, audioToPlay.data.length, audioToPlay.sampleRate);
                const channelData = audioBuffer.getChannelData(0);
                
                // Copy and normalize data
                let maxVal = 0.0001;
                for (const sample of audioToPlay.data) {
                    const absSample = Math.abs(sample);
                    if (absSample > maxVal) maxVal = absSample;
                }
                
                const scale = maxVal > 0 ? 0.8 / maxVal : 1;
                
                for (let i = 0; i < audioToPlay.data.length; i++) {
                    channelData[i] = audioToPlay.data[i] * scale;
                }
            } else {
                this.showNotification('Audio data corrupted', 'error');
                return;
            }
            
            // Create and play source
            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = audioBuffer;
            this.sourceNode.connect(this.audioContext.destination);
            
            this.sourceNode.start();
            this.isPlaying = true;
            
            const playBtn = document.getElementById('playBtn');
            if (playBtn) playBtn.classList.add('playing');
            
            this.showNotification('Playing audio...');
            
            // Handle playback end
            this.sourceNode.onended = () => {
                this.isPlaying = false;
                if (playBtn) playBtn.classList.remove('playing');
                this.sourceNode = null;
                this.showNotification('Playback finished');
            };
            
        } catch (error) {
            console.error('Play error:', error);
            this.showNotification('Failed to play: ' + error.message, 'error');
        }
    }
    
    async togglePlay() {
        if (this.isPlaying) {
            this.stopAudio();
        } else {
            await this.playAudio();
        }
    }
    
    stopAudio() {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch (e) {
                // Ignore if already stopped
            }
            this.sourceNode = null;
        }
        
        this.isPlaying = false;
        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.classList.remove('playing');
    }
    
    // Drawing functions
    drawEmptyWaveform() {
        if (!this.ctx || !this.canvas) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Clear with dark background
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw center line
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, height / 2);
        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();
        
        // Draw "Upload audio" message
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.font = '14px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            'Upload audio to begin',
            width / 2,
            height / 2
        );
        this.ctx.textAlign = 'left';
    }
    
    drawUploadedWaveform() {
        if (!this.ctx || !this.canvas || !this.uploadedAudio) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const data = this.uploadedAudio.data;
        
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw center line
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, height / 2);
        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();
        
        // Draw waveform (green for uploaded)
        this.ctx.strokeStyle = '#48bb78';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        // Sample every N points to avoid drawing too many
        const step = Math.max(1, Math.floor(data.length / width));
        const samplesToDraw = Math.min(data.length, width * 2);
        
        for (let i = 0; i < samplesToDraw; i += step) {
            const x = (i / samplesToDraw) * width;
            const y = (1 - (data[i] + 1) / 2) * height;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
        
        // Draw info
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.font = '10px monospace';
        this.ctx.fillText(`Uploaded: ${(data.length / this.uploadedAudio.sampleRate).toFixed(2)}s`, 10, 20);
        this.ctx.fillText(`Sample Rate: ${this.uploadedAudio.sampleRate}Hz`, 10, 35);
    }
    
    drawProcessedWaveform(processedData) {
        if (!this.ctx || !this.canvas || !processedData) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw center line
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, height / 2);
        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();
        
        // Draw original waveform (green, faint)
        if (this.uploadedAudio && this.uploadedAudio.data) {
            const originalData = this.uploadedAudio.data;
            this.ctx.strokeStyle = 'rgba(72, 187, 120, 0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            
            const step = Math.max(1, Math.floor(originalData.length / width));
            const samplesToDraw = Math.min(originalData.length, width * 2);
            
            for (let i = 0; i < samplesToDraw; i += step) {
                const x = (i / samplesToDraw) * width;
                const y = (1 - (originalData[i] + 1) / 2) * height;
                
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            
            this.ctx.stroke();
        }
        
        // Draw processed waveform (blue, bold)
        this.ctx.strokeStyle = '#667eea';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        const step = Math.max(1, Math.floor(processedData.length / width));
        const samplesToDraw = Math.min(processedData.length, width * 2);
        
        for (let i = 0; i < samplesToDraw; i += step) {
            const x = (i / samplesToDraw) * width;
            const y = (1 - (processedData[i] + 1) / 2) * height;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
        
        // Draw info
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.font = '10px monospace';
        this.ctx.fillText(`Filter: ${this.currentFilter}`, 10, 20);
        this.ctx.fillText(`Cutoff: ${document.getElementById('cutoffFreq').value}Hz`, 10, 35);
        this.ctx.fillText(`Original (green) | Processed (blue)`, 10, height - 10);
    }
    
    reset() {
        this.stopAudio();
        
        // Reset audio data
        this.uploadedAudio = null;
        this.processedAudio = null;
        
        // Reset UI
        const cutoffSlider = document.getElementById('cutoffFreq');
        if (cutoffSlider) cutoffSlider.value = 1000;
        
        // Reset filter to lowpass
        this.currentFilter = 'lowpass';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const lowpassBtn = document.querySelector('.filter-btn[data-filter="lowpass"]');
        if (lowpassBtn) lowpassBtn.classList.add('active');
        
        this.updateUI();
        this.drawEmptyWaveform();
        
        this.showNotification('Reset complete');
    }
    
    showNotification(message, type = 'info') {
        console.log(`${type}: ${message}`);
        
        // Create notification if it doesn't exist
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 10px 20px;
                border-radius: 4px;
                color: white;
                font-family: monospace;
                z-index: 1000;
                display: none;
            `;
            document.body.appendChild(notification);
        }
        
        // Set style based on type
        const colors = {
            info: '#667eea',
            error: '#f56565',
            warning: '#ed8936',
            success: '#48bb78'
        };
        
        notification.textContent = message;
        notification.style.backgroundColor = colors[type] || colors.info;
        notification.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.audioFilterApp = new AudioFilterApp();
});
