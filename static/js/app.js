// Audio Filter PWA - Fixed Version with Working Audio Source & Playback
class AudioFilterApp {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.isPlaying = false;
        this.isRecording = false;
        this.currentWaveform = 'sine';
        this.currentFilter = 'lowpass';
        
        // Audio source management - FIXED
        this.currentAudioSource = 'synthesized'; // 'synthesized', 'uploaded', 'recorded'
        this.uploadedAudioData = null;
        this.recordedAudioData = null;
        this.processedAudioData = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.currentSourceNode = null;
        
        // Mixing parameters
        this.mixingEnabled = false;
        this.modulationType = 'sidechain';
        this.modulationRate = 5;
        this.modulationDepth = 0.5;
        
        // Initialize
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
                if (this.currentAudioSource === 'synthesized') {
                    this.generateWaveform();
                }
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
        
        // FIXED: Audio source buttons - properly initialize
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const source = e.target.dataset.source;
                this.setAudioSource(source);
            });
        });
        
        // Initialize source buttons state
        this.initSourceButtons();
        
        // Slider events
        const sliders = ['frequency', 'cutoffFreq', 'lfoRate', 'lfoDepth', 'modRate', 'modDepth'];
        sliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    this.updateUI();
                    if (['modRate', 'modDepth'].includes(id)) {
                        this.updateMixingParams();
                    }
                });
            }
        });
        
        // Mixing toggle
        const mixingToggle = document.getElementById('mixingToggle');
        if (mixingToggle) {
            mixingToggle.addEventListener('change', () => {
                this.mixingEnabled = mixingToggle.checked;
                const mixingControls = document.getElementById('mixingControls');
                if (mixingControls) {
                    mixingControls.style.display = this.mixingEnabled ? 'block' : 'none';
                }
            });
        }
        
        // Modulation type
        const modType = document.getElementById('modulationType');
        if (modType) {
            modType.addEventListener('change', () => {
                this.modulationType = modType.value;
            });
        }
        
        // Button events
        const buttons = {
            'playBtn': () => this.togglePlay(),
            'stopBtn': () => this.stopAudio(),
            'generateBtn': () => this.generateWaveform(),
            'synthesizeBtn': () => this.synthesizeAudio(),
            'processBtn': () => this.processAudio(),
            'downloadBtn': () => this.downloadAudio(),
            'resetBtn': () => this.reset(),
            'recordBtn': () => this.toggleRecord(),
            'deactivateBtn': () => this.deactivateMicrophone(),
            'uploadBtn': () => document.getElementById('audioUpload').click()
        };
        
        for (const [id, handler] of Object.entries(buttons)) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        }
        
        // Upload handler
        const uploadInput = document.getElementById('audioUpload');
        if (uploadInput) {
            uploadInput.addEventListener('change', (e) => this.handleUpload(e));
        }
        
        // Install prompt
        const installAccept = document.getElementById('installAccept');
        const installDismiss = document.getElementById('installDismiss');
        
        if (installAccept) installAccept.addEventListener('click', () => this.installPWA());
        if (installDismiss) installDismiss.addEventListener('click', () => {
            const prompt = document.getElementById('installPrompt');
            if (prompt) prompt.style.display = 'none';
        });
        
        // Initialize canvas
        this.canvas = document.getElementById('waveVisualizer');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        }
        
        // Initialize mixing controls display
        this.updateMixingControls();
    }
    
    // FIXED: Initialize source buttons
    initSourceButtons() {
        // Set initial active button
        const initialSourceBtn = document.querySelector(`.source-btn[data-source="${this.currentAudioSource}"]`);
        if (initialSourceBtn) {
            initialSourceBtn.classList.add('active');
        }
        
        // Show/hide controls based on initial source
        this.updateSourceControls();
    }
    
    // FIXED: Set audio source with proper UI updates
    setAudioSource(source) {
        this.currentAudioSource = source;
        
        console.log(`Switching to source: ${source}`);
        
        // Update button states
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`.source-btn[data-source="${source}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        // Update source controls visibility
        this.updateSourceControls();
        
        // Load appropriate audio for visualization
        this.loadCurrentAudioForVisualization();
        
        this.showNotification(`Audio source: ${source.charAt(0).toUpperCase() + source.slice(1)}`);
    }
    
    // FIXED: Update source controls visibility
    updateSourceControls() {
        const uploadControls = document.getElementById('uploadControls');
        const recordControls = document.getElementById('recordControls');
        
        if (uploadControls) {
            uploadControls.style.display = this.currentAudioSource === 'uploaded' ? 'block' : 'none';
        }
        
        if (recordControls) {
            recordControls.style.display = this.currentAudioSource === 'recorded' ? 'block' : 'none';
        }
        
        // Update source display
        const sourceDisplay = document.getElementById('sourceDisplay');
        if (sourceDisplay) {
            sourceDisplay.textContent = 
                this.currentAudioSource.charAt(0).toUpperCase() + this.currentAudioSource.slice(1);
        }
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.drawWaveform();
    }
    
    // FIXED: Load current audio for visualization
    async loadCurrentAudioForVisualization() {
        try {
            let audioData = null;
            
            switch (this.currentAudioSource) {
                case 'uploaded':
                    audioData = this.uploadedAudioData;
                    break;
                case 'recorded':
                    audioData = this.recordedAudioData;
                    break;
                case 'synthesized':
                    // Generate new synthesized audio
                    await this.generateWaveform();
                    return;
            }
            
            if (audioData && audioData.length > 0) {
                // Take first 1000 samples for visualization
                const vizData = audioData.slice(0, Math.min(1000, audioData.length));
                this.audioData = vizData;
                this.drawWaveform();
            } else {
                // No audio data for this source
                this.audioData = null;
                this.clearCanvas();
                this.showNotification(`No ${this.currentAudioSource} audio available`, 'warning');
            }
        } catch (error) {
            console.error('Error loading audio for visualization:', error);
            this.showNotification('Error loading audio', 'error');
        }
    }
    
    clearCanvas() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw "No Audio" message
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.font = '14px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            `No ${this.currentAudioSource} audio`,
            this.canvas.width / 2,
            this.canvas.height / 2
        );
        this.ctx.textAlign = 'left';
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
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.deferredPrompt = e;
            this.updateStatus('pwa', 'installable');
            
            setTimeout(() => {
                const prompt = document.getElementById('installPrompt');
                if (prompt && !this.isPWAInstalled()) {
                    prompt.style.display = 'block';
                }
            }, 3000);
        });
        
        if (this.isPWAInstalled()) {
            this.updateStatus('pwa', 'installed');
            const prompt = document.getElementById('installPrompt');
            if (prompt) prompt.style.display = 'none';
        }
    }
    
    isPWAInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches || 
               window.navigator.standalone === true;
    }
    
    updateUI() {
        // Update value displays
        const valueMap = {
            'freqValue': 'frequency',
            'cutoffValue': 'cutoffFreq',
            'lfoRateValue': 'lfoRate',
            'lfoDepthValue': 'lfoDepth',
            'modRateValue': 'modRate',
            'modDepthValue': 'modDepth'
        };
        
        for (const [displayId, inputId] of Object.entries(valueMap)) {
            const inputEl = document.getElementById(inputId);
            const displayEl = document.getElementById(displayId);
            
            if (inputEl && displayEl) {
                displayEl.textContent = inputEl.value;
                
                if (['frequency', 'cutoffFreq', 'lfoRate', 'modRate'].includes(inputId)) {
                    displayEl.textContent += ' Hz';
                } else if (['lfoDepth', 'modDepth'].includes(inputId)) {
                    displayEl.textContent += '%';
                }
            }
        }
        
        // Update visualizer info
        const freqDisplay = document.getElementById('frequencyDisplay');
        const waveformDisplay = document.getElementById('waveformDisplay');
        
        if (freqDisplay) {
            freqDisplay.textContent = document.getElementById('frequency').value + ' Hz';
        }
        
        if (waveformDisplay) {
            waveformDisplay.textContent = 
                this.currentWaveform.charAt(0).toUpperCase() + this.currentWaveform.slice(1);
        }
    }
    
    updateMixingParams() {
        const modRate = document.getElementById('modRate');
        const modDepth = document.getElementById('modDepth');
        
        if (modRate) this.modulationRate = parseFloat(modRate.value);
        if (modDepth) this.modulationDepth = parseFloat(modDepth.value) / 100;
    }
    
    updateMixingControls() {
        const mixingControls = document.getElementById('mixingControls');
        const mixingToggle = document.getElementById('mixingToggle');
        
        if (mixingControls && mixingToggle) {
            mixingControls.style.display = mixingToggle.checked ? 'block' : 'none';
        }
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
                this.processedAudioData = data.audio;
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
    
    // FIXED: processAudio now works with all sources
    async processAudio() {
        let audioData = null;
        
        // Get audio based on current source
        switch (this.currentAudioSource) {
            case 'uploaded':
                if (!this.uploadedAudioData) {
                    this.showNotification('Please upload audio first', 'warning');
                    return;
                }
                audioData = this.uploadedAudioData;
                break;
                
            case 'recorded':
                if (!this.recordedAudioData) {
                    this.showNotification('Please record audio first', 'warning');
                    return;
                }
                audioData = this.recordedAudioData;
                break;
                
            case 'synthesized':
                // For synthesized, use the current parameters
                const synthResponse = await fetch('/api/synthesize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.getParams())
                });
                
                const synthData = await synthResponse.json();
                if (synthData.success) {
                    audioData = synthData.audio;
                } else {
                    this.showNotification('Failed to generate audio', 'error');
                    return;
                }
                break;
        }
        
        if (!audioData || audioData.length === 0) {
            this.showNotification('No audio data to process', 'error');
            return;
        }
        
        try {
            const params = this.getParams();
            params.audio_data = audioData;
            params.process_type = this.currentAudioSource;
            
            console.log('Processing audio with params:', Object.keys(params));
            
            const response = await fetch('/api/process_audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.processedAudioData = data.processed_audio;
                
                // Update visualization
                if (data.processed_audio && data.processed_audio.length > 0) {
                    const vizData = data.processed_audio.slice(0, Math.min(1000, data.processed_audio.length));
                    this.audioData = vizData;
                    this.drawWaveform();
                }
                
                this.showNotification(`Audio processed (${this.currentAudioSource})`);
            } else {
                this.showNotification('Processing failed: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Process error:', error);
            this.showNotification('Failed to process: ' + error.message, 'error');
        }
    }
    
    getParams() {
        const params = {
            frequency: parseFloat(document.getElementById('frequency').value),
            duration: 1.0,
            waveform: this.currentWaveform,
            filter_type: this.currentFilter,
            cutoff_freq: parseFloat(document.getElementById('cutoffFreq').value),
            resonance: 0.7,
            lfo_enabled: document.getElementById('lfoEnabled')?.checked || false,
            lfo_freq: parseFloat(document.getElementById('lfoRate').value),
            lfo_waveform: 'sine',
            lfo_depth: parseFloat(document.getElementById('lfoDepth').value) / 100,
            process_type: this.currentAudioSource
        };
        
        // Add mixing parameters if enabled
        if (this.mixingEnabled) {
            params.mixing_enabled = true;
            params.modulation_type = this.modulationType;
            params.modulation_rate = this.modulationRate;
            params.modulation_depth = this.modulationDepth;
        }
        
        return params;
    }
    
    drawWaveform() {
        if (!this.ctx || !this.audioData) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const data = this.audioData;
        
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
        
        // Draw waveform with color based on audio source
        let waveformColor;
        switch (this.currentAudioSource) {
            case 'uploaded':
                waveformColor = '#48bb78'; // Green
                break;
            case 'recorded':
                waveformColor = '#ed8936'; // Orange
                break;
            default:
                waveformColor = '#667eea'; // Blue
        }
        
        this.ctx.strokeStyle = waveformColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        const step = Math.max(1, width / data.length);
        
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
        
        // Draw audio source label
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.font = '10px monospace';
        this.ctx.fillText(
            `Source: ${this.currentAudioSource}`,
            10,
            height - 10
        );
    }
    
    async createAudioBuffer(audioData, sampleRate) {
        if (!this.audioContext) {
            this.initAudio();
            if (!this.audioContext) return false;
        }
        
        try {
            const buffer = this.audioContext.createBuffer(1, audioData.length, sampleRate || 44100);
            const channelData = buffer.getChannelData(0);
            
            // Normalize to prevent clipping
            let maxVal = 0.0001;
            for (const sample of audioData) {
                const absSample = Math.abs(sample);
                if (absSample > maxVal) maxVal = absSample;
            }
            
            const scale = maxVal > 0 ? 0.8 / maxVal : 1;
            
            for (let i = 0; i < audioData.length; i++) {
                channelData[i] = audioData[i] * scale;
            }
            
            this.audioBuffer = buffer;
            return true;
        } catch (error) {
            console.error('Create buffer error:', error);
            return false;
        }
    }
    
    // FIXED: playAudio now correctly plays uploaded/recorded audio
    async playAudio() {
        let audioToPlay = null;
        
        // Determine which audio to play
        if (this.processedAudioData && this.processedAudioData.length > 0) {
            console.log('Playing processed audio');
            audioToPlay = this.processedAudioData;
        } else {
            console.log(`Playing ${this.currentAudioSource} audio`);
            switch (this.currentAudioSource) {
                case 'uploaded':
                    audioToPlay = this.uploadedAudioData;
                    break;
                case 'recorded':
                    audioToPlay = this.recordedAudioData;
                    break;
                case 'synthesized':
                    // Synthesize fresh audio
                    await this.synthesizeAudio();
                    audioToPlay = this.processedAudioData;
                    break;
            }
        }
        
        if (!audioToPlay || audioToPlay.length === 0) {
            this.showNotification('No audio to play', 'warning');
            return;
        }
        
        console.log(`Audio length: ${audioToPlay.length} samples`);
        
        if (!this.audioContext) {
            this.initAudio();
        }
        
        try {
            // Create audio buffer
            const bufferCreated = await this.createAudioBuffer(audioToPlay, 44100);
            if (!bufferCreated || !this.audioBuffer) {
                this.showNotification('Failed to create audio buffer', 'error');
                return;
            }
            
            // Stop any existing playback
            this.stopAudio();
            
            // Create and start new source
            this.currentSourceNode = this.audioContext.createBufferSource();
            this.currentSourceNode.buffer = this.audioBuffer;
            this.currentSourceNode.connect(this.audioContext.destination);
            
            this.currentSourceNode.start();
            this.isPlaying = true;
            
            const playBtn = document.getElementById('playBtn');
            if (playBtn) playBtn.classList.add('playing');
            
            this.showNotification('Playing audio...');
            
            // Handle playback end
            this.currentSourceNode.onended = () => {
                this.isPlaying = false;
                if (playBtn) playBtn.classList.remove('playing');
                this.currentSourceNode = null;
                this.showNotification('Playback finished');
            };
            
        } catch (error) {
            console.error('Play error:', error);
            this.showNotification('Failed to play audio: ' + error.message, 'error');
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
        if (this.currentSourceNode) {
            try {
                this.currentSourceNode.stop();
                this.currentSourceNode.disconnect();
            } catch (e) {
                // Ignore if already stopped
            }
            this.currentSourceNode = null;
        }
        
        this.isPlaying = false;
        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.classList.remove('playing');
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
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });
            
            this.mediaRecorder = new MediaRecorder(stream);
            this.recordedChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = async () => {
                try {
                    const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    
                    // Use a temporary audio context to decode
                    const tempContext = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);
                    
                    // Extract mono channel data
                    const channelData = audioBuffer.getChannelData(0);
                    this.recordedAudioData = Array.from(channelData);
                    
                    // Switch to recorded source
                    this.setAudioSource('recorded');
                    
                    this.showNotification('Recording saved');
                    
                    // Clean up
                    tempContext.close();
                    stream.getTracks().forEach(track => track.stop());
                    
                } catch (error) {
                    console.error('Recording processing error:', error);
                    this.showNotification('Failed to process recording', 'error');
                }
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
            const recordBtn = document.getElementById('recordBtn');
            if (recordBtn) recordBtn.classList.add('recording');
            
            this.showNotification('Recording... Click again to stop.');
            
        } catch (error) {
            console.error('Recording error:', error);
            this.showNotification('Recording failed: ' + error.message, 'error');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        this.isRecording = false;
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) recordBtn.classList.remove('recording');
    }
    
    deactivateMicrophone() {
        if (this.mediaRecorder && this.mediaRecorder.stream) {
            this.mediaRecorder.stream.getTracks().forEach(track => {
                track.stop();
            });
        }
        
        this.isRecording = false;
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) recordBtn.classList.remove('recording');
        
        this.showNotification('Microphone deactivated');
    }
    
    async handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('audio/')) {
            this.showNotification('Please select an audio file', 'error');
            return;
        }
        
        try {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    // Convert to mono
                    const channelData = audioBuffer.getChannelData(0);
                    this.uploadedAudioData = Array.from(channelData);
                    
                    console.log(`Uploaded audio: ${this.uploadedAudioData.length} samples`);
                    
                    // Switch to uploaded source
                    this.setAudioSource('uploaded');
                    
                    // Clean up
                    audioContext.close();
                    
                } catch (error) {
                    console.error('Audio processing error:', error);
                    this.showNotification('Failed to process audio file', 'error');
                }
            };
            
            reader.onerror = () => {
                this.showNotification('Failed to read file', 'error');
            };
            
            reader.readAsArrayBuffer(file);
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification('Upload failed: ' + error.message, 'error');
        }
    }
    
    // ... (downloadAudio, createWavFile, writeString methods remain the same as previous version)
    
    reset() {
        this.stopAudio();
        this.deactivateMicrophone();
        
        // Reset audio data
        this.uploadedAudioData = null;
        this.recordedAudioData = null;
        this.processedAudioData = null;
        this.audioBuffer = null;
        
        // Reset to synthesized source
        this.setAudioSource('synthesized');
        
        // Reset UI controls
        const controls = {
            'frequency': 440,
            'cutoffFreq': 1000,
            'lfoRate': 5,
            'lfoDepth': 50
        };
        
        for (const [id, value] of Object.entries(controls)) {
            const el = document.getElementById(id);
            if (el) el.value = value;
        }
        
        const lfoEnabled = document.getElementById('lfoEnabled');
        if (lfoEnabled) lfoEnabled.checked = false;
        
        // Reset mixing
        this.mixingEnabled = false;
        const mixingToggle = document.getElementById('mixingToggle');
        if (mixingToggle) mixingToggle.checked = false;
        this.updateMixingControls();
        
        this.updateUI();
        this.generateWaveform();
        
        this.showNotification('Reset complete');
    }
    
    installPWA() {
        if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            
            window.deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    this.showNotification('PWA installed successfully');
                    this.updateStatus('pwa', 'installed');
                }
                window.deferredPrompt = null;
            });
        }
        
        const prompt = document.getElementById('installPrompt');
        if (prompt) prompt.style.display = 'none';
    }
    
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.audioFilterApp = new AudioFilterApp();
});
