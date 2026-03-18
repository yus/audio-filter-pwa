// Audio Filter PRO - Enhanced Version with All Features
console.log('Audio Filter PRO LOADING...');

class AudioFilterPro {
    constructor() {
        this.uploadedAudio = null;
        this.processedAudio = null;
        this.audioContext = null;
        this.sourceNode = null;
        this.isPlaying = false;
        this.isProcessing = false;
        
        // Filter state
        this.filters = {
            lowpass: { enabled: true, freq: 1000, q: 0.7, type: 'lowpass' },
            highpass: { enabled: false, freq: 100, q: 0.7, type: 'highpass' },
            bandpass: { enabled: false, freq: 500, q: 1.0, type: 'bandpass' },
            notch: { enabled: false, freq: 60, q: 10, type: 'notch' },
            lowshelf: { enabled: false, freq: 300, gain: 0, type: 'lowshelf' },
            highshelf: { enabled: false, freq: 3000, gain: 0, type: 'highshelf' },
            peaking: { enabled: false, freq: 1000, gain: 0, q: 1.0, type: 'peaking' }
        };
        
        // History for undo/redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        
        // Zoom and selection
        this.zoomLevel = 1.0;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.isSelecting = false;
        
        // Constants
        this.MAX_DURATION = 300; // 5 minutes max
        this.CHUNK_SIZE = 44100 * 10; // Process in 10-second chunks
        
        this.init();
    }
    
    init() {
        this.setupUI();
        this.setupCanvas();
        this.setupKeyboardShortcuts();
        this.updateFilterUI();
        console.log('Audio Filter PRO ready');
    }
    
    setupUI() {
        // Main action buttons
        this.setupButton('uploadBtn', () => this.uploadAudio());
        this.setupButton('processBtn', () => this.processAudio());
        this.setupButton('playBtn', () => this.togglePlay());
        this.setupButton('stopBtn', () => this.stopAudio());
        this.setupButton('resetBtn', () => this.reset());
        this.setupButton('undoBtn', () => this.undo());
        this.setupButton('redoBtn', () => this.redo());
        this.setupButton('zoomInBtn', () => this.zoomIn());
        this.setupButton('zoomOutBtn', () => this.zoomOut());
        this.setupButton('fitViewBtn', () => this.fitView());
        
        // Filter tabs
        this.setupFilterTabs();
        
        // Filter controls
        this.setupFilterControls();
        
        // Status element
        this.statusEl = document.getElementById('status');
        if (!this.statusEl) {
            this.statusEl = document.createElement('div');
            this.statusEl.id = 'status';
            document.querySelector('.container').appendChild(this.statusEl);
        }
    }
    
