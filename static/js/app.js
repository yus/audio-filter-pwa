class AudioFilterApp {
    constructor() {
        this.audioContext = null;
        this.currentAudioBuffer = null;
        this.isPlaying = false;
        this.sourceNode = null;
        this.gainNode = null;
        this.analyser = null;
        this.visualizerData = null;
        this.audioData = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.initCanvas();
        this.initServiceWorker();
        this.updateUIValues();
        this.checkAudioSupport();
        
        // Generate initial waveform
        setTimeout(() => this.generateWaveform(), 500);
    }
    
    checkAudioSupport() {
        if (!window.AudioContext && !window.webkitAudioContext) {
            this.showNotification('Web Audio API not supported in this browser', 'error');
            return false;
        }
        return true;
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
            const element = document.getElementById(slider);
            if (element) {
                element.addEventListener('input', (e) => {
                    this.updateUIValues();
                    this.generateWaveform();
                });
            }
        });
        
        // Dropdowns
        const dropdowns = ['filterType', 'lfoWaveform', 'waveform'];
        dropdowns.forEach(dropdown => {
            const element = document.getElementById(dropdown);
            if (element) {
                element.addEventListener('change', () => this.generateWaveform());
            }
        });
        
        // Toggle
        const lfoToggle = document.getElementById('lfoEnabled');
        if (lfoToggle) {
            lfoToggle.addEventListener('change', () => this.generateWaveform());
        }
        
        // Install button
        const installBtn = document.getElementById('installBtn');
        if (installBtn) {
            installBtn.addEventListener('click', () => this.installPWA());
        }
        
        // Listen for online/offline events
        window.addEventListener('online', () => this.showNotification('Back online', 'success'));
        window.addEventListener('offline', () => this.showNotification('Working offline', 'warning'));
        
        // Listen for beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.deferredPrompt = e;
            if (installBtn) {
                installBtn.style.display = 'block';
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.playAudio();
            } else if (e.code === 'Escape') {
                this.stopAudio();
            }
        });
    }
    
    updateUIValues() {
        const elements = {
            'cutoffValue': 'cutoffFreq',
            'resonanceValue': 'resonance',
            'lfoFreqValue': 'lfoFreq',
            'lfoDepthValue': 'lfoDepth',
            'frequencyValue': 'frequency',
            'durationValue': 'duration'
        };
        
        for (const [displayId, inputId] of Object.entries(elements)) {
            const displayElement = document.getElementById(displayId);
            const inputElement = document.getElementById(inputId);
            
            if (displayElement && inputElement) {
                if (inputId === 'cutoffFreq' || inputId === 'lfoFreq' || inputId === 'frequency') {
                    displayElement.textContent = `${inputElement.value} Hz`;
                } else if (inputId === 'duration') {
                    displayElement.textContent = `${inputElement.value} s`;
                } else {
                    displayElement.textContent = inputElement.value;
                }
            }
        }
    }
    
    initCanvas() {
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        this.visualizerCanvas = document.getElementById('visualizerCanvas');
        this.visualizerCtx = this.visualizerCanvas.getContext('2d');
        
        // Set canvas dimensions
        this.resizeCanvas();
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        this.waveformCanvas.width = this.waveformCanvas.offsetWidth * window.devicePixelRatio || 1;
        this.waveformCanvas.height = this.waveformCanvas.offsetHeight * window.devicePixelRatio || 1;
        this.visualizerCanvas.width = this.visualizerCanvas.offsetWidth * window.devicePixelRatio || 1;
        this.visualizerCanvas.height = this.visualizerCanvas.offsetHeight * window.devicePixelRatio || 1;
        
        // Scale context
        this.waveformCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        this.visualizerCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }
    
    async generateWaveform() {
        try {
            const params = {
                frequency: parseFloat(document.getElementById('frequency').value),
                duration: parseFloat(document.getElementById('duration').value),
                lfo_enabled: document.getElementById('lfoEnabled').checked,
                lfo_freq: parseFloat(document.getElementById('lfoFreq').value),
                lfo_waveform: document.getElementById('lfoWaveform').value,
                lfo_depth: parseFloat(document.getElementById('lfoDepth').value),
                filter_type: document.getElementById('filterType').value,
                cutoff_freq: parseFloat(document.getElementById('cutoffFreq').value),
                resonance: parseFloat(document.getElementById('resonance').value)
            };
            
            const response = await fetch('/api/generate_waveform', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.drawWaveform(data.waveform);
            
        } catch (error) {
            console.error('Error generating waveform:', error);
            this.showNotification('Error generating waveform', 'error');
            // Draw fallback waveform
            this.drawFallbackWaveform();
        }
    }
    
    drawWaveform(waveformData) {
        if (!this.waveformCtx) return;
        
        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width / (window.devicePixelRatio || 1);
        const height = this.waveformCanvas.height / (window.devicePixelRatio || 1);
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid background
        this.drawGrid(ctx, width, height);
        
        if (!waveformData || waveformData.length === 0) {
            this.drawNoSignal(ctx, width, height);
            return;
        }
        
        // Draw waveform
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        
        const step = width / (waveformData.length - 1);
        
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
        ctx.strokeStyle = 'rgba(118, 75, 162, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw amplitude markers
        this.drawAmplitudeMarkers(ctx, width, height);
    }
    
    drawFallbackWaveform() {
        if (!this.waveformCtx) return;
        
        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width / (window.devicePixelRatio || 1);
        const height = this.waveformCanvas.height / (window.devicePixelRatio || 1);
        
        ctx.clearRect(0, 0, width, height);
        this.drawGrid(ctx, width, height);
        
        // Draw a simple sine wave
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const frequency = parseFloat(document.getElementById('frequency').value) || 440;
        const points = 200;
        
        for (let i = 0; i < points; i++) {
            const x = (i / points) * width;
            const y = height / 2 + Math.sin((i / points) * frequency * 0.1) * height * 0.4;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        this.drawNoSignal(ctx, width, height, 'Using fallback mode');
    }
    
    drawGrid(ctx, width, height) {
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5;
        
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
    }
    
    drawAmplitudeMarkers(ctx, width, height) {
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        // Left side markers
        ctx.fillText('+1.0', 5, height * 0.1);
        ctx.fillText(' 0.0', 5, height * 0.5);
        ctx.fillText('-1.0', 5, height * 0.9);
    }
    
    drawNoSignal(ctx, width, height, message = 'No signal') {
        ctx.fillStyle = '#999';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, width / 2, height / 2);
    }
    
    async synthesizeAudio() {
        try {
            const params = {
                frequency: parseFloat(document.getElementById('frequency').value),
                duration: parseFloat(document.getElementById('duration').value),
                waveform: document.getElementById('waveform').value
            };
            
            this.showNotification('Synthesizing audio...', 'info');
            
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            
            await this.createAudioBuffer(data.audio, data.sample_rate);
            this.showNotification('Audio synthesized successfully!', 'success');
            
        } catch (error) {
            console.error('Error synthesizing audio:', error);
            this.showNotification('Error synthesizing audio', 'error');
        }
    }
    
    async createAudioBuffer(audioData, sampleRate) {
        try {
            if (!this.checkAudioSupport()) return;
            
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            const buffer = this.audioContext.createBuffer(1, audioData.length, sampleRate);
            const channelData = buffer.getChannelData(0);
            
            for (let i = 0; i < audioData.length; i++) {
                channelData[i] = audioData[i];
            }
            
            this.currentAudioBuffer = buffer;
            this.audioData = audioData;
            
            // Setup visualizer
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
        this.analyser.smoothingTimeConstant = 0.8;
        this.visualizerData = new Uint8Array(this.analyser.frequencyBinCount);
        
        // Start visualizer animation
        requestAnimationFrame(() => this.drawVisualizer());
    }
    
    drawVisualizer() {
        if (!this.visualizerCtx || !this.analyser) return;
        
        const ctx = this.visualizerCtx;
        const width = this.visualizerCanvas.width / (window.devicePixelRatio || 1);
        const height = this.visualizerCanvas.height / (window.devicePixelRatio || 1);
        
        // Clear with gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        if (this.isPlaying && this.analyser) {
            this.analyser.getByteFrequencyData(this.visualizerData);
            
            const barWidth = (width / this.visualizerData.length) * 2.5;
            let x = 0;
            
            for (let i = 0; i < this.visualizerData.length; i++) {
                // Skip some frequencies for better visualization
                if (i % 2 !== 0) continue;
                
                const barHeight = (this.visualizerData[i] / 255) * height * 0.8;
                
                // Create gradient for each bar
                const barGradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
                barGradient.addColorStop(0, '#667eea');
                barGradient.addColorStop(0.7, '#764ba2');
                barGradient.addColorStop(1, '#4a1e8a');
                
                ctx.fillStyle = barGradient;
                
                // Draw rounded bar
                const borderRadius = 2;
                ctx.beginPath();
                ctx.moveTo(x + borderRadius, height);
                ctx.lineTo(x + barWidth - borderRadius, height);
                ctx.quadraticCurveTo(x + barWidth, height, x + barWidth, height - borderRadius);
                ctx.lineTo(x + barWidth, height - barHeight + borderRadius);
                ctx.quadraticCurveTo(x + barWidth, height - barHeight, x + barWidth - borderRadius, height - barHeight);
                ctx.lineTo(x + borderRadius, height - barHeight);
                ctx.quadraticCurveTo(x, height - barHeight, x, height - barHeight + borderRadius);
                ctx.lineTo(x, height - borderRadius);
                ctx.quadraticCurveTo(x, height, x + borderRadius, height);
                ctx.closePath();
                ctx.fill();
                
                x += barWidth + 1;
            }
        } else {
            // Draw idle animation when not playing
            this.drawIdleVisualizer(ctx, width, height);
        }
        
        // Continue animation
        requestAnimationFrame(() => this.drawVisualizer());
    }
    
    drawIdleVisualizer(ctx, width, height) {
        const time = Date.now() * 0.001;
        const centerY = height / 2;
        const amplitude = height * 0.3;
        
        ctx.strokeStyle = 'rgba(102, 126, 234, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let x = 0; x < width; x += 2) {
            const y = centerY + Math.sin((x / width) * Math.PI * 4 + time) * amplitude;
            
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Draw "Click Play" text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Click Play to start audio', width / 2, height / 2);
    }
    
    async playAudio() {
        if (!this.checkAudioSupport()) return;
        
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
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
            
            // Create filter node
            const filterNode = this.audioContext.createBiquadFilter();
            filterNode.type = document.getElementById('filterType').value;
            filterNode.frequency.value = parseFloat(document.getElementById('cutoffFreq').value);
            filterNode.Q.value = parseFloat(document.getElementById('resonance').value);
            
            this.gainNode.connect(filterNode);
            
            // Connect to analyser for visualization
            if (this.analyser) {
                filterNode.connect(this.analyser);
            }
            
            this.analyser.connect(this.audioContext.destination);
            filterNode.connect(this.audioContext.destination);
            
            // Add LFO modulation if enabled
            if (document.getElementById('lfoEnabled').checked) {
                this.addLFOModulation(this.gainNode);
            }
            
            this.sourceNode.start();
            this.isPlaying = true;
            
            this.sourceNode.onended = () => {
                this.isPlaying = false;
                this.sourceNode = null;
                document.getElementById('playBtn').innerHTML = '<i class="fas fa-play"></i> Play';
                this.showNotification('Playback finished', 'info');
            };
            
            document.getElementById('playBtn').innerHTML = '<i class="fas fa-pause"></i> Pause';
            this.showNotification('Playing audio...', 'info');
            
        } catch (error) {
            console.error('Error playing audio:', error);
            this.showNotification('Error playing audio', 'error');
        }
    }
    
    addLFOModulation(targetNode) {
        if (!this.audioContext) return;
        
        const lfoFreq = parseFloat(document.getElementById('lfoFreq').value);
        const lfoDepth = parseFloat(document.getElementById('lfoDepth').value);
        const lfoType = document.getElementById('lfoWaveform').value;
        
        // Create LFO oscillator
        const lfo = this.audioContext.createOscillator();
        lfo.frequency.value = lfoFreq;
        
        // Set waveform type
        if (lfoType === 'sine') {
            lfo.type = 'sine';
        } else if (lfoType === 'square') {
            lfo.type = 'square';
        } else if (lfoType === 'sawtooth') {
            lfo.type = 'sawtooth';
        } else if (lfoType === 'triangle') {
            lfo.type = 'triangle';
        }
        
        // Create gain for LFO depth
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = lfoDepth * 0.5; // Scale depth
        
        // Connect LFO to modulate gain
        lfo.connect(lfoGain);
        lfoGain.connect(targetNode.gain);
        
        lfo.start();
        
        // Store references to stop later
        this.lfoNode = lfo;
        this.lfoGainNode = lfoGain;
    }
    
    stopAudio() {
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        
        // Stop LFO if active
        if (this.lfoNode) {
            this.lfoNode.stop();
            this.lfoNode.disconnect();
            this.lfoNode = null;
        }
        
        if (this.lfoGainNode) {
            this.lfoGainNode.disconnect();
            this.lfoGainNode = null;
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
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
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
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(registration => {
                        console.log('Service Worker registered:', registration);
                    })
                    .catch(error => {
                        console.error('Service Worker registration failed:', error);
                    });
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
            const installBtn = document.getElementById('installBtn');
            if (installBtn) {
                installBtn.style.display = 'none';
            }
        } else {
            this.showNotification('App installation cancelled', 'info');
        }
        
        window.deferredPrompt = null;
    }
    
    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(note => {
            if (note.parentNode) {
                note.parentNode.removeChild(note);
            }
        });
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        
        notification.innerHTML = `
            <i class="fas fa-${icons[type] || 'info-circle'}"></i>
            <span>${message}</span>
            <button class="notification-close"><i class="fas fa-times"></i></button>
        `;
        
        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#4caf50' : 
                         type === 'error' ? '#f44336' : 
                         type === 'warning' ? '#ff9800' : 
                         '#2196f3'};
            color: white;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease forwards;
            min-width: 300px;
            max-width: 400px;
        `;
        
        document.body.appendChild(notification);
        
        // Add close button event
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease forwards';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
        
        // Add animation styles if not already added
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
                .notification-close {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    padding: 0;
                    margin-left: auto;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }
                .notification-close:hover {
                    opacity: 1;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Utility function to download audio
    downloadAudio() {
        if (!this.audioData) {
            this.showNotification('No audio to download', 'warning');
            return;
        }
        
        // Convert audio data to WAV format
        const wavData = this.audioToWav(this.audioData, 44100);
        const blob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `audio_filter_${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        this.showNotification('Audio downloaded', 'success');
    }
    
    audioToWav(audioData, sampleRate) {
        // Simple WAV header creation
        const buffer = new ArrayBuffer(44 + audioData.length * 2);
        const view = new DataView(buffer);
        
        // Write WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + audioData.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, audioData.length * 2, true);
        
        // Write audio data
        let offset = 44;
        for (let i = 0; i < audioData.length; i++) {
            const sample = Math.max(-1, Math.min(1, audioData[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }
        
        return buffer;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if app is being loaded in an iframe
    if (window.self !== window.top) {
        console.log('Running in iframe');
    }
    
    window.audioFilterApp = new AudioFilterApp();
    
    // Add download button if not exists
    if (!document.getElementById('downloadBtn')) {
        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'downloadBtn';
        downloadBtn.className = 'btn btn-secondary';
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download Audio';
        downloadBtn.addEventListener('click', () => window.audioFilterApp.downloadAudio());
        
        const footer = document.querySelector('footer');
        if (footer) {
            footer.appendChild(downloadBtn);
        }
    }
});

// Add global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    if (window.audioFilterApp) {
        window.audioFilterApp.showNotification('An error occurred', 'error');
    }
});

// Add unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (window.audioFilterApp) {
        window.audioFilterApp.showNotification('An async error occurred', 'error');
    }
});
