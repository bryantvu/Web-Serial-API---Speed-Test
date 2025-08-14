class MultiChannelSerialTest {
    constructor() {
        // Channel management
        this.channels = new Map(); // Map of channelId -> Channel object
        this.nextChannelId = 1;
        this.maxChannels = 8;
        
        // Global state
        this.isGlobalTestRunning = false;
        this.globalTestTimeout = null;
        
        // Configuration
        this.config = {
            defaultBaudRate: 9600,
            testDuration: 60,
            autoConnect: true
        };
        
        // Performance tracking
        this.globalMetrics = {
            totalReadings: 0,
            avgReadingsPerSecond: 0,
            totalLatency: 0,
            readingsInLastSecond: []
        };
        
        this.initializeUI();
        this.bindEvents();
        this.updateGlobalMetrics();
    }

    initializeUI() {
        // Get DOM elements
        this.elements = {
            // Global controls
            connectAllBtn: document.getElementById('connectAllBtn'),
            disconnectAllBtn: document.getElementById('disconnectAllBtn'),
            startAllReadingBtn: document.getElementById('startAllReadingBtn'),
            stopAllReadingBtn: document.getElementById('stopAllReadingBtn'),
            startGlobalTestBtn: document.getElementById('startGlobalTestBtn'),
            stopGlobalTestBtn: document.getElementById('stopGlobalTestBtn'),
            clearAllDataBtn: document.getElementById('clearAllDataBtn'),
            
            // Channel management
            addChannelBtn: document.getElementById('addChannelBtn'),
            removeAllChannelsBtn: document.getElementById('removeAllChannelsBtn'),
            refreshChannelsBtn: document.getElementById('refreshChannelsBtn'),
            
            // Global status
            globalStatus: document.getElementById('globalStatus'),
            globalReadingStatus: document.getElementById('globalReadingStatus'),
            
            // Global metrics
            totalChannels: document.getElementById('totalChannels'),
            connectedChannels: document.getElementById('connectedChannels'),
            readingChannels: document.getElementById('readingChannels'),
            totalReadings: document.getElementById('totalReadings'),
            avgReadingsPerSecond: document.getElementById('avgReadingsPerSecond'),
            totalLatency: document.getElementById('totalLatency'),
            
            // Settings
            defaultBaudRate: document.getElementById('defaultBaudRate'),
            testDuration: document.getElementById('testDuration'),
            maxChannels: document.getElementById('maxChannels'),
            autoConnect: document.getElementById('autoConnect'),
            
            // Channel list
            channelList: document.getElementById('channelList')
        };
        
        // Set initial values
        this.elements.defaultBaudRate.value = this.config.defaultBaudRate;
        this.elements.testDuration.value = this.config.testDuration;
        this.elements.maxChannels.value = this.maxChannels;
        this.elements.autoConnect.value = this.config.autoConnect;
    }

    bindEvents() {
        // Global control events
        this.elements.connectAllBtn.addEventListener('click', () => this.connectAllChannels());
        this.elements.disconnectAllBtn.addEventListener('click', () => this.disconnectAllChannels());
        this.elements.startAllReadingBtn.addEventListener('click', () => this.startAllReading());
        this.elements.stopAllReadingBtn.addEventListener('click', () => this.stopAllReading());
        this.elements.startGlobalTestBtn.addEventListener('click', () => this.startGlobalTest());
        this.elements.stopGlobalTestBtn.addEventListener('click', () => this.stopGlobalTest());
        this.elements.clearAllDataBtn.addEventListener('click', () => this.clearAllData());
        
        // Channel management events
        this.elements.addChannelBtn.addEventListener('click', () => this.addChannel());
        this.elements.removeAllChannelsBtn.addEventListener('click', () => this.removeAllChannels());
        this.elements.refreshChannelsBtn.addEventListener('click', () => this.refreshChannels());
        
        // Settings change events
        this.elements.defaultBaudRate.addEventListener('change', (e) => {
            this.config.defaultBaudRate = parseInt(e.target.value);
        });
        this.elements.testDuration.addEventListener('change', (e) => {
            this.config.testDuration = parseInt(e.target.value);
        });
        this.elements.maxChannels.addEventListener('change', (e) => {
            this.maxChannels = parseInt(e.target.value);
        });
        this.elements.autoConnect.addEventListener('change', (e) => {
            this.config.autoConnect = e.target.value === 'true';
        });
    }

    addChannel() {
        if (this.channels.size >= this.maxChannels) {
            alert(`Maximum number of channels (${this.maxChannels}) reached.`);
            return;
        }

        const channelId = `channel_${this.nextChannelId++}`;
        const channel = new SerialChannel(channelId, this.config.defaultBaudRate, this);
        
        this.channels.set(channelId, channel);
        this.renderChannel(channel);
        this.updateGlobalMetrics();
        
        if (this.config.autoConnect) {
            channel.connect();
        }
    }

    removeAllChannels() {
        if (confirm('Are you sure you want to remove all channels? This will disconnect all devices.')) {
            this.channels.forEach(channel => channel.disconnect());
            this.channels.clear();
            this.elements.channelList.innerHTML = '';
            this.updateGlobalMetrics();
        }
    }

    refreshChannels() {
        this.channels.forEach(channel => {
            if (channel.isConnected) {
                channel.refreshDeviceInfo();
            }
        });
    }

    async connectAllChannels() {
        const unconnectedChannels = Array.from(this.channels.values()).filter(ch => !ch.isConnected);
        
        if (unconnectedChannels.length === 0) {
            alert('All channels are already connected.');
            return;
        }

        this.elements.connectAllBtn.disabled = true;
        this.elements.connectAllBtn.textContent = 'Connecting...';

        try {
            for (const channel of unconnectedChannels) {
                await channel.connect();
                // Small delay between connections to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.error('Error connecting all channels:', error);
        } finally {
            this.elements.connectAllBtn.disabled = false;
            this.elements.connectAllBtn.textContent = 'Connect All Available';
        }
    }

    async disconnectAllChannels() {
        this.channels.forEach(channel => channel.disconnect());
    }

    async startAllReading() {
        const connectedChannels = Array.from(this.channels.values()).filter(ch => ch.isConnected);
        
        if (connectedChannels.length === 0) {
            alert('No channels are connected.');
            return;
        }

        for (const channel of connectedChannels) {
            if (!channel.isReading) {
                await channel.startReading();
            }
        }
    }

    async stopAllReading() {
        this.channels.forEach(channel => {
            if (channel.isReading) {
                channel.stopReading();
            }
        });
    }

    async startGlobalTest() {
        if (this.isGlobalTestRunning) return;
        
        this.isGlobalTestRunning = true;
        this.elements.startGlobalTestBtn.disabled = true;
        this.elements.stopGlobalTestBtn.disabled = false;
        
        // Clear all data
        this.clearAllData();
        
        // Start reading on all connected channels
        await this.startAllReading();
        
        // Set test duration timeout
        this.globalTestTimeout = setTimeout(() => {
            this.stopGlobalTest();
        }, this.config.testDuration * 1000);
        
        console.log(`Global test started for ${this.config.testDuration} seconds`);
    }

    async stopGlobalTest() {
        if (!this.isGlobalTestRunning) return;
        
        this.isGlobalTestRunning = false;
        this.elements.startGlobalTestBtn.disabled = false;
        this.elements.stopGlobalTestBtn.disabled = true;
        
        if (this.globalTestTimeout) {
            clearTimeout(this.globalTestTimeout);
            this.globalTestTimeout = null;
        }
        
        // Stop reading on all channels
        this.stopAllReading();
        
        console.log('Global test completed');
    }

    clearAllData() {
        this.channels.forEach(channel => channel.clearData());
        this.globalMetrics.totalReadings = 0;
        this.globalMetrics.avgReadingsPerSecond = 0;
        this.globalMetrics.totalLatency = 0;
        this.globalMetrics.readingsInLastSecond = [];
        this.updateGlobalMetrics();
    }

    renderChannel(channel) {
        const channelElement = document.createElement('div');
        channelElement.className = 'channel-card';
        channelElement.id = `channel-${channel.id}`;
        
        channelElement.innerHTML = `
            <div class="channel-header">
                <div class="channel-title">${channel.name}</div>
                <div class="channel-controls">
                    <button class="btn connect-btn" onclick="window.multichannelTest.channels.get('${channel.id}').connect()">Connect</button>
                    <button class="btn disconnect-btn danger" onclick="window.multichannelTest.channels.get('${channel.id}').disconnect()" disabled>Disconnect</button>
                    <button class="btn start-reading-btn success" onclick="window.multichannelTest.channels.get('${channel.id}').startReading()" disabled>Start</button>
                    <button class="btn stop-reading-btn danger" onclick="window.multichannelTest.channels.get('${channel.id}').stopReading()" disabled>Stop</button>
                    <button class="btn remove-btn warning" onclick="window.multichannelTest.removeChannel('${channel.id}')">Remove</button>
                </div>
            </div>
            
            <div class="channel-info">
                <div class="info-item">
                    <div class="info-label">Status</div>
                    <div class="info-value status-value">Disconnected</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Device ID</div>
                    <div class="info-value device-id">-</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Baud Rate</div>
                    <div class="info-value baud-rate">${channel.baudRate}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Current Weight</div>
                    <div class="info-value current-weight">0.000</div>
                </div>
            </div>
            
            <div class="channel-metrics">
                <div class="metric">
                    <div class="metric-value readings-per-second">0</div>
                    <div class="metric-label">RPS</div>
                </div>
                <div class="metric">
                    <div class="metric-value total-readings">0</div>
                    <div class="metric-label">Total</div>
                </div>
                <div class="metric">
                    <div class="metric-value avg-latency">0</div>
                    <div class="metric-label">Latency</div>
                </div>
            </div>
            
            <div class="channel-data" id="data-${channel.id}"></div>
        `;
        
        this.elements.channelList.appendChild(channelElement);
        channel.setUIElements(channelElement);
    }

    removeChannel(channelId) {
        const channel = this.channels.get(channelId);
        if (channel) {
            channel.disconnect();
            this.channels.delete(channelId);
            const element = document.getElementById(`channel-${channelId}`);
            if (element) {
                element.remove();
            }
            this.updateGlobalMetrics();
        }
    }

    updateGlobalMetrics() {
        const totalChannels = this.channels.size;
        const connectedChannels = Array.from(this.channels.values()).filter(ch => ch.isConnected).length;
        const readingChannels = Array.from(this.channels.values()).filter(ch => ch.isReading).length;
        
        // Calculate global metrics
        let totalReadings = 0;
        let totalLatency = 0;
        let readingsInLastSecond = [];
        
        this.channels.forEach(channel => {
            totalReadings += channel.metrics.totalReadings;
            totalLatency += channel.metrics.avgLatency * channel.metrics.totalReadings;
            readingsInLastSecond.push(...channel.metrics.readingsInLastSecond);
        });
        
        const avgLatency = totalReadings > 0 ? totalLatency / totalReadings : 0;
        const avgReadingsPerSecond = readingsInLastSecond.length;
        
        // Update UI
        this.elements.totalChannels.textContent = totalChannels;
        this.elements.connectedChannels.textContent = connectedChannels;
        this.elements.readingChannels.textContent = readingChannels;
        this.elements.totalReadings.textContent = totalReadings;
        this.elements.avgReadingsPerSecond.textContent = avgReadingsPerSecond;
        this.elements.totalLatency.textContent = avgLatency.toFixed(1);
        
        // Update global status
        this.updateGlobalStatus();
    }

    updateGlobalStatus() {
        const connectedChannels = Array.from(this.channels.values()).filter(ch => ch.isConnected).length;
        const readingChannels = Array.from(this.channels.values()).filter(ch => ch.isReading).length;
        
        // Update global status
        if (connectedChannels === 0) {
            this.elements.globalStatus.textContent = 'No Channels Connected';
            this.elements.globalStatus.className = 'status disconnected';
            this.elements.disconnectAllBtn.disabled = true;
            this.elements.startAllReadingBtn.disabled = true;
            this.elements.startGlobalTestBtn.disabled = true;
        } else {
            this.elements.globalStatus.textContent = `${connectedChannels} Channel${connectedChannels > 1 ? 's' : ''} Connected`;
            this.elements.globalStatus.className = 'status connected';
            this.elements.disconnectAllBtn.disabled = false;
            this.elements.startAllReadingBtn.disabled = false;
            this.elements.startGlobalTestBtn.disabled = false;
        }
        
        // Update global reading status
        if (readingChannels === 0) {
            this.elements.globalReadingStatus.textContent = 'Not Reading';
            this.elements.globalReadingStatus.className = 'status disconnected';
            this.elements.stopAllReadingBtn.disabled = true;
        } else {
            this.elements.globalReadingStatus.textContent = `${readingChannels} Channel${readingChannels > 1 ? 's' : ''} Reading`;
            this.elements.globalReadingStatus.className = 'status reading';
            this.elements.stopAllReadingBtn.disabled = false;
        }
    }

    // Called by channels when their state changes
    onChannelStateChange() {
        this.updateGlobalMetrics();
    }
}

class SerialChannel {
    constructor(id, baudRate, parent) {
        this.id = id;
        this.name = `Channel ${id.split('_')[1]}`;
        this.baudRate = baudRate;
        this.parent = parent;
        
        // Connection state
        this.isConnected = false;
        this.isReading = false;
        
        // Serial objects
        this.port = null;
        this.lineReader = null;
        this.writer = null;
        this.textDecoder = new TextDecoderStream();
        this.textEncoder = new TextEncoderStream();
        this.lineStream = null;
        
        // Device info
        this.deviceId = null;
        this.deviceCapacity = null;
        this.deviceUnits = null;
        
        // Performance metrics
        this.metrics = {
            readings: [],
            latencies: [],
            readingsInLastSecond: [],
            readingsPerSecond: 0,
            totalReadings: 0,
            avgLatency: 0,
            minLatency: 0,
            maxLatency: 0
        };
        
        // Weight filtering
        this.windowSize = 5;
        this.weightWindow = [];
        
        // UI elements (set by parent)
        this.uiElements = null;
    }

    setUIElements(element) {
        this.uiElements = {
            card: element,
            connectBtn: element.querySelector('.connect-btn'),
            disconnectBtn: element.querySelector('.disconnect-btn'),
            startReadingBtn: element.querySelector('.start-reading-btn'),
            stopReadingBtn: element.querySelector('.stop-reading-btn'),
            statusValue: element.querySelector('.status-value'),
            deviceId: element.querySelector('.device-id'),
            currentWeight: element.querySelector('.current-weight'),
            readingsPerSecond: element.querySelector('.readings-per-second'),
            totalReadings: element.querySelector('.total-readings'),
            avgLatency: element.querySelector('.avg-latency'),
            dataDisplay: element.querySelector(`#data-${this.id}`)
        };
    }

    createLineTransformStream() {
        let buffer = '';
        
        return new TransformStream({
            transform(chunk, controller) {
                buffer += chunk;
                const lines = buffer.split(/\r?\n/);
                
                // Keep the last line in buffer (it might be incomplete)
                buffer = lines.pop() || '';
                
                // Enqueue complete lines
                for (const line of lines) {
                    if (line.trim()) {
                        controller.enqueue(line);
                    }
                }
            },
            
            flush(controller) {
                // Enqueue any remaining data in buffer
                if (buffer.trim()) {
                    controller.enqueue(buffer);
                }
            }
        });
    }

    async connect() {
        try {
            console.log(`Attempting to connect ${this.name}...`);
            
            // Request port selection
            this.port = await navigator.serial.requestPort();
            
            // Open port with configured baud rate
            await this.port.open({ baudRate: this.baudRate });
            
            // Set up streams
            const inputDone = this.port.readable.pipeTo(this.textDecoder.writable);
            const outputDone = this.textEncoder.readable.pipeTo(this.port.writable);
            
            // Create line processing stream
            this.lineStream = this.createLineTransformStream();
            this.textDecoder.readable.pipeTo(this.lineStream.writable);
            
            // Get line reader and writer
            this.lineReader = this.lineStream.readable.getReader();
            this.writer = this.textEncoder.writable.getWriter();
            
            this.isConnected = true;
            this.updateUI();
            this.log('Successfully connected to serial device');
            
            // Get device info
            await this.getDeviceInfo();
            
            // Notify parent of state change
            this.parent.onChannelStateChange();
            
        } catch (error) {
            if (error.name === 'NotFoundError') {
                this.log('User cancelled port selection', 'warning');
            } else {
                this.log(`Connection error: ${error.message}`, 'error');
            }
        }
    }

    async disconnect() {
        try {
            if (this.isReading) {
                await this.stopReading();
            }
            
            if (this.lineReader) {
                await this.lineReader.cancel();
                await this.lineReader.releaseLock();
                this.lineReader = null;
            }
            
            if (this.writer) {
                await this.writer.releaseLock();
                this.writer = null;
            }
            
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            this.isConnected = false;
            this.deviceId = null;
            this.deviceCapacity = null;
            this.deviceUnits = null;
            this.updateUI();
            
            this.log('Disconnected from serial device');
            
            // Notify parent of state change
            this.parent.onChannelStateChange();
            
        } catch (error) {
            this.log(`Disconnect error: ${error.message}`, 'error');
        }
    }

    async getDeviceInfo() {
        try {
            // Get device ID
            const deviceId = await this.sendCommand('id');
            this.deviceId = deviceId;
            this.updateUI();
            this.log(`Device ID: ${deviceId}`);
            
            // Get capacity
            const capacity = await this.sendCommand('slc');
            this.deviceCapacity = capacity;
            
            // Get units
            const units = await this.sendCommand('units');
            this.deviceUnits = units;
            
        } catch (error) {
            this.log(`Error getting device info: ${error.message}`, 'error');
            this.deviceId = 'Error';
            this.updateUI();
        }
    }

    async sendCommand(command) {
        if (!this.writer) {
            throw new Error('Writer not available');
        }
        
        try {
            await this.writer.write(command + '\r');
            this.log(`Command sent: ${command}`, 'debug');
            
            // Read response
            const response = await this.readResponse();
            return response;
            
        } catch (error) {
            this.log(`Error sending command ${command}: ${error.message}`, 'error');
            throw error;
        }
    }

    async readResponse() {
        if (!this.lineReader) {
            throw new Error('Line reader not available');
        }
        
        try {
            // Read one complete line for command response
            const { value, done } = await this.lineReader.read();
            if (done) {
                console.warn("Stream closed unexpectedly.");
                return null;
            }
            return value ? value.trim() : '';
        } catch (error) {
            this.log(`Error reading response: ${error.message}`, 'error');
            throw error;
        }
    }

    async startReading() {
        if (!this.isConnected || this.isReading) return;
        
        this.isReading = true;
        this.updateUI();
        this.log('Starting continuous reading...');
        
        // Start continuous reading
        await this.readWeightContinuous();
    }

    async stopReading() {
        this.isReading = false;
        this.updateUI();
        
        // Stop continuous reading by sending a command to stop
        if (this.writer) {
            try {
                await this.sendCommand(''); // Send empty command or specific stop command
                this.log('Stopped continuous weight reading');
            } catch (error) {
                this.log(`Error stopping continuous reading: ${error.message}`, 'error');
            }
        }
        
        this.log('Stopped reading');
        
        // Notify parent of state change
        this.parent.onChannelStateChange();
    }

    async readWeightContinuous() {
        try {
            // Send wc command to start continuous weight reading
            await this.sendCommand('wc');
            this.log('Started continuous weight reading with wc command');
            
            // Read complete lines using the line reader
            while (this.isReading) {
                const { value, done } = await this.lineReader.read();
                
                if (done) {
                    this.log('Serial stream ended', 'warning');
                    break;
                }
                
                // Process complete line
                if (value && value.trim()) {
                    const weight = parseFloat(value.trim());
                    if (!isNaN(weight)) {
                        // Apply median filter to weight
                        const filteredWeight = this.filterWithMedian(weight);
                        
                        // Process reading
                        this.processReading(filteredWeight, 0); // Line processing latency is negligible
                        
                        // Update UI
                        this.updateMetrics();
                    }
                }
            }
            
        } catch (error) {
            this.log(`Error in readWeightContinuous: ${error.message}`, 'error');
            
            if (this.isReading) {
                // Try to restart continuous reading
                setTimeout(() => this.readWeightContinuous(), 100);
            }
        }
    }

    filterWithMedian(newWeight) {
        this.weightWindow.push(newWeight);
        if (this.weightWindow.length > this.windowSize) {
            this.weightWindow.shift();
        }
        const sorted = [...this.weightWindow].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    }

    processReading(weight, latency) {
        const timestamp = Date.now();
        
        // Store reading data
        this.metrics.readings.push({
            weight,
            latency,
            timestamp
        });
        
        // Store latency for statistics
        this.metrics.latencies.push(latency);
        
        // Track readings per second
        this.metrics.readingsInLastSecond.push(timestamp);
        
        // Keep only last 1000 readings for performance
        if (this.metrics.readings.length > 1000) {
            this.metrics.readings.shift();
        }
        if (this.metrics.latencies.length > 1000) {
            this.metrics.latencies.shift();
        }
        
        // Update readings per second
        this.updateReadingsPerSecond();
        
        // Update current weight display
        if (this.uiElements) {
            this.uiElements.currentWeight.textContent = weight.toFixed(3);
        }
        
        // Log to data display
        this.logData(`[${new Date(timestamp).toLocaleTimeString()}] Weight: ${weight.toFixed(3)}, RPS: ${this.metrics.readingsPerSecond}`);
    }

    updateReadingsPerSecond() {
        const now = Date.now();
        
        // Remove readings older than 1 second
        this.metrics.readingsInLastSecond = this.metrics.readingsInLastSecond.filter(
            timestamp => now - timestamp < 1000
        );
        
        // Update readings per second
        this.metrics.readingsPerSecond = this.metrics.readingsInLastSecond.length;
    }

    updateMetrics() {
        if (this.metrics.readings.length === 0) return;
        
        // Calculate latency statistics
        const avgLatency = this.metrics.latencies.reduce((a, b) => a + b, 0) / this.metrics.latencies.length;
        const minLatency = Math.min(...this.metrics.latencies);
        const maxLatency = Math.max(...this.metrics.latencies);
        
        this.metrics.avgLatency = avgLatency;
        this.metrics.minLatency = minLatency;
        this.metrics.maxLatency = maxLatency;
        this.metrics.totalReadings = this.metrics.readings.length;
        
        // Update UI
        if (this.uiElements) {
            this.uiElements.readingsPerSecond.textContent = this.metrics.readingsPerSecond;
            this.uiElements.totalReadings.textContent = this.metrics.totalReadings;
            this.uiElements.avgLatency.textContent = avgLatency.toFixed(1);
        }
    }

    updateUI() {
        if (!this.uiElements) return;
        
        // Update button states
        this.uiElements.connectBtn.disabled = this.isConnected;
        this.uiElements.disconnectBtn.disabled = !this.isConnected;
        this.uiElements.startReadingBtn.disabled = !this.isConnected || this.isReading;
        this.uiElements.stopReadingBtn.disabled = !this.isReading;
        
        // Update status
        if (this.isReading) {
            this.uiElements.statusValue.textContent = 'Reading';
            this.uiElements.statusValue.className = 'info-value status-value reading';
            this.uiElements.card.className = 'channel-card reading';
        } else if (this.isConnected) {
            this.uiElements.statusValue.textContent = 'Connected';
            this.uiElements.statusValue.className = 'info-value status-value connected';
            this.uiElements.card.className = 'channel-card connected';
        } else {
            this.uiElements.statusValue.textContent = 'Disconnected';
            this.uiElements.statusValue.className = 'info-value status-value disconnected';
            this.uiElements.card.className = 'channel-card';
        }
        
        // Update device info
        this.uiElements.deviceId.textContent = this.deviceId || '-';
    }

    logData(message) {
        if (this.uiElements && this.uiElements.dataDisplay) {
            this.uiElements.dataDisplay.textContent += message + '\n';
            
            // Keep only last 50 lines
            const lines = this.uiElements.dataDisplay.textContent.split('\n');
            if (lines.length > 50) {
                this.uiElements.dataDisplay.textContent = lines.slice(-50).join('\n');
            }
            
            // Auto-scroll to bottom
            this.uiElements.dataDisplay.scrollTop = this.uiElements.dataDisplay.scrollHeight;
        }
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        
        switch (type) {
            case 'error':
                console.error(`[${this.name}] ${logMessage}`);
                break;
            case 'warning':
                console.warn(`[${this.name}] ${logMessage}`);
                break;
            case 'debug':
                console.log(`[${this.name}] ${logMessage}`);
                break;
            default:
                console.log(`[${this.name}] ${logMessage}`);
        }
        
        // Also log to data display
        this.logData(logMessage);
    }

    clearData() {
        this.metrics.readings = [];
        this.metrics.latencies = [];
        this.metrics.readingsInLastSecond = [];
        this.metrics.readingsPerSecond = 0;
        this.weightWindow = [];
        
        if (this.uiElements && this.uiElements.dataDisplay) {
            this.uiElements.dataDisplay.textContent = '';
        }
        
        this.updateMetrics();
    }

    async refreshDeviceInfo() {
        if (this.isConnected) {
            await this.getDeviceInfo();
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if Web Serial API is supported
    if (!navigator.serial) {
        alert('Web Serial API is not supported in this browser. Please use Chrome or Edge.');
        return;
    }
    
    // Create and initialize the multi-channel test application
    window.multichannelTest = new MultiChannelSerialTest();
    
    console.log('Multi-Channel Web Serial API Test initialized');
}); 