    setupButton(id, handler) {
        const btn = document.getElementById(id);
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                handler();
            });
        }
    }
    
    setupFilterTabs() {
        const tabContainer = document.getElementById('filterTabs');
        if (!tabContainer) return;
        
        const filterTypes = [
            { id: 'lowpass', name: 'LP', icon: '🔽' },
            { id: 'highpass', name: 'HP', icon: '🔼' },
            { id: 'bandpass', name: 'BP', icon: '🔁' },
            { id: 'notch', name: 'NOTCH', icon: '⛔' },
            { id: 'lowshelf', name: 'LOW', icon: '📉' },
            { id: 'highshelf', name: 'HIGH', icon: '📈' },
            { id: 'peaking', name: 'PEAK', icon: '🔔' }
        ];
        
        tabContainer.innerHTML = '';
        filterTypes.forEach(filter => {
            const tab = document.createElement('button');
            tab.className = `filter-tab ${filter.id === 'lowpass' ? 'active' : ''}`;
            tab.dataset.filter = filter.id;
            tab.innerHTML = `<span class="filter-icon">${filter.icon}</span><span class="filter-name">${filter.name}</span>`;
            tab.addEventListener('click', () => this.activateFilterTab(filter.id));
            tabContainer.appendChild(tab);
        });
    }
    
    setupFilterControls() {
        const controlsContainer = document.getElementById('filterControls');
        if (!controlsContainer) return;
        
        // Create control panels for each filter type
        const filterPanels = {
            lowpass: this.createFilterPanel('lowpass', ['freq', 'q']),
            highpass: this.createFilterPanel('highpass', ['freq', 'q']),
            bandpass: this.createFilterPanel('bandpass', ['freq', 'q']),
            notch: this.createFilterPanel('notch', ['freq', 'q']),
            lowshelf: this.createFilterPanel('lowshelf', ['freq', 'gain']),
            highshelf: this.createFilterPanel('highshelf', ['freq', 'gain']),
            peaking: this.createFilterPanel('peaking', ['freq', 'gain', 'q'])
        };
        
        controlsContainer.innerHTML = '';
        Object.values(filterPanels).forEach(panel => {
            controlsContainer.appendChild(panel);
        });
        
        // Show only active filter panel
        this.updateFilterUI();
    }
    
    createFilterPanel(filterType, controls) {
        const panel = document.createElement('div');
        panel.className = `filter-panel ${filterType}-panel`;
        panel.dataset.filter = filterType;
        
        // Enable/disable toggle
        const toggle = document.createElement('div');
        toggle.className = 'filter-toggle';
        toggle.innerHTML = `
            <label class="switch">
                <input type="checkbox" class="filter-enabled" data-filter="${filterType}" ${filterType === 'lowpass' ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
            <span class="filter-label">${filterType.toUpperCase()}</span>
        `;
        panel.appendChild(toggle);
        
        // Control knobs
        const knobs = document.createElement('div');
        knobs.className = 'filter-knobs';
        
        controls.forEach(control => {
            const knob = document.createElement('div');
            knob.className = 'knob-container';
            
            if (control === 'freq') {
                knob.innerHTML = this.createDualKnobHTML(filterType, 'freq');
            } else {
                knob.innerHTML = this.createKnobHTML(filterType, control);
            }
            
            knobs.appendChild(knob);
        });
        
        panel.appendChild(knobs);
        
        // Add event listeners after panel is added to DOM
        setTimeout(() => {
            this.attachKnobListeners(panel, filterType);
        }, 0);
        
        return panel;
    }
    
    createKnobHTML(filterType, param) {
        const filter = this.filters[filterType];
        const value = filter[param] || 0;
        const min = param === 'gain' ? -24 : (param === 'q' ? 0.1 : 20);
        const max = param === 'gain' ? 24 : (param === 'q' ? 20 : 20000);
        const step = param === 'q' ? 0.1 : (param === 'gain' ? 0.1 : 1);
        
        return `
            <div class="knob" data-filter="${filterType}" data-param="${param}">
                <div class="knob-indicator" style="transform: rotate(${this.valueToAngle(value, min, max)}deg)"></div>
                <input type="range" 
                       class="knob-slider" 
                       data-filter="${filterType}" 
                       data-param="${param}"
                       min="${min}" 
                       max="${max}" 
                       step="${step}" 
                       value="${value}">
            </div>
            <label>${param}</label>
            <span class="knob-value" data-filter="${filterType}" data-param="${param}">${this.formatValue(value, param)}</span>
        `;
    }
    
    createDualKnobHTML(filterType, param) {
        const filter = this.filters[filterType];
        return `
            <div class="dual-knob">
                <div class="knob-row">
                    <div class="knob" data-filter="${filterType}" data-param="freq1">
                        <div class="knob-indicator" style="transform: rotate(${this.valueToAngle(filter.freq1 || 20, 20, 20000)}deg)"></div>
                        <input type="range" class="knob-slider" data-filter="${filterType}" data-param="freq1" min="20" max="20000" step="1" value="${filter.freq1 || 20}">
                    </div>
                    <span class="knob-value" data-filter="${filterType}" data-param="freq1">${filter.freq1 || 20}Hz</span>
                </div>
                <div class="knob-row">
                    <div class="knob" data-filter="${filterType}" data-param="freq2">
                        <div class="knob-indicator" style="transform: rotate(${this.valueToAngle(filter.freq2 || 20000, 20, 20000)}deg)"></div>
                        <input type="range" class="knob-slider" data-filter="${filterType}" data-param="freq2" min="20" max="20000" step="1" value="${filter.freq2 || 20000}">
                    </div>
                    <span class="knob-value" data-filter="${filterType}" data-param="freq2">${filter.freq2 || 20000}Hz</span>
                </div>
            </div>
            <label>Freq Range</label>
        `;
    }
    
    attachKnobListeners(panel, filterType) {
        // Enable/disable toggle
        const toggle = panel.querySelector('.filter-enabled');
        if (toggle) {
            toggle.addEventListener('change', (e) => {
                this.filters[filterType].enabled = e.target.checked;
                this.updateFilterUI();
                this.saveToHistory('filter-toggle');
                if (this.uploadedAudio) this.processAudio();
            });
        }
        
        // Knob sliders
        panel.querySelectorAll('.knob-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const param = e.target.dataset.param;
                const value = parseFloat(e.target.value);
                
                // Update filter value
                if (param === 'freq1' || param === 'freq2') {
                    this.filters[filterType][param] = value;
                } else {
                    this.filters[filterType][param] = value;
                }
                
                // Update knob indicator
                const knob = e.target.closest('.knob');
                const indicator = knob.querySelector('.knob-indicator');
                const min = parseFloat(e.target.min);
                const max = parseFloat(e.target.max);
                indicator.style.transform = `rotate(${this.valueToAngle(value, min, max)}deg)`;
                
                // Update value display
                const valueDisplay = panel.querySelector(`.knob-value[data-param="${param}"]`);
                if (valueDisplay) {
                    valueDisplay.textContent = this.formatValue(value, param);
                }
                
                // Update filter response visualization
                this.updateFilterResponse();
                
                // Debounce processing
                if (this.processTimeout) clearTimeout(this.processTimeout);
                this.processTimeout = setTimeout(() => {
                    if (this.uploadedAudio) this.processAudio();
                }, 300);
            });
        });
    }
    
    valueToAngle(value, min, max) {
        const percentage = (value - min) / (max - min);
        return -135 + (percentage * 270); // -135° to 135° range
    }
    
    formatValue(value, param) {
        if (param === 'freq' || param === 'freq1' || param === 'freq2') {
            if (value >= 1000) return (value/1000).toFixed(1) + 'k';
            return Math.round(value) + 'Hz';
        }
        if (param === 'gain') {
            return (value > 0 ? '+' : '') + value.toFixed(1) + 'dB';
        }
        if (param === 'q') {
            return 'Q=' + value.toFixed(1);
        }
        return value.toString();
    }
    
    activateFilterTab(filterId) {
        // Update tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.filter === filterId) {
                tab.classList.add('active');
            }
        });
        
        // Show corresponding panel
        document.querySelectorAll('.filter-panel').forEach(panel => {
            panel.style.display = panel.dataset.filter === filterId ? 'block' : 'none';
        });
    }
    
    updateFilterUI() {
        // Update which panels are visible based on active tab
        const activeTab = document.querySelector('.filter-tab.active');
        if (activeTab) {
            this.activateFilterTab(activeTab.dataset.filter);
        }
        
        // Update toggle states
        Object.entries(this.filters).forEach(([type, filter]) => {
            const toggle = document.querySelector(`.filter-enabled[data-filter="${type}"]`);
            if (toggle) toggle.checked = filter.enabled;
        });
    }
    
    setupCanvas() {
        this.canvas = document.getElementById('waveVisualizer');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvasEvents();
        this.resizeCanvas();
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    setupCanvasEvents() {
        // Selection handling
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.canvas.width;
            this.selectionStart = x;
            this.selectionEnd = x;
            this.isSelecting = true;
            this.drawWaveform();
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isSelecting) return;
            
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.canvas.width;
            this.selectionEnd = Math.max(0, Math.min(1, x));
            this.drawWaveform();
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.isSelecting = false;
            if (this.selectionStart !== null && this.selectionEnd !== null) {
                const start = Math.min(this.selectionStart, this.selectionEnd);
                const end = Math.max(this.selectionStart, this.selectionEnd);
                
                if (end - start > 0.01) {
                    this.showMessage(`Selected region: ${(start*100).toFixed(0)}% - ${(end*100).toFixed(0)}%`);
                } else {
                    this.selectionStart = null;
                    this.selectionEnd = null;
                }
                this.drawWaveform();
            }
        });
        
        // Zoom with wheel
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        });
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.drawWaveform();
    }
    
    zoomIn() {
        this.zoomLevel = Math.min(5, this.zoomLevel * 1.2);
        this.drawWaveform();
        this.showMessage(`Zoom: ${(this.zoomLevel * 100).toFixed(0)}%`);
    }
    
    zoomOut() {
        this.zoomLevel = Math.max(0.5, this.zoomLevel / 1.2);
        this.drawWaveform();
        this.showMessage(`Zoom: ${(this.zoomLevel * 100).toFixed(0)}%`);
    }
    
    fitView() {
        this.zoomLevel = 1.0;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.drawWaveform();
    }
    
    async uploadAudio() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = (e) => this.handleFileSelect(e);
        input.click();
    }
    
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        this.showMessage('Loading audio...');
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            const fullData = audioBuffer.getChannelData(0);
            
            this.uploadedAudio = {
                buffer: audioBuffer,
                data: fullData,
                sampleRate: audioBuffer.sampleRate,
                duration: fullData.length / audioBuffer.sampleRate,
                fileName: file.name
            };
            
            this.fitView();
            this.drawWaveform();
            this.showMessage(`Loaded: ${this.uploadedAudio.duration.toFixed(2)}s - Processing...`);
            
            // Auto-process after load
            setTimeout(() => this.processAudio(), 100);
            
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
        
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        this.showMessage('Processing audio...');
        
        try {
            const audioData = this.uploadedAudio.data;
            
            // Process in chunks to avoid memory issues
            const chunks = [];
            for (let i = 0; i < audioData.length; i += this.CHUNK_SIZE) {
                const chunk = audioData.slice(i, Math.min(i + this.CHUNK_SIZE, audioData.length));
                chunks.push(chunk);
            }
            
            console.log(`Processing ${chunks.length} chunks...`);
            
            // Get enabled filters
            const activeFilters = Object.values(this.filters).filter(f => f.enabled);
            
            // Process each chunk
            const processedChunks = [];
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const chunkArray = Array.from(chunk);
                
                // Apply filters in sequence
                let processedChunk = chunkArray;
                for (const filter of activeFilters) {
                    processedChunk = await this.applyFilter(processedChunk, filter);
                }
                
                processedChunks.push(processedChunk);
                
                // Update progress
                if (i % 5 === 0) {
                    this.showMessage(`Processing: ${Math.round((i/chunks.length)*100)}%`);
                }
            }
            
            // Combine chunks
            const combined = [].concat(...processedChunks);
            
            this.processedAudio = {
                data: combined,
                sampleRate: this.uploadedAudio.sampleRate,
                duration: combined.length / this.uploadedAudio.sampleRate
            };
            
            this.drawWaveform();
            this.showMessage('Processing complete! Click Play to hear.');
            
        } catch (error) {
            console.error('Process error:', error);
            this.showMessage('Processing failed: ' + error.message, true);
        } finally {
            this.isProcessing = false;
        }
    }
    
    async applyFilter(audioData, filter) {
        // This would call your backend API
        // For now, simulate filter response
        return audioData.map((sample, i) => {
            // Simple filter simulation for testing
            if (filter.type === 'lowpass') {
                const freq = filter.freq / 20000;
                return sample * (1 - Math.min(1, i * freq / 1000));
            }
            return sample;
        });
    }
    
    updateFilterResponse() {
        // Visualize filter frequency response
        const canvas = document.getElementById('filterResponse');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        // Draw frequency axis
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        for (let i = 1; i < 10; i++) {
            const x = (Math.log10(i) / Math.log10(10)) * w;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        ctx.stroke();
        
        // Draw response curves for enabled filters
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const activeFilters = Object.values(this.filters).filter(f => f.enabled);
        
        for (let x = 0; x < w; x++) {
            const freq = 20 * Math.pow(1000, x / w); // 20Hz to 20kHz log scale
            let gain = 0;
            
            activeFilters.forEach(filter => {
                // Simple filter response calculation
                if (filter.type === 'lowpass') {
                    gain += -3 * Math.log10(1 + Math.pow(freq / filter.freq, 2));
                } else if (filter.type === 'highpass') {
                    gain += -3 * Math.log10(1 + Math.pow(filter.freq / freq, 2));
                }
            });
            
            const y = h - ((gain + 12) / 24) * h;
            
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        
        ctx.stroke();
    }
    
    drawWaveform() {
        if (!this.ctx || !this.canvas) return;
        
        const audioToShow = this.processedAudio || this.uploadedAudio;
        if (!audioToShow) {
            this.drawEmpty();
            return;
        }
        
        const w = this.canvas.width;
        const h = this.canvas.height;
        const data = audioToShow.data;
        
        // Clear
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, w, h);
        
        // Draw hairline grid
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 0.5;
        
        // Vertical grid (time)
        for (let i = 1; i < 10; i++) {
            const x = (i / 10) * w;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
            this.ctx.stroke();
        }
        
        // Horizontal grid (amplitude)
        for (let i = 1; i < 5; i++) {
            const y = (i / 5) * h;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, h - y);
            this.ctx.lineTo(w, h - y);
            this.ctx.stroke();
        }
        
        // Center line
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(0, h/2);
        this.ctx.lineTo(w, h/2);
        this.ctx.stroke();
        
        // Calculate visible range based on zoom and selection
        let startIndex = 0;
        let endIndex = data.length;
        
        if (this.selectionStart !== null && this.selectionEnd !== null) {
            startIndex = Math.floor(Math.min(this.selectionStart, this.selectionEnd) * data.length);
            endIndex = Math.floor(Math.max(this.selectionStart, this.selectionEnd) * data.length);
        }
        
        const visibleLength = (endIndex - startIndex) / this.zoomLevel;
        const viewStart = startIndex + (visibleLength * (1 - 1/this.zoomLevel) / 2);
        const viewEnd = viewStart + visibleLength;
        
        const start = Math.max(0, Math.floor(viewStart));
        const end = Math.min(data.length, Math.ceil(viewEnd));
        const step = Math.max(1, Math.floor((end - start) / w));
        
        // Draw waveform
        this.ctx.strokeStyle = this.processedAudio ? '#667eea' : '#48bb78';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        for (let i = start; i < end; i += step) {
            const t = (i - start) / (end - start);
            const x = t * w;
            const y = (1 - (data[i] + 1) / 2) * h;
            
            if (i === start) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        
        this.ctx.stroke();
        
        // Draw selection overlay
        if (this.selectionStart !== null && this.selectionEnd !== null) {
            const x1 = Math.min(this.selectionStart, this.selectionEnd) * w;
            const x2 = Math.max(this.selectionStart, this.selectionEnd) * w;
            
            this.ctx.fillStyle = 'rgba(102, 126, 234, 0.2)';
            this.ctx.fillRect(x1, 0, x2 - x1, h);
            
            this.ctx.strokeStyle = '#667eea';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x1, 0, x2 - x1, h);
        }
        
        // Draw time ruler
        this.drawRuler();
    }
    
    drawRuler() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        if (!this.uploadedAudio) return;
        
        const duration = this.uploadedAudio.duration;
        
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.font = '9px monospace';
        this.ctx.textAlign = 'center';
        
        // Time markers
        for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const x = t * w;
            const time = (t * duration).toFixed(1);
            
            this.ctx.fillText(time + 's', x, h - 5);
        }
        
        // Sample rate info
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`${this.uploadedAudio.sampleRate}Hz`, w - 10, 20);
    }
    
    drawEmpty() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, w, h);
        
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Click Upload to begin', w/2, h/2);
    }
    
    async togglePlay() {
        if (this.isPlaying) {
            this.stopAudio();
        } else {
            await this.playAudio();
        }
    }
    
    async playAudio() {
        const audioToPlay = this.processedAudio || this.uploadedAudio;
        
        if (!audioToPlay) {
            this.showMessage('Please upload audio first', true);
            return;
        }
        
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.stopAudio();
            
            const audioBuffer = this.audioContext.createBuffer(
                1,
                audioToPlay.data.length,
                audioToPlay.sampleRate
            );
            
            const channelData = audioBuffer.getChannelData(0);
            
            // Copy with normalization
            let maxAmp = 0.001;
            for (const sample of audioToPlay.data) {
                const abs = Math.abs(sample);
                if (abs > maxAmp) maxAmp = abs;
            }
            
            const scale = 0.8 / maxAmp;
            for (let i = 0; i < audioToPlay.data.length; i++) {
                channelData[i] = audioToPlay.data[i] * scale;
            }
            
            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = audioBuffer;
            this.sourceNode.connect(this.audioContext.destination);
            
            this.sourceNode.onended = () => {
                this.isPlaying = false;
                this.showMessage('Playback finished');
            };
            
            this.sourceNode.start();
            this.isPlaying = true;
            this.showMessage('Playing...');
            
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
            } catch (e) {}
            this.sourceNode = null;
        }
        this.isPlaying = false;
    }
    
    saveToHistory(action) {
        // Save current state
        const state = {
            filters: JSON.parse(JSON.stringify(this.filters)),
            processedAudio: this.processedAudio ? {
                data: this.processedAudio.data.slice(),
                sampleRate: this.processedAudio.sampleRate
            } : null,
            action: action,
            timestamp: Date.now()
        };
        
        // Remove future states if we're not at the end
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        this.history.push(state);
        this.historyIndex++;
        
        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
            this.historyIndex--;
        }
        
        this.updateUndoRedoUI();
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
            this.showMessage('Undo: ' + this.history[this.historyIndex].action);
        }
    }
    
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
            this.showMessage('Redo: ' + this.history[this.historyIndex].action);
        }
    }
    
    restoreState(state) {
        this.filters = JSON.parse(JSON.stringify(state.filters));
        this.processedAudio = state.processedAudio ? {
            data: state.processedAudio.data.slice(),
            sampleRate: state.processedAudio.sampleRate
        } : null;
        
        this.updateFilterUI();
        this.drawWaveform();
    }
    
    updateUndoRedoUI() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Z for undo
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            
            // Ctrl+Y or Ctrl+Shift+Z for redo
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                this.redo();
            }
            
            // Space for play/pause
            if (e.key === ' ' && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                this.togglePlay();
            }
            
            // +/- for zoom
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                this.zoomIn();
            }
            
            if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                this.zoomOut();
            }
            
            // 0 for fit view
            if (e.key === '0') {
                e.preventDefault();
                this.fitView();
            }
        });
    }
    
    reset() {
        this.stopAudio();
        
        // Reset filters
        Object.keys(this.filters).forEach(key => {
            if (key === 'lowpass') {
                this.filters[key] = { enabled: true, freq: 1000, q: 0.7, type: key };
            } else {
                this.filters[key].enabled = false;
            }
        });
        
        this.uploadedAudio = null;
        this.processedAudio = null;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.zoomLevel = 1.0;
        
        this.updateFilterUI();
        this.drawWaveform();
        this.showMessage('Reset complete');
    }
    
    showMessage(text, isError = false) {
        console.log(isError ? 'ERROR:' : 'INFO:', text);
        
        if (this.statusEl) {
            this.statusEl.textContent = text;
            this.statusEl.style.color = isError ? '#f56565' : '#48bb78';
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.audioApp = new AudioFilterPro();
});
