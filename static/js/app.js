// Audio Filter PWA - ULTRA MINIMAL WORKING VERSION
class AudioFilterApp {
    constructor() {
        console.log('Audio Filter App - Minimal Version');
        this.uploadedAudio = null;
        this.processedAudio = null;
        this.isPlaying = false;
        this.currentFilter = 'lowpass';
        this.audioContext = null;
        this.sourceNode = null;
        
        // Wait for DOM to be fully ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    init() {
        console.log('Initializing...');
        
        // Setup basic UI first
        this.setupUI();
        
        // Draw empty canvas
        this.initCanvas();
        
        console.log('Init complete');
    }
    
    setupUI() {
        console.log('Setting up UI...');
        
        // 1. Setup filter buttons if they exist
        const filterBtns = document.querySelectorAll('.filter-btn, .filter-btn');
        if (filterBtns.length > 0) {
            filterBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.currentFilter = e.target.dataset.filter || 'lowpass';
                    console.log('Filter:', this.currentFilter);
                    // Auto-process if audio exists
                    if (this.uploadedAudio) this.processAudio();
                });
            });
        }
        
        // 2. Setup buttons with SAFE checks
        this.setupButton('uploadBtn', () => this.uploadAudio());
        this.setupButton('processBtn', () => this.processAudio());
        this.setupButton('playBtn', () => this.playAudio());
        this.setupButton('stopBtn', () => this.stopAudio());
        this.setupButton('resetBtn', () => this.resetApp());
        
        // 3. Setup slider if it exists
        const cutoffSlider = document.getElementById('cutoffFreq');
        if (cutoffSlider) {
            cutoffSlider.addEventListener('input', () => {
                console.log('Cutoff:', cutoffSlider.value);
                if (this.uploadedAudio) this.processAudio();
            });
        }
        
        // 4. Check for direct file input
        const fileInput = document.getElementById('audioUpload');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
    }
    
    setupButton(id, handler) {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', handler);
            console.log(`Button ${id} setup OK`);
        } else {
            console.log(`Button ${id} not found`);
        }
    }
    
    initCanvas() {
        this.canvas = document.getElementById('waveVisualizer');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.drawEmpty();
        } else {
            console.log('Canvas not found');
        }
    }
    
    drawEmpty() {
        if (!this.ctx || !this.canvas) return;
        
        const w = this.canvas.width = this.canvas.offsetWidth;
        const h = this.canvas.height = this.canvas.offsetHeight;
        
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, w, h);
        
        this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
        this.ctx.font = '14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Upload audio to begin', w/2, h/2);
        this.ctx.textAlign = 'left';
    }
    
    async uploadAudio() {
        console.log('Upload button clicked');
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = (e) => this.handleFileSelect(e);
        input.click();
    }
    
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        console.log('File selected:', file.name);
        this.showMessage('Loading audio...');
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.uploadedAudio = {
                buffer: audioBuffer,
                data: audioBuffer.getChannelData(0),
                sampleRate: audioBuffer.sampleRate,
                duration: audioBuffer.duration
            };
            
            console.log('Audio loaded:', this.uploadedAudio.data.length, 'samples');
            this.drawWaveform(this.uploadedAudio.data, '#48bb78');
            this.showMessage('Audio loaded! Click Process to filter.');
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showMessage('Upload failed: ' + error.message, true);
        }
    }
    
    async processAudio() {
        if (!this.uploadedAudio) {
            this.showMessage('Please upload audio first', true);
            return;
        }
        
        this.showMessage('Processing...');
        
        try {
            // Get cutoff value safely
            const cutoffSlider = document.getElementById('cutoffFreq');
            const cutoffValue = cutoffSlider ? parseFloat(cutoffSlider.value) : 1000;
            
            // Prepare data (limit to 5 seconds for performance)
            const maxSamples = 44100 * 5;
            const audioData = this.uploadedAudio.data.slice(0, Math.min(this.uploadedAudio.data.length, maxSamples));
            const audioArray = Array.from(audioData);
            
            const requestData = {
                audio_data: audioArray,
                filter_type: this.currentFilter,
                cutoff_freq: cutoffValue,
                resonance: 0.7,
                lfo_enabled: false,
                process_type: 'uploaded'
            };
            
            console.log('Sending to server:', requestData.filter_type, requestData.cutoff_freq);
            
            const response = await fetch('/api/process_audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.processedAudio = {
                    data: data.processed_audio,
                    sampleRate: this.uploadedAudio.sampleRate
                };
                
                this.drawWaveform(data.processed_audio, '#667eea');
                this.showMessage('Processing complete! Click Play to hear.');
            } else {
                throw new Error(data.error || 'Processing failed');
            }
            
        } catch (error) {
            console.error('Process error:', error);
            this.showMessage('Processing failed: ' + error.message, true);
        }
    }
    
    async playAudio() {
        if (!this.processedAudio && !this.uploadedAudio) {
            this.showMessage('No audio to play', true);
            return;
        }
        
        // Prefer processed audio
        const audioToPlay = this.processedAudio || this.uploadedAudio;
        console.log('Playing:', this.processedAudio ? 'processed' : 'original');
        
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        this.stopAudio();
        
        try {
            let audioBuffer;
            if (audioToPlay.buffer) {
                audioBuffer = audioToPlay.buffer;
            } else {
                audioBuffer = this.audioContext.createBuffer(1, audioToPlay.data.length, audioToPlay.sampleRate);
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
            
            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = audioBuffer;
            this.sourceNode.connect(this.audioContext.destination);
            this.sourceNode.start();
            this.isPlaying = true;
            
            this.showMessage('Playing...');
            
            this.sourceNode.onended = () => {
                this.isPlaying = false;
                this.showMessage('Playback finished');
            };
            
        } catch (error) {
            console.error('Play error:', error);
            this.showMessage('Play failed: ' + error.message, true);
        }
    }
    
    stopAudio() {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch (e) {
                // Ignore
            }
            this.sourceNode = null;
        }
        this.isPlaying = false;
    }
    
    resetApp() {
        this.stopAudio();
        this.uploadedAudio = null;
        this.processedAudio = null;
        this.drawEmpty();
        this.showMessage('Reset complete');
    }
    
    drawWaveform(data, color) {
        if (!this.ctx || !this.canvas) return;
        
        const w = this.canvas.width = this.canvas.offsetWidth;
        const h = this.canvas.height = this.canvas.offsetHeight;
        
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, w, h);
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        const skip = Math.max(1, Math.floor(data.length / w));
        
        for (let i = 0; i < data.length; i += skip) {
            const x = (i / data.length) * w;
            const y = (1 - (data[i] + 1) / 2) * h;
            
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        
        this.ctx.stroke();
    }
    
    showMessage(text, isError = false) {
        console.log(isError ? 'ERROR:' : 'INFO:', text);
        
        // Try to update status element if it exists
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = text;
            statusEl.style.color = isError ? '#f56565' : '#48bb78';
        } else {
            // Create temporary message
            const msg = document.createElement('div');
            msg.textContent = text;
            msg.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: ${isError ? '#f56565' : '#48bb78'};
                color: white;
                padding: 10px 20px;
                border-radius: 4px;
                font-family: sans-serif;
                z-index: 1000;
            `;
            document.body.appendChild(msg);
            setTimeout(() => msg.remove(), 3000);
        }
    }
}

// Start the app
window.addEventListener('DOMContentLoaded', () => {
    window.audioApp = new AudioFilterApp();
});
