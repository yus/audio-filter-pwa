// Audio Filter PWA - Compact Version
class AudioFilterApp {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.isPlaying = false;
        this.isRecording = false;
        this.currentWaveform = 'sine';
        this.currentFilter = 'lowpass';
        
        this.init();
    }
    
    init() {
        console.log('Audio Filter PWA Initializing...');
        
        this.initUI();
        this.initAudio();
        this.initPWA();
        this.updateUI();
        
        // Test API connection
        setTimeout(() => this.checkAPI(), 500);
        
        // Generate initial waveform
        setTimeout(() => this.generateWaveform(), 1000);
    }
    
    initUI() {
        // Waveform buttons
        document.querySelectorAll('.wave-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentWaveform = e.target.dataset.wave;
                this.updateUI();
                this.generateWaveform();
            });
        });
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.updateUI();
                this.generateWaveform();
            });
        });
        
        // Slider events
        const sliders = ['frequency', 'cutoffFreq', 'lfoRate', 'lfoDepth'];
        sliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.updateUI());
        });
        
        // Button events
        document.getElementById('playBtn').addEventListener('click', () => this.togglePlay());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopAudio());
        document.getElementById('generateBtn').addEventListener('click', () => this.generateWaveform());
        document.getElementById('synthesizeBtn').addEventListener('click', () => this.synthesizeAudio());
        document.getElementById('processBtn').addEventListener('click', () => this.processAudio());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadAudio());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecord());
        document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('audioUpload').click());
        document.getElementById('audioUpload').addEventListener('change', (e) => this.handleUpload(e));
        
        // Install prompt
        document.getElementById('installAccept').addEventListener('click', () => this.installPWA());
        document.getElementById('installDismiss').addEventListener('click', () => {
            document.getElementById('installPrompt').style.display = 'none';
        });
        
        // Initialize canvas
        this.canvas = document.getElementById('waveVisualizer');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.drawWaveform();
    }
    
    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.updateStatus('audio', 'ready');
        } catch (e) {
            console.error('AudioContext not supported:', e);
            this.updateStatus('audio', 'error');
        }
    }
    
    initPWA() {
        // Check if PWA is installable
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.deferredPrompt = e;
            this.updateStatus('pwa', 'installable');
            
            // Show install prompt after 3 seconds
            setTimeout(() => {
                const prompt = document.getElementById('installPrompt');
                if (prompt && !this.isPWAInstalled()) {
                    prompt.style.display = 'block';
                }
            }, 3000);
        });
        
        // Check if already installed
        if (this.isPWAInstalled()) {
            this.updateStatus('pwa', 'installed');
            document.getElementById('installPrompt').style.display = 'none';
        }
    }
    
    isPWAInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches || 
               window.navigator.standalone === true;
    }
    
    updateUI() {
        // Update value displays
        const values = {
            'freqValue': document.getElementById('frequency').value,
            'cutoffValue': document.getElementById('cutoffFreq').value,
            'lfoRateValue': document.getElementById('lfoRate').value,
            'lfoDepthValue': document.getElementById('lfoDepth').value
        };
        
        for (const [id, value] of Object.entries(values)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }
        
        // Update visualizer info
        document.getElementById('frequencyDisplay').textContent = 
            document.getElementById('frequency').value + ' Hz';
        document.getElementById('waveformDisplay').textContent = 
            this.currentWaveform.charAt(0).toUpperCase() + this.currentWaveform.slice(1);
    }
    
    updateStatus(type, status) {
        const el = document.getElementById(type + 'Status');
        if (!el) return;
        
        const statusMap = {
            'api': { ready: 'API ✅', error: 'API ❌' },
            'pwa': { ready: 'PWA ✅', installable: 'PWA ⬇️', installed: 'PWA 📱' },
            'audio': { ready: 'Audio ✅', error: 'Audio ❌' }
        };
        
        if (statusMap[type] && statusMap[type][status]) {
            el.textContent = statusMap[type][status];
            el.className = `status ${type}`;
        }
    }
    
    async checkAPI() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            this.updateStatus('api', 'ready');
            return true;
        } catch (error) {
            console.error('API error:', error);
            this.updateStatus('api', 'error');
            this.showNotification('Cannot connect to server', 'error');
            return false;
        }
    }
    
    async generateWaveform() {
        try {
            const params = this.getParams();
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.audioData = data.waveform;
                this.drawWaveform();
                this.showNotification('Waveform generated');
            } else {
                this.showNotification('Generation failed: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Generate error:', error);
            this.showNotification('Failed to generate', 'error');
        }
    }
    
    async synthesizeAudio() {
        try {
            const params = this.getParams();
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success) {
                await this.createAudioBuffer(data.audio, data.sample_rate);
                this.showNotification('Audio synthesized');
            } else {
                this.showNotification('Synthesis failed: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Synthesize error:', error);
            this.showNotification('Failed to synthesize', 'error');
        }
    }
    
    async processAudio() {
        if (!this.audioData) {
            this.showNotification('No audio to process', 'warning');
            return;
        }
        
        try {
            const params = this.getParams();
            params.audio_data = this.audioData;
            
            const response = await fetch('/api/process_audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.audioData = data.processed_audio;
                this.drawWaveform();
                this.showNotification('Audio processed');
            } else {
                this.showNotification('Processing failed: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Process error:', error);
            this.showNotification('Failed to process', 'error');
        }
    }
    
    getParams() {
        return {
            frequency: parseFloat(document.getElementById('frequency').value),
            duration: 1.0,
            waveform: this.currentWaveform,
            filter_type: this.currentFilter,
            cutoff_freq: parseFloat(document.getElementById('cutoffFreq').value),
            resonance: 0.7,
            lfo_enabled: document.getElementById('lfoEnabled').checked,
            lfo_freq: parseFloat(document.getElementById('lfoRate').value),
            lfo_waveform: 'sine',
            lfo_depth: parseFloat(document.getElementById('lfoDepth').value) / 100
        };
    }
    
    drawWaveform() {
        if (!this.ctx || !this.audioData) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const data = this.audioData;
        
        // Clear
        this.ctx.clearRect(0, 0, width, height);
        
        // Draw grid
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        // Draw waveform
        this.ctx.strokeStyle = '#667eea';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        const step = width / data.length;
        
        for (let i = 0; i < data.length; i++) {
            const x = i * step;
            const y = (1 - (data[i] + 1) / 2) * height;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
    }
    
    async createAudioBuffer(audioData, sampleRate) {
        if (!this.audioContext) return;
        
        try {
            const buffer = this.audioContext.createBuffer(1, audioData.length, sampleRate);
            const channelData = buffer.getChannelData(0);
            
            for (let i = 0; i < audioData.length; i++) {
                channelData[i] = audioData[i];
            }
            
            this.audioBuffer = buffer;
            return true;
        } catch (error) {
            console.error('Create buffer error:', error);
            return false;
        }
    }
    
    async togglePlay() {
        if (this.isPlaying) {
            this.stopAudio();
        } else {
            await this.playAudio();
        }
    }
    
    async playAudio() {
        if (!this.audioContext || !this.audioBuffer) {
            await this.synthesizeAudio();
            if (!this.audioBuffer) return;
        }
        
        try {
            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = this.audioBuffer;
            this.sourceNode.connect(this.audioContext.destination);
            
            this.sourceNode.start();
            this.isPlaying = true;
            
            document.getElementById('playBtn').classList.add('playing');
            this.showNotification('Playing audio...');
            
            this.sourceNode.onended = () => {
                this.isPlaying = false;
                document.getElementById('playBtn').classList.remove('playing');
            };
            
        } catch (error) {
            console.error('Play error:', error);
            this.showNotification('Failed to play audio', 'error');
        }
    }
    
    stopAudio() {
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        
        this.isPlaying = false;
        document.getElementById('playBtn').classList.remove('playing');
        this.showNotification('Audio stopped');
    }
    
    async toggleRecord() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.recordedChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                
                if (this.audioContext) {
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    const channelData = audioBuffer.getChannelData(0);
                    this.audioData = Array.from(channelData).slice(0, 44100);
                    this.drawWaveform();
                    this.showNotification('Recording complete');
                }
                
                this.isRecording = false;
                document.getElementById('recordBtn').classList.remove('recording');
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            document.getElementById('recordBtn').classList.add('recording');
            this.showNotification('Recording...');
            
        } catch (error) {
            console.error('Record error:', error);
            this.showNotification('Recording failed', 'error');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
        }
    }
    
    async handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            if (this.audioContext) {
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                const channelData = audioBuffer.getChannelData(0);
                this.audioData = Array.from(channelData).slice(0, 44100);
                this.drawWaveform();
                this.showNotification('Audio uploaded');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification('Upload failed', 'error');
        }
    }
    
    downloadAudio() {
        if (!this.audioData) {
            this.showNotification('No audio to download', 'warning');
            return;
        }
        
        // Simple WAV export
        const wavData = this.floatTo16BitPCM(this.audioData);
        const wavBlob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(wavBlob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audio_filter.wav';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('Audio downloaded');
    }
    
    floatTo16BitPCM(floatData) {
        // Simplified WAV conversion
        const buffer = new ArrayBuffer(44 + floatData.length * 2);
        const view = new DataView(buffer);
        
        // Write WAV header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + floatData.length * 2, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 44100, true);
        view.setUint32(28, 44100 * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, floatData.length * 2, true);
        
        // Write audio data
        let offset = 44;
        for (let i = 0; i < floatData.length; i++) {
            const sample = Math.max(-1, Math.min(1, floatData[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }
        
        return buffer;
    }
    
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    
    reset() {
        this.stopAudio();
        this.stopRecording();
        
        // Reset controls
        document.getElementById('frequency').value = 440;
        document.getElementById('cutoffFreq').value = 1000;
        document.getElementById('lfoRate').value = 5;
        document.getElementById('lfoDepth').value = 50;
        document.getElementById('lfoEnabled').checked = true;
        
        document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.wave-btn[data-wave="sine"]').classList.add('active');
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.filter-btn[data-filter="lowpass"]').classList.add('active');
        
        this.currentWaveform = 'sine';
        this.currentFilter = 'lowpass';
        this.audioData = null;
        
        this.updateUI();
        this.drawWaveform();
        this.showNotification('Reset complete');
    }
    
    async installPWA() {
        if (!window.deferredPrompt) {
            this.showNotification('Use browser menu to install', 'info');
            return;
        }
        
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            this.updateStatus('pwa', 'installed');
            document.getElementById('installPrompt').style.display = 'none';
            this.showNotification('App installed!');
        }
        
        window.deferredPrompt = null;
    }
    
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        // Set message and style
        notification.textContent = message;
        notification.className = type === 'error' ? 'notification-visible error' : 
                               type === 'warning' ? 'notification-visible warning' : 
                               'notification-visible';
        
        // Auto hide
        setTimeout(() => {
            notification.className = 'notification-hidden';
        }, 3000);
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', () => {
    window.audioApp = new AudioFilterApp();
});
