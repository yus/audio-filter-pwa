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
        this.updateUIValues();
        this.testAPIConnection();
    }
    
    bindEvents() {
        // Update UI values when sliders change
        const sliders = ['cutoffFreq', 'resonance', 'lfoFreq', 'lfoDepth', 'frequency', 'duration'];
        sliders.forEach(slider => {
            const element = document.getElementById(slider);
            if (element) {
                element.addEventListener('input', () => this.updateUIValues());
            }
        });
        
        // Generate button
        const generateBtn = document.getElementById('generateBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateWaveform());
        }
        
        // Play button
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.addEventListener('click', () => this.playAudio());
        }
        
        // Stop button
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopAudio());
        }
        
        // Test API button
        const testBtn = document.getElementById('testBtn');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testAPIConnection());
        }
        
        // Synthesize button
        const synthBtn = document.getElementById('synthesizeBtn');
        if (synthBtn) {
            synthBtn.addEventListener('click', () => this.synthesizeAudio());
        }
    }
    
    updateUIValues() {
        // Update frequency display
        const freqElement = document.getElementById('frequencyValue');
        const freqSlider = document.getElementById('frequency');
        if (freqElement && freqSlider) {
            freqElement.textContent = `${freqSlider.value} Hz`;
        }
        
        // Update cutoff display
        const cutoffElement = document.getElementById('cutoffValue');
        const cutoffSlider = document.getElementById('cutoffFreq');
        if (cutoffElement && cutoffSlider) {
            cutoffElement.textContent = `${cutoffSlider.value} Hz`;
        }
        
        // Update resonance display
        const resonanceElement = document.getElementById('resonanceValue');
        const resonanceSlider = document.getElementById('resonance');
        if (resonanceElement && resonanceSlider) {
            resonanceElement.textContent = resonanceSlider.value;
        }
        
        // Update LFO frequency display
        const lfoFreqElement = document.getElementById('lfoFreqValue');
        const lfoFreqSlider = document.getElementById('lfoFreq');
        if (lfoFreqElement && lfoFreqSlider) {
            lfoFreqElement.textContent = `${lfoFreqSlider.value} Hz`;
        }
        
        // Update LFO depth display
        const lfoDepthElement = document.getElementById('lfoDepthValue');
        const lfoDepthSlider = document.getElementById('lfoDepth');
        if (lfoDepthElement && lfoDepthSlider) {
            lfoDepthElement.textContent = lfoDepthSlider.value;
        }
        
        // Update duration display
        const durationElement = document.getElementById('durationValue');
        const durationSlider = document.getElementById('duration');
        if (durationElement && durationSlider) {
            durationElement.textContent = `${durationSlider.value} s`;
        }
    }
    
    initCanvas() {
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.visualizerCanvas = document.getElementById('visualizerCanvas');
        
        if (this.waveformCanvas) {
            this.waveformCtx = this.waveformCanvas.getContext('2d');
            this.waveformCanvas.width = this.waveformCanvas.offsetWidth;
            this.waveformCanvas.height = this.waveformCanvas.offsetHeight;
        }
        
        if (this.visualizerCanvas) {
            this.visualizerCtx = this.visualizerCanvas.getContext('2d');
            this.visualizerCanvas.width = this.visualizerCanvas.offsetWidth;
            this.visualizerCanvas.height = this.visualizerCanvas.offsetHeight;
        }
        
        window.addEventListener('resize', () => {
            if (this.waveformCanvas) {
                this.waveformCanvas.width = this.waveformCanvas.offsetWidth;
                this.waveformCanvas.height = this.waveformCanvas.offsetHeight;
            }
            if (this.visualizerCanvas) {
                this.visualizerCanvas.width = this.visualizerCanvas.offsetWidth;
                this.visualizerCanvas.height = this.visualizerCanvas.offsetHeight;
            }
        });
    }
    
    async testAPIConnection() {
        const statusElement = document.getElementById('apiStatus');
        if (!statusElement) return;
        
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            statusElement.textContent = 'API: ✅ Connected';
            statusElement.style.color = 'green';
            this.showNotification('API connected successfully!', 'success');
            return true;
        } catch (error) {
            statusElement.textContent = 'API: ❌ Connection failed';
            statusElement.style.color = 'red';
            this.showNotification('API connection failed', 'error');
            return false;
        }
    }
    
    async generateWaveform() {
        try {
            const frequency = document.getElementById('frequency')?.value || 440;
            const duration = document.getElementById('duration')?.value || 1.0;
            const filterType = document.getElementById('filterType')?.value || 'lowpass';
            const cutoffFreq = document.getElementById('cutoffFreq')?.value || 1000;
            const resonance = document.getElementById('resonance')?.value || 0.7;
            const lfoEnabled = document.getElementById('lfoEnabled')?.checked || false;
            const lfoFreq = document.getElementById('lfoFreq')?.value || 5;
            const lfoWaveform = document.getElementById('lfoWaveform')?.value || 'sine';
            const lfoDepth = document.getElementById('lfoDepth')?.value || 0.5;
            
            const params = {
                frequency: parseFloat(frequency),
                duration: parseFloat(duration),
                filter_type: filterType,
                cutoff_freq: parseFloat(cutoffFreq),
                resonance: parseFloat(resonance),
                lfo_enabled: lfoEnabled,
                lfo_freq: parseFloat(lfoFreq),
                lfo_waveform: lfoWaveform,
                lfo_depth: parseFloat(lfoDepth)
            };
            
            this.showNotification('Generating waveform...', 'info');
            
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success && data.waveform) {
                this.drawWaveform(data.waveform);
                this.showNotification(`Generated ${data.samples} samples at ${data.frequency} Hz`, 'success');
            } else {
                this.showNotification(`Error: ${data.error || 'Unknown error'}`, 'error');
            }
            
        } catch (error) {
            console.error('Error generating waveform:', error);
            this.showNotification(`Network error: ${error.message}`, 'error');
        }
    }
    
    drawWaveform(waveformData) {
        if (!this.waveformCtx || !this.waveformCanvas) return;
        
        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;
        
        // Clear canvas
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
            const frequency = document.getElementById('frequency')?.value || 440;
            const duration = document.getElementById('duration')?.value || 1.0;
            const waveform = document.getElementById('waveform')?.value || 'sine';
            
            const params = {
                frequency: parseFloat(frequency),
                duration: parseFloat(duration),
                waveform: waveform
            };
            
            this.showNotification('Synthesizing audio...', 'info');
            
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success && data.audio) {
                await this.createAudioBuffer(data.audio, data.sample_rate);
                this.showNotification(`Synthesized ${data.duration}s of ${waveform} wave at ${frequency}Hz`, 'success');
            } else {
                this.showNotification(`Error: ${data.error || 'Unknown error'}`, 'error');
            }
            
        } catch (error) {
            console.error('Error synthesizing audio:', error);
            this.showNotification(`Network error: ${error.message}`, 'error');
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
            this.setupVisualizer();
            
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
        
        this.drawVisualizer();
    }
    
    drawVisualizer() {
        if (!this.visualizerCtx || !this.visualizerCanvas) return;
        
        const ctx = this.visualizerCtx;
        const width = this.visualizerCanvas.width;
        const height = this.visualizerCanvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        if (this.analyser) {
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
        } else {
            // Draw demo visualizer
            const barCount = 32;
            const barWidth = width / barCount;
            
            for (let i = 0; i < barCount; i++) {
                const barHeight = Math.random() * height * 0.8;
                const x = i * barWidth;
                
                const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
                gradient.addColorStop(0, '#667eea');
                gradient.addColorStop(1, '#764ba2');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x + 2, height - barHeight, barWidth - 4, barHeight);
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
            
            if (this.analyser) {
                this.gainNode.connect(this.analyser);
            }
            
            this.gainNode.connect(this.audioContext.destination);
            
            this.sourceNode.start();
            this.isPlaying = true;
            
            this.sourceNode.onended = () => {
                this.isPlaying = false;
                this.sourceNode = null;
            };
            
            const playBtn = document.getElementById('playBtn');
            if (playBtn) {
                playBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            }
            
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
        
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.innerHTML = '<i class="fas fa-play"></i> Play';
        }
        
        this.showNotification('Audio stopped', 'info');
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
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
        
        // Add keyframes for animation if not already present
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
    
    // Generate initial waveform
    setTimeout(() => {
        if (window.audioFilterApp && window.audioFilterApp.generateWaveform) {
            window.audioFilterApp.generateWaveform();
        }
    }, 1000);
});
