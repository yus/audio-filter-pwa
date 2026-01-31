// Audio Filter PWA - Fixed Version (Works with your actual HTML)
class AudioFilterApp {
    constructor() {
        this.audioContext = null;
        this.sourceNode = null;
        this.uploadedAudio = null;
        this.processedAudio = null;
        this.isPlaying = false;
        this.currentFilter = 'lowpass';
        
        console.log('Audio Filter App Starting...');
        this.init();
    }
    
    init() {
        this.initUI();
        this.checkAPI();
        this.drawEmptyWaveform();
    }
    
    initUI() {
        console.log('Initializing UI...');
        
        // Check which elements actually exist
        this.checkElements();
        
        // Filter buttons - only if they exist
        const filterButtons = document.querySelectorAll('.filter-btn');
        if (filterButtons.length > 0) {
            filterButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    filterButtons.forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    this.currentFilter = e.target.dataset.filter || 'lowpass';
                    console.log('Filter set to:', this.currentFilter);
                    this.updateUI();
                    
                    // Auto-process if we have audio
                    if (this.uploadedAudio) {
                        this.processAudio();
                    }
                });
            });
        }
        
        // Cutoff slider - only if it exists
        const cutoffSlider = document.getElementById('cutoffFreq');
        if (cutoffSlider) {
            cutoffSlider.addEventListener('input', () => {
                this.updateUI();
                // Auto-process on slider change
                if (this.uploadedAudio) {
                    this.processAudio();
                }
            });
        }
        
        // Action buttons
        this.setupButton('playBtn', () => this.togglePlay());
        this.setupButton('stopBtn', () => this.stopAudio());
        this.setupButton('processBtn', () => this.processAudio());
        this.setupButton('resetBtn', () => this.reset());
        
        // Upload - handle both possible upload buttons
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*';
                input.onchange = (e) => this.handleUpload(e);
                input.click();
            });
        }
        
        // Also check for file input directly
        const fileInput = document.getElementById('audioUpload');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleUpload(e));
        }
        
        // Initialize canvas
        this.initCanvas();
        
        console.log('UI initialized successfully');
    }
    
    checkElements() {
        console.log('Checking HTML elements...');
        const elements = [
            'playBtn', 'stopBtn', 'processBtn', 'resetBtn', 'uploadBtn',
            'cutoffFreq', 'cutoffValue', 'frequency', 'waveVisualizer'
        ];
        
        elements.forEach(id => {
            const el = document.getElementById(id);
            console.log(`${id}:`, el ? 'FOUND' : 'NOT FOUND');
        });
    }
    
    setupButton(id, handler) {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', handler);
        }
    }
    
    initCanvas() {
        this.canvas = document.getElementById('waveVisualizer');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        }
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        if (this.uploadedAudio) {
            this.drawUploadedWaveform();
        } else if (this.processedAudio) {
            this.drawProcessedWaveform(this.processedAudio.data);
        } else {
            this.drawEmptyWaveform();
        }
    }
    
    updateUI() {
        // Safely update cutoff value display
        const cutoffValue = document.getElementById('cutoffValue');
        const cutoffSlider = document.getElementById('cutoffFreq');
        
        if (cutoffValue && cutoffSlider) {
            cutoffValue.textContent = cutoffSlider.value + ' Hz';
        }
        
        // Update filter display if it exists
        const filterDisplay = document.getElementById('filterDisplay');
        if (filterDisplay) {
            filterDisplay.textContent = this.currentFilter.toUpperCase();
        }
    }
    
    async checkAPI() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            console.log('Backend status:', data.status);
            this.showNotification('Backend connected', 'success');
            return true;
        } catch (error) {
            console.error('API check failed:', error);
            this.showNotification('Cannot connect to server', 'error');
            return false;
        }
    }
    
    // FIXED: Handle upload - SIMPLE VERSION
    async handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        console.log('Uploading file:', file.name, file.type);
        this.showNotification('Loading audio...');
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            
            // Store the array buffer temporarily
            this.uploadedArrayBuffer = arrayBuffer;
            this.uploadedFile = file;
            
            // Decode audio for visualization
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Store audio data
            this.uploadedAudio = {
                buffer: audioBuffer,
                data: audioBuffer.getChannelData(0),
                sampleRate: audioBuffer.sampleRate,
                duration: audioBuffer.duration
            };
            
            console.log(`Audio loaded: ${this.uploadedAudio.data.length} samples, ${this.uploadedAudio.duration.toFixed(2)}s`);
            
            // Draw waveform
            this.drawUploadedWaveform();
            
            // Auto-process
            this.processAudio();
            
            this.showNotification('Audio uploaded successfully');
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification('Upload failed: ' + error.message, 'error');
        }
    }
    
    // FIXED: Process audio - SIMPLE VERSION
    async processAudio() {
        if (!this.uploadedAudio) {
            this.showNotification('Please upload audio first', 'warning');
            return;
        }
        
        this.showNotification('Processing audio...');
        
        try {
            // Convert audio data to array (take first 44100*5 samples max to avoid large payloads)
            const maxSamples = 44100 * 5; // 5 seconds max
            const audioData = this.uploadedAudio.data.slice(0, Math.min(this.uploadedAudio.data.length, maxSamples));
            const audioArray = Array.from(audioData);
            
            // Get cutoff value safely
            const cutoffSlider = document.getElementById('cutoffFreq');
            const cutoffValue = cutoffSlider ? parseFloat(cutoffSlider.value) : 1000;
            
            // Prepare request data
            const requestData = {
                audio_data: audioArray,
                filter_type: this.currentFilter,
                cutoff_freq: cutoffValue,
                resonance: 0.7,
                lfo_enabled: false,
                process_type: 'uploaded'
            };
            
            console.log('Sending processing request:', {
                filter: this.currentFilter,
                cutoff: cutoffValue,
                samples: audioArray.length
            });
            
            const response = await fetch('/api/process_audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('Processing successful, received:', data.processed_audio.length, 'samples');
                
                // Store processed audio
                this.processedAudio = {
                    data: data.processed_audio,
                    sampleRate: this.uploadedAudio.sampleRate,
                    duration: data.processed_audio.length / this.uploadedAudio.sampleRate
                };
                
                // Draw processed waveform
                this.drawProcessedWaveform(data.processed_audio);
                
                this.showNotification('Audio processed successfully');
            } else {
                console.error('Processing failed:', data.error);
                this.showNotification('Processing failed: ' + data.error, 'error');
            }
            
        } catch (error) {
            console.error('Process error:', error);
            this.showNotification('Failed to process: ' + error.message, 'error');
        }
    }
    
    // FIXED: Play audio - SIMPLE AND RELIABLE
    async playAudio() {
        // Check what we should play
        const audioToPlay = this.processedAudio || this.uploadedAudio;
        
        if (!audioToPlay) {
            this.showNotification('No audio to play', 'warning');
            return;
        }
        
        console.log('Playing audio:', audioToPlay === this.processedAudio ? 'processed' : 'uploaded');
        
        // Initialize audio context on user gesture
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Resume if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        // Stop any existing playback
        this.stopAudio();
        
        try {
            // Create audio buffer
            let audioBuffer;
            if (audioToPlay.buffer) {
                // Already have AudioBuffer
                audioBuffer = audioToPlay.buffer;
            } else {
                // Create from array data
                audioBuffer = this.audioContext.createBuffer(
                    1, 
                    audioToPlay.data.length, 
                    audioToPlay.sampleRate
                );
                
                const channelData = audioBuffer.getChannelData(0);
                
                // Copy data with normalization to prevent clipping
                let maxVal = 0.001;
                for (const sample of audioToPlay.data) {
                    const absSample = Math.abs(sample);
                    if (absSample > maxVal) maxVal = absSample;
                }
                
                const scale = 0.8 / maxVal;
                
                for (let i = 0; i < audioToPlay.data.length; i++) {
                    channelData[i] = audioToPlay.data[i] * scale;
                }
            }
            
            // Create and play source
            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = audioBuffer;
            this.sourceNode.connect(this.audioContext.destination);
            
            this.sourceNode.start();
            this.isPlaying = true;
            
            // Update UI
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
        
        // Draw instruction text
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.font = '14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Click "Upload Audio" to begin', width / 2, height / 2);
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
        
        // Draw waveform (green)
        this.ctx.strokeStyle = '#48bb78';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        // Sample data for display (don't draw every point)
        const skip = Math.max(1, Math.floor(data.length / width));
        
        for (let i = 0; i < data.length; i += skip) {
            const x = (i / data.length) * width;
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
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText(`Uploaded: ${this.uploadedAudio.duration.toFixed(2)}s`, 10, 20);
        this.ctx.fillText(`${this.uploadedAudio.sampleRate}Hz, ${data.length} samples`, 10, 40);
    }
    
    drawProcessedWaveform(processedData) {
        if (!this.ctx || !this.canvas || !processedData || !this.uploadedAudio) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const originalData = this.uploadedAudio.data;
        
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
        
        // Draw original waveform (faint green background)
        this.ctx.strokeStyle = 'rgba(72, 187, 120, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        const skip = Math.max(1, Math.floor(originalData.length / width));
        for (let i = 0; i < originalData.length; i += skip) {
            const x = (i / originalData.length) * width;
            const y = (1 - (originalData[i] + 1) / 2) * height;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
        
        // Draw processed waveform (blue, bold)
        this.ctx.strokeStyle = '#667eea';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        const processedSkip = Math.max(1, Math.floor(processedData.length / width));
        for (let i = 0; i < processedData.length; i += processedSkip) {
            const x = (i / processedData.length) * width;
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
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText(`Filter: ${this.currentFilter}`, 10, 20);
        
        const cutoffSlider = document.getElementById('cutoffFreq');
        if (cutoffSlider) {
            this.ctx.fillText(`Cutoff: ${cutoffSlider.value}Hz`, 10, 40);
        }
        
        this.ctx.fillText(`Original (green) | Processed (blue)`, 10, height - 10);
    }
    
    reset() {
        this.stopAudio();
        
        this.uploadedAudio = null;
        this.processedAudio = null;
        
        // Reset filter to lowpass
        this.currentFilter = 'lowpass';
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === 'lowpass') {
                btn.classList.add('active');
            }
        });
        
        // Reset cutoff slider if it exists
        const cutoffSlider = document.getElementById('cutoffFreq');
        if (cutoffSlider) {
            cutoffSlider.value = 1000;
        }
        
        this.updateUI();
        this.drawEmptyWaveform();
        
        this.showNotification('Reset complete');
    }
    
    showNotification(message, type = 'info') {
        console.log(`${type.toUpperCase()}: ${message}`);
        
        // Try to use existing notification element
        let notification = document.getElementById('notification');
        if (!notification) {
            // Create one if it doesn't exist
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 10px 20px;
                background: #2a2a2a;
                color: white;
                border-radius: 4px;
                font-family: sans-serif;
                font-size: 14px;
                z-index: 1000;
                display: none;
                border-left: 4px solid #667eea;
            `;
            document.body.appendChild(notification);
        }
        
        // Set color based on type
        const colors = {
            info: '#667eea',
            error: '#f56565',
            warning: '#ed8936',
            success: '#48bb78'
        };
        
        notification.textContent = message;
        notification.style.borderLeftColor = colors[type] || colors.info;
        notification.style.display = 'block';
        
        // Auto-hide
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Start the app when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, starting AudioFilterApp...');
    window.app = new AudioFilterApp();
});
