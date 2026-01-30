// Audio Filter PWA - Enhanced Version with Audio Source Management & Mixing
class AudioFilterApp {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.isPlaying = false;
        this.isRecording = false;
        this.currentWaveform = 'sine';
        this.currentFilter = 'lowpass';
        
        // NEW: Audio source management
        this.currentAudioSource = 'synthesized'; // 'synthesized', 'uploaded', 'recorded'
        this.uploadedAudioData = null;
        this.recordedAudioData = null;
        this.processedAudioData = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        
        // NEW: Mixing parameters
        this.mixingEnabled = false;
        this.modulationType = 'sidechain';
        this.modulationRate = 5;
        this.modulationDepth = 0.5;
        
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
        
        // Audio source buttons (NEW)
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const source = e.target.dataset.source;
                this.setAudioSource(source);
            });
        });
        
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
        
        // Mixing toggle (NEW)
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
        
        // Modulation type (NEW)
        const modType = document.getElementById('modulationType');
        if (modType) {
            modType.addEventListener('change', () => {
                this.modulationType = modType.value;
            });
        }
        
        // Button events
        document.getElementById('playBtn').addEventListener('click', () => this.togglePlay());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopAudio());
        document.getElementById('generateBtn').addEventListener('click', () => this.generateWaveform());
        document.getElementById('synthesizeBtn').addEventListener('click', () => this.synthesizeAudio());
        document.getElementById('processBtn').addEventListener('click', () => this.processAudio());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadAudio());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecord());
        document.getElementById('deactivateBtn').addEventListener('click', () => this.deactivateMicrophone());
        document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('audioUpload').click());
        document.getElementById('audioUpload').addEventListener('change', (e) => this.handleUpload(e));
        
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
    
    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.drawWaveform();
    }
    
    // NEW: Set audio source
    setAudioSource(source) {
        this.currentAudioSource = source;
        
        // Update UI
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`.source-btn[data-source="${source}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        // Show/hide relevant controls
        const uploadControls = document.getElementById('uploadControls');
        const recordControls = document.getElementById('recordControls');
        
        if (uploadControls) uploadControls.style.display = 
            source === 'uploaded' ? 'block' : 'none';
        if (recordControls) recordControls.style.display = 
            source === 'recorded' ? 'block' : 'none';
        
        this.showNotification(`Source: ${source.charAt(0).toUpperCase() + source.slice(1)}`);
        
        // Load appropriate audio data for visualization
        this.loadCurrentAudioForVisualization();
    }
    
    // NEW: Load current audio for visualization
    async loadCurrentAudioForVisualization() {
        try {
            let audioData = null;
            
            switch (this.currentAudioSource) {
                case 'uploaded':
                    if (this.uploadedAudioData) {
                        audioData = this.uploadedAudioData;
                    } else {
                        this.showNotification('No audio uploaded yet', 'warning');
                        return;
                    }
                    break;
                    
                case 'recorded':
                    if (this.recordedAudioData) {
                        audioData = this.recordedAudioData;
                    } else {
                        this.showNotification('No audio recorded yet', 'warning');
                        return;
                    }
                    break;
                    
                case 'synthesized':
                    // Generate new synthesized audio for visualization
                    await this.generateWaveform();
                    return;
            }
            
            if (audioData && audioData.length > 0) {
                // Take first 1000 samples for visualization
                const vizData = audioData.slice(0, Math.min(1000, audioData.length));
                this.audioData = vizData;
                this.drawWaveform();
            }
        } catch (error) {
            console.error('Error loading audio for visualization:', error);
        }
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
                
                // Add units for specific fields
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
        
        // Update source indicator
        const sourceDisplay = document.getElementById('sourceDisplay');
        if (sourceDisplay) {
            sourceDisplay.textContent = 
                this.currentAudioSource.charAt(0).toUpperCase() + this.currentAudioSource.slice(1);
        }
    }
    
    // NEW: Update mixing parameters
    updateMixingParams() {
        const modRate = document.getElementById('modRate');
        const modDepth = document.getElementById('modDepth');
        
        if (modRate) this.modulationRate = parseFloat(modRate.value);
        if (modDepth) this.modulationDepth = parseFloat(modDepth.value) / 100;
    }
    
    // NEW: Update mixing controls visibility
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
            // For synthesized audio, use the regular endpoint
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
                // Store as synthesized audio
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
    
    // FIXED: processAudio now works correctly with all audio sources
    async processAudio() {
        let audioData = null;
        let processType = 'uploaded';
        
        // Get the appropriate audio data based on source
        switch (this.currentAudioSource) {
            case 'uploaded':
                if (!this.uploadedAudioData) {
                    this.showNotification('Please upload audio first', 'warning');
                    return;
                }
                audioData = this.uploadedAudioData;
                processType = 'uploaded';
                break;
                
            case 'recorded':
                if (!this.recordedAudioData) {
                    this.showNotification('Please record audio first', 'warning');
                    return;
                }
                audioData = this.recordedAudioData;
                processType = 'recorded';
                break;
                
            case 'synthesized':
                // For synthesized, we need to generate it first
                await this.synthesizeAudio();
                if (!this.processedAudioData) {
                    this.showNotification('Failed to generate audio for processing', 'error');
                    return;
                }
                audioData = this.processedAudioData;
                processType = 'synthesized';
                break;
        }
        
        if (!audioData || audioData.length === 0) {
            this.showNotification('No audio data to process', 'error');
            return;
        }
        
        try {
            const params = this.getParams();
            params.audio_data = audioData;
            params.process_type = processType;
            params.session_id = 'default';
            
            // Include mixing parameters if enabled
            if (this.mixingEnabled) {
                params.mixing_enabled = true;
                params.modulation_type = this.modulationType;
                params.modulation_rate = this.modulationRate;
                params.modulation_depth = this.modulationDepth;
            }
            
            const response = await fetch('/api/process_audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.processedAudioData = data.processed_audio;
                
                // Update visualization with first 1000 samples
                if (data.processed_audio && data.processed_audio.length > 0) {
                    const vizData = data.processed_audio.slice(0, Math.min(1000, data.processed_audio.length));
                    this.audioData = vizData;
                    this.drawWaveform();
                }
                
                this.showNotification(`Audio processed (${processType})`);
            } else {
                this.showNotification('Processing failed: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Process error:', error);
            this.showNotification('Failed to process', 'error');
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
            lfo_enabled: document.getElementById('lfoEnabled').checked,
            lfo_freq: parseFloat(document.getElementById('lfoRate').value),
            lfo_waveform: 'sine',
            lfo_depth: parseFloat(document.getElementById('lfoDepth').value) / 100
        };
        
        // Add mixing parameters only if enabled
        if (this.mixingEnabled) {
            params.mixing_enabled = true;
            params.modulation_type = this.modulationType;
            params.modulation_rate = this.modulationRate;
            params.modulation_depth = this.modulationDepth;
        }
        
        // Add process_type for uploaded/recorded audio
        params.process_type = this.currentAudioSource;
        
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
        if (!this.audioContext) return false;
        
        try {
            const buffer = this.audioContext.createBuffer(1, audioData.length, sampleRate || 44100);
            const channelData = buffer.getChannelData(0);
            
            // Copy and normalize audio data
            const maxVal = Math.max(...audioData.map(Math.abs));
            const scale = maxVal > 0 ? 1 / maxVal : 1;
            
            for (let i = 0; i < audioData.length; i++) {
                channelData[i] = audioData[i] * scale * 0.8; // Scale to prevent clipping
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
    
    // FIXED: playAudio now plays the correct audio based on source
    async playAudio() {
        let audioToPlay = null;
        
        // Determine which audio to play
        if (this.processedAudioData && this.processedAudioData.length > 0) {
            audioToPlay = this.processedAudioData;
        } else {
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
        
        if (!this.audioContext) {
            this.initAudio();
        }
        
        try {
            await this.createAudioBuffer(audioToPlay, 44100);
            
            if (!this.audioBuffer) {
                this.showNotification('Failed to create audio buffer', 'error');
                return;
            }
            
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
                this.showNotification('Playback finished');
            };
            
        } catch (error) {
            console.error('Play error:', error);
            this.showNotification('Failed to play audio', 'error');
        }
    }
    
    stopAudio() {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch (e) {
                // Ignore errors if already stopped
            }
            this.sourceNode = null;
        }
        
        this.isPlaying = false;
        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.classList.remove('playing');
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
                const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                
                // Convert to audio buffer
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Extract mono channel data
                const channelData = audioBuffer.getChannelData(0);
                this.recordedAudioData = Array.from(channelData);
                
                // Switch to recorded source
                this.setAudioSource('recorded');
                
                // Visualize the recorded audio
                const vizData = this.recordedAudioData.slice(0, Math.min(1000, this.recordedAudioData.length));
                this.audioData = vizData;
                this.drawWaveform();
                
                this.showNotification('Recording saved');
                
                // Clean up
                stream.getTracks().forEach(track => track.stop());
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
            document.getElementById('recordBtn').classList.add('recording');
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
        document.getElementById('recordBtn').classList.remove('recording');
    }
    
    // NEW: Deactivate microphone
    deactivateMicrophone() {
        if (this.mediaRecorder && this.mediaRecorder.stream) {
            this.mediaRecorder.stream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
        }
        
        this.isRecording = false;
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) recordBtn.classList.remove('recording');
        
        this.showNotification('Microphone deactivated');
    }
    
    // NEW: Handle audio upload
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
                    
                    // Switch to uploaded source
                    this.setAudioSource('uploaded');
                    
                    // Visualize
                    const vizData = this.uploadedAudioData.slice(0, Math.min(1000, this.uploadedAudioData.length));
                    this.audioData = vizData;
                    this.drawWaveform();
                    
                    this.showNotification('Audio uploaded successfully');
                    
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
    
    async downloadAudio() {
        if (!this.processedAudioData && !this.audioBuffer) {
            this.showNotification('No audio to download', 'warning');
            return;
        }
        
        try {
            let audioData = this.processedAudioData;
            
            if (!audioData && this.audioBuffer) {
                // Extract from audio buffer
                audioData = Array.from(this.audioBuffer.getChannelData(0));
            }
            
            if (!audioData) {
                this.showNotification('No audio data available', 'error');
                return;
            }
            
            // Create WAV file (simplified version)
            const wavData = this.createWavFile(audioData, 44100);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `audio_filter_${Date.now()}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
            this.showNotification('Audio downloaded');
            
        } catch (error) {
            console.error('Download error:', error);
            this.showNotification('Download failed', 'error');
        }
    }
    
    createWavFile(audioData, sampleRate) {
        // Simplified WAV creation - in production, use a proper library
        const buffer = new ArrayBuffer(44 + audioData.length * 2);
        const view = new DataView(buffer);
        
        // Write WAV header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 32 + audioData.length * 2, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, audioData.length * 2, true);
        
        // Write audio data
        let offset = 44;
        for (let i = 0; i < audioData.length; i++) {
            const sample = Math.max(-1, Math.min(1, audioData[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
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
        this.deactivateMicrophone();
        
        // Reset audio data
        this.uploadedAudioData = null;
        this.recordedAudioData = null;
        this.processedAudioData = null;
        this.audioBuffer = null;
        
        // Reset to synthesized source
        this.setAudioSource('synthesized');
        
        // Reset UI
        document.getElementById('frequency').value = 440;
        document.getElementById('cutoffFreq').value = 1000;
        document.getElementById('lfoRate').value = 5;
        document.getElementById('lfoDepth').value = 50;
        document.getElementById('lfoEnabled').checked = false;
        
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
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.audioFilterApp = new AudioFilterApp();
});
