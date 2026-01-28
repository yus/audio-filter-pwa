// Audio Filter PWA - Main Application
class AudioFilterPWA {
    constructor() {
        this.audioContext = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.isPlaying = false;
        this.currentAudioBuffer = null;
        this.sourceNode = null;
        this.analyser = null;
        this.audioData = null;
        this.processedAudio = null;
        
        this.init();
    }
    
    init() {
        console.log('Audio Filter PWA Initializing...');
        
        this.bindEvents();
        this.initCanvases();
        this.initAudioContext();
        this.updateUIValues();
        this.checkAPI();
        this.initPWA();
        
        // Generate initial waveform
        setTimeout(() => this.generateWaveform(), 500);
    }
    
    bindEvents() {
        // Slider events
        const sliders = ['frequency', 'duration', 'cutoffFreq', 'resonance', 'lfoFreq', 'lfoDepth'];
        sliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.updateUIValues());
        });
        
        // Button events
        document.getElementById('generateBtn')?.addEventListener('click', () => this.generateWaveform());
        document.getElementById('synthesizeBtn')?.addEventListener('click', () => this.synthesizeAudio());
        document.getElementById('playBtn')?.addEventListener('click', () => this.playAudio());
        document.getElementById('stopBtn')?.addEventListener('click', () => this.stopAudio());
        document.getElementById('recordBtn')?.addEventListener('click', () => this.startRecording());
        document.getElementById('stopRecordBtn')?.addEventListener('click', () => this.stopRecording());
        document.getElementById('uploadBtn')?.addEventListener('click', () => this.triggerUpload());
        document.getElementById('audioUpload')?.addEventListener('change', (e) => this.handleAudioUpload(e));
        document.getElementById('downloadBtn')?.addEventListener('click', () => this.downloadAudio());
        document.getElementById('resetBtn')?.addEventListener('click', () => this.reset());
        document.getElementById('installBtn')?.addEventListener('click', () => this.installPWA());
        
        // Dropdown events
        ['waveform', 'filterType', 'lfoWaveform'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.generateWaveform());
        });
        
        // Toggle events
        document.getElementById('lfoEnabled')?.addEventListener('change', () => this.generateWaveform());
    }
    
    initCanvases() {
        this.canvases = {
            waveform: document.getElementById('waveformCanvas'),
            input: document.getElementById('inputVisualizer'),
            output: document.getElementById('outputVisualizer')
        };
        
        this.ctx = {};
        
        for (const [key, canvas] of Object.entries(this.canvases)) {
            if (canvas) {
                this.ctx[key] = canvas.getContext('2d');
                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
            }
        }
        
        window.addEventListener('resize', () => {
            for (const [key, canvas] of Object.entries(this.canvases)) {
                if (canvas) {
                    canvas.width = canvas.offsetWidth;
                    canvas.height = canvas.offsetHeight;
                }
            }
            this.drawWaveform();
            this.drawVisualizers();
        });
    }
    
    async initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext initialized');
        } catch (e) {
            console.error('AudioContext not supported:', e);
            this.showNotification('Web Audio API not supported in this browser', 'error');
        }
    }
    
    updateUIValues() {
        // Update all value displays
        const updates = {
            'frequencyValue': {el: 'frequency', suffix: ' Hz'},
            'durationValue': {el: 'duration', suffix: ' s'},
            'cutoffValue': {el: 'cutoffFreq', suffix: ' Hz'},
            'resonanceValue': {el: 'resonance', suffix: ''},
            'lfoFreqValue': {el: 'lfoFreq', suffix: ' Hz'},
            'lfoDepthValue': {el: 'lfoDepth', suffix: ''}
        };
        
        for (const [displayId, config] of Object.entries(updates)) {
            const displayEl = document.getElementById(displayId);
            const sourceEl = document.getElementById(config.el);
            if (displayEl && sourceEl) {
                displayEl.textContent = sourceEl.value + config.suffix;
            }
        }
    }
    
    async checkAPI() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            const statusEl = document.getElementById('connectionStatus');
            if (statusEl) {
                statusEl.textContent = '🟢 API Connected';
                statusEl.style.color = 'green';
            }
            return true;
        } catch (error) {
            const statusEl = document.getElementById('connectionStatus');
            if (statusEl) {
                statusEl.textContent = '🔴 API Disconnected';
                statusEl.style.color = 'red';
            }
            this.showNotification('Cannot connect to server API', 'error');
            return false;
        }
    }
    
    async generateWaveform() {
        try {
            const params = this.getParams();
            
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.audioData = data.waveform;
                this.drawWaveform();
                this.showNotification(`Generated ${data.samples} samples`, 'success');
            } else {
                this.showNotification(`Error: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Generate error:', error);
            this.showNotification('Failed to generate waveform', 'error');
        }
    }
    
    async synthesizeAudio() {
        try {
            const params = this.getParams();
            
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.processedAudio = data.audio;
                await this.createAudioBuffer(this.processedAudio, data.sample_rate);
                this.drawVisualizers();
                this.showNotification(`Synthesized ${data.duration}s audio`, 'success');
            } else {
                this.showNotification(`Error: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Synthesize error:', error);
            this.showNotification('Failed to synthesize audio', 'error');
        }
    }
    
    async processAudio(audioData) {
        try {
            const params = this.getParams();
            params.audio_data = audioData;
            
            const response = await fetch('/api/process_audio', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.processedAudio = data.processed_audio;
                this.drawVisualizers();
                this.showNotification(`Processed ${data.processed_length} samples`, 'success');
            } else {
                this.showNotification(`Error: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Process error:', error);
            this.showNotification('Failed to process audio', 'error');
        }
    }
    
    getParams() {
        return {
            frequency: parseFloat(document.getElementById('frequency')?.value || 440),
            duration: parseFloat(document.getElementById('duration')?.value || 1.0),
            waveform: document.getElementById('waveform')?.value || 'sine',
            filter_type: document.getElementById('filterType')?.value || 'lowpass',
            cutoff_freq: parseFloat(document.getElementById('cutoffFreq')?.value || 1000),
            resonance: parseFloat(document.getElementById('resonance')?.value || 0.7),
            lfo_enabled: document.getElementById('lfoEnabled')?.checked || false,
            lfo_freq: parseFloat(document.getElementById('lfoFreq')?.value || 5),
            lfo_waveform: document.getElementById('lfoWaveform')?.value || 'sine',
            lfo_depth: parseFloat(document.getElementById('lfoDepth')?.value || 0.5)
        };
    }
    
    drawWaveform() {
        if (!this.ctx.waveform || !this.audioData) return;
        
        const ctx = this.ctx.waveform;
        const canvas = this.canvases.waveform;
        const width = canvas.width;
        const height = canvas.height;
        const data = this.audioData;
        
        // Clear
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
        
        const step = width / data.length;
        
        for (let i = 0; i < data.length; i++) {
            const x = i * step;
            const y = (1 - (data[i] + 1) / 2) * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }
    
    drawVisualizers() {
        // Draw input visualizer
        if (this.ctx.input && this.audioData) {
            this.drawBars(this.ctx.input, this.canvases.input, this.audioData);
        }
        
        // Draw output visualizer
        if (this.ctx.output && this.processedAudio) {
            this.drawBars(this.ctx.output, this.canvases.output, this.processedAudio);
        }
    }
    
    drawBars(ctx, canvas, data) {
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        // Use actual data or generate random for demo
        const barCount = 64;
        const barWidth = width / barCount;
        
        for (let i = 0; i < barCount; i++) {
            let value;
            if (data && data.length > i) {
                // Use actual audio data
                const idx = Math.floor(i * (data.length / barCount));
                value = Math.abs(data[idx]) || 0;
            } else {
                // Fallback to random
                value = Math.random() * 0.8;
            }
            
            const barHeight = value * height;
            const x = i * barWidth;
            const y = height - barHeight;
            
            const gradient = ctx.createLinearGradient(0, y, 0, height);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(1, '#764ba2');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
        }
    }
    
    async createAudioBuffer(audioData, sampleRate) {
        if (!this.audioContext) return;
        
        try {
            const buffer = this.audioContext.createBuffer(1, audioData.length, sampleRate);
            const channelData = buffer.getChannelData(0);
            
            for (let i = 0; i < audioData.length; i++) {
                channelData[i] = audioData[i];
            }
            
            this.currentAudioBuffer = buffer;
            
            // Setup analyser for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            
        } catch (error) {
            console.error('Create buffer error:', error);
        }
    }
    
    async playAudio() {
        if (!this.audioContext || !this.currentAudioBuffer) {
            await this.synthesizeAudio();
            if (!this.currentAudioBuffer) return;
        }
        
        if (this.isPlaying) {
            this.stopAudio();
            return;
        }
        
        try {
            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = this.currentAudioBuffer;
            
            // Connect through analyser for visualization
            if (this.analyser) {
                this.sourceNode.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);
            } else {
                this.sourceNode.connect(this.audioContext.destination);
            }
            
            this.sourceNode.start();
            this.isPlaying = true;
            
            const playBtn = document.getElementById('playBtn');
            if (playBtn) {
                playBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            }
            
            this.sourceNode.onended = () => {
                this.isPlaying = false;
                if (playBtn) {
                    playBtn.innerHTML = '<i class
