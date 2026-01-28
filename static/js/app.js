class AudioFilterApp {
    constructor() {
        this.audioContext = null;
        this.currentAudioBuffer = null;
        this.isPlaying = false;
        this.sourceNode = null;
        this.gainNode = null;
        this.analyser = null;
        this.visualizerData = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.initCanvas();
        this.initServiceWorker();
        this.updateUIValues();
    }
    
    bindEvents() {
        // Play/Pause buttons
        document.getElementById('playBtn').addEventListener('click', () => this.playAudio());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopAudio());
        document.getElementById('generateBtn').addEventListener('click', () => this.generateWaveform());
        document.getElementById('synthesizeBtn').addEventListener('click', () => this.synthesizeAudio());
        
        // Sliders and inputs
        const sliders = ['cutoffFreq', 'resonance', 'lfoFreq', 'lfoDepth', 'frequency', 'duration'];
        sliders.forEach(slider => {
            document.getElementById(slider).addEventListener('input', (e) => {
                this.updateUIValues();
                this.generateWaveform();
            });
        });
        
        // Dropdowns
        const dropdowns = ['filterType', 'lfoWaveform', 'waveform'];
        dropdowns.forEach(dropdown => {
            document.getElementById(dropdown).addEventListener('change', () => this.generateWaveform());
        });
        
        // Toggle
        document.getElementById('lfoEnabled').addEventListener('change', () => this.generateWaveform());
        
        // Install button
        document.getElementById('installBtn').addEventListener('click', () => this.installPWA());
    }
    
    updateUIValues() {
        document.getElementById('cutoffValue').textContent = 
            `${document.getElementById('cutoffFreq').value} Hz`;
        document.getElementById('resonanceValue').textContent = 
            document.getElementById('resonance').value;
        document.getElementById('lfoFreqValue').textContent = 
            `${document.getElementById('lfoFreq').value} Hz`;
        document.getElementById('lfoDepthValue').textContent = 
            document.getElementById('lfoDepth').value;
        document.getElementById('frequencyValue').textContent = 
            `${document.getElementById('frequency').value} Hz`;
        document.getElementById('durationValue').textContent = 
            `${document.getElementById('duration').value} s`;
    }
    
    initCanvas() {
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        this.visualizerCanvas = document.getElementById('visualizerCanvas');
        this.visualizerCtx = this.visualizerCanvas.getContext('2d');
        
        // Set canvas dimensions
        this.waveformCanvas.width = this.waveformCanvas.offsetWidth;
        this.waveformCanvas.height = this.waveformCanvas.offsetHeight;
        this.visualizerCanvas.width = this.visualizerCanvas.offsetWidth;
        this.visualizerCanvas.height = this.visualizerCanvas.offsetHeight;
        
        window.addEventListener('resize', () => {
            this.waveformCanvas.width = this.waveformCanvas.offsetWidth;
            this.waveformCanvas.height = this.waveformCanvas.offsetHeight;
            this.visualizerCanvas.width = this.visualizerCanvas.offsetWidth;
            this.visualizerCanvas.height = this.visualizerCanvas.offsetHeight;
        });
    }
    
    async generateWaveform() {
        try {
            const params = {
                frequency: parseFloat(document.getElementById('frequency').value),
                duration: parseFloat(document.getElementById('duration').value),
                lfo_enabled: document.getElementById('lfoEnabled').checked,
                lfo_freq: parseFloat(document.getElementById('lfoFreq').value),
                lfo_waveform: document.getElementById('lfoWaveform').value,
                lfo_depth: parseFloat(document.getElementById('lfoDepth').value)
            };
            
            const response = await fetch('/api/generate_waveform', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            this.drawWaveform(data.waveform);
            
        } catch (error) {
            console.error('Error generating waveform:', error);
            this.showNotification('Error generating waveform', 'error');
        }
    }
    
    drawWaveform(waveformData) {
        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        
        // Horizontal lines
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Vertical lines
        for (let i = 0; i <= 10; i++) {
            const x = (width / 10) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Draw waveform
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        const step = width / waveformData.length;
        
        for (let i = 0; i < waveformData.length; i++) {
            const x = i * step;
            const y = (1 - (waveformData[i] + 1) / 2) * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Draw zero line
        ctx.strokeStyle = '#764ba2';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    async synthesizeAudio() {
        try {
            const params = {
                frequency: parseFloat(document.getElementById('frequency').value),
                duration: parseFloat(document.getElementById('duration').value),
                waveform: document.getElementById('waveform').value
            };
            
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            await this.createAudioBuffer(data.audio, data.sample_rate);
            
        } catch (error) {
            console.error('Error synthesizing audio:', error);
            this.showNotification('Error synthesizing audio', 'error');
        }
    }
    
    async createAudioBuffer(audioData, sampleRate) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const buffer = this.audioContext.createBuffer(1, audioData.length, sampleRate);
            const channelData = buffer.getChannelData(0);
            
            for (let i = 0; i < audioData.length; i++) {
                channelData[i] = audioData[i];
            }
            
            this.currentAudioBuffer = buffer;
            
            // Setup visualizer
            this.setupVisualizer();
            
            this.showNotification('Audio synthesized successfully!', 'success');
            
        } catch (error) {
            console.error('Error creating audio buffer:', error);
            this.showNotification('Error creating audio buffer', 'error');
        }
    }
    
    setupVisualizer() {
        if (!this.audioContext || !this.currentAudioBuffer) return;
        
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.visualizerData = new Uint8Array(this.analyser.frequencyBinCount);
        
        requestAnimationFrame(() => this.drawVisualizer());
    }
    
    drawVisualizer() {
        if (!this.analyser || !this.visualizerData) return;
        
        const ctx = this.visualizerCtx;
        const width = this.visualizerCanvas.width;
        const height = this.visualizerCanvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        if (this.isPlaying && this.analyser) {
            this.analyser.getByteFrequencyData(this.visualizerData);
            
            const barWidth = width / this.visualizerData.length;
            
            for (let i = 0; i < this.visualizerData.length; i++) {
                const barHeight = (this.visualizerData[i] / 255) * height;
                const x = i * barWidth;
                
                const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
                gradient.addColorStop(0, '#667eea');
                gradient.addColorStop(1, '#764ba2');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
            }
        }
        
        requestAnimationFrame(() => this.drawVisualizer());
    }
    
    async playAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (!this.currentAudioBuffer) {
            await this.synthesizeAudio();
            if (!this.currentAudioBuffer) return;
        }
        
        if (this.isPlaying) {
            this.stopAudio();
            return;
        }
        
        try {
            this.sourceNode = this.audioContext.createBufferSource();
            this.gainNode = this.audioContext.createGain();
            
            this.sourceNode.buffer = this.currentAudioBuffer;
            this.sourceNode.connect(this.gainNode);
            
            // Connect to analyser for visualization
            if (this.analyser) {
                this.gainNode.connect(this.analyser);
            }
            
            this.analyser.connect(this.audioContext.destination);
            this.gainNode.connect(this.audioContext.destination);
            
            this.sourceNode.start();
            this.isPlaying = true;
            
            this.sourceNode.onended = () => {
                this.isPlaying = false;
                this.sourceNode = null;
            };
            
            document.getElementById('playBtn').innerHTML = '<i class="fas fa-pause"></i> Pause';
            this.showNotification('Playing audio...', 'info');
            
        } catch (error) {
            console.error('Error playing audio:', error);
            this.showNotification('Error playing audio', 'error');
        }
    }
    
    stopAudio() {
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        
        this.isPlaying = false;
        document.getElementById('playBtn').innerHTML = '<i class="fas fa-play"></i> Play';
        this.showNotification('Audio stopped', 'info');
    }
    
    async processAudioWithFilter(audioData) {
        try {
            const params = {
                audio_data: audioData,
                filter_type: document.getElementById('filterType').value,
                cutoff_freq: parseFloat(document.getElementById('cutoffFreq').value),
                resonance: parseFloat(document.getElementById('resonance').value),
                lfo_enabled: document.getElementById('lfoEnabled').checked,
                lfo_freq: parseFloat(document.getElementById('lfoFreq').value),
                lfo_waveform: document.getElementById('lfoWaveform').value,
                lfo_depth: parseFloat(document.getElementById('lfoDepth').value)
            };
            
            const response = await fetch('/api/process_audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            return data.processed_audio;
            
        } catch (error) {
            console.error('Error processing audio:', error);
            this.showNotification('Error processing audio', 'error');
            return audioData;
        }
    }
    
    initServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('Service Worker registered:', registration);
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                });
        }
    }
    
    async installPWA() {
        if (!window.deferredPrompt) {
            this.showNotification('App can be installed from browser menu', 'info');
            return;
        }
        
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            this.showNotification('App installed successfully!', 'success');
        } else {
            this.showNotification('App installation cancelled', 'info');
        }
        
        window.deferredPrompt = null;
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                              type === 'error' ? 'exclamation-circle' : 
                              'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#4caf50' : 
                         type === 'error' ? '#f44336' : 
                         '#2196f3'};
            color: white;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
        
        // Add keyframes for animation
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.audioFilterApp = new AudioFilterApp();
    
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.deferredPrompt = e;
    });
    
    // Initial waveform generation
    setTimeout(() => window.audioFilterApp.generateWaveform(), 500);
});
