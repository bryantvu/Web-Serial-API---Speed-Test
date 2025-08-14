class SerialPerformanceTest {
    constructor() {
        // Serial connection objects
        this.port = null;
        this.reader = null;
        this.lineReader = null; // Reader for line-by-line processing
        this.writer = null;
        this.textDecoder = new TextDecoderStream();
        this.textEncoder = new TextEncoderStream();
        
        // Reading mode management
        this.isInCommandMode = false;
        this.pendingCommands = [];
        
        // Line processing stream
        this.lineStream = null;
        
        // State management
        this.isConnected = false;
        this.isReading = false;
        this.isTestRunning = false;
        this.isRawDataPaused = false;
        
                    // Performance metrics
        this.readings = [];
        this.latencies = [];
        this.startTime = null;
        this.lastReadingTime = null;
        this.readingCount = 0;
        
        // Readings per second tracking
        this.readingsPerSecond = 0;
        this.readingsInLastSecond = [];
        this.lastSecondUpdate = Date.now();
        
        // Device information
        this.deviceId = null;
        this.deviceCapacity = null;
        this.deviceUnits = null;
        
        // Weight filtering
        this.windowSize = 5;
        this.weightWindow = [];
        
        // Test configuration
        this.testConfig = {
            baudRate: 9600,
            readInterval: 100,
            testDuration: 30,
            maxReadings: 1000
        };
        
        // Reading methods
        this.readingMethods = {
            onread: this.readWeightOnce.bind(this),
            interval: this.readWeightInterval.bind(this),
            continuous: this.readWeightContinuous.bind(this)
        };
        
        this.currentMethod = 'onread';
        this.intervalId = null;
        this.testTimeout = null;
        
        this.initializeUI();
        this.bindEvents();
    }

    initializeUI() {
        // Get DOM elements
        this.elements = {
            connectBtn: document.getElementById('connectBtn'),
            disconnectBtn: document.getElementById('disconnectBtn'),
            startReadingBtn: document.getElementById('startReadingBtn'),
            stopReadingBtn: document.getElementById('stopReadingBtn'),
            tareBtn: document.getElementById('tareBtn'),
            startTestBtn: document.getElementById('startTestBtn'),
            stopTestBtn: document.getElementById('stopTestBtn'),
            clearDataBtn: document.getElementById('clearDataBtn'),
            pauseRawDataBtn: document.getElementById('pauseRawDataBtn'),
            clearRawDataBtn: document.getElementById('clearRawDataBtn'),
            connectionStatus: document.getElementById('connectionStatus'),
            readingStatus: document.getElementById('readingStatus'),
            readingsPerSecond: document.getElementById('readingsPerSecond'),
            avgLatency: document.getElementById('avgLatency'),
            minLatency: document.getElementById('minLatency'),
            maxLatency: document.getElementById('maxLatency'),
            totalReadings: document.getElementById('totalReadings'),
            currentWeight: document.getElementById('currentWeight'),
            rawData: document.getElementById('rawData'),
            performanceLog: document.getElementById('performanceLog'),
            latencyChart: document.getElementById('latencyChart'),
            baudRate: document.getElementById('baudRate'),
            readInterval: document.getElementById('readInterval'),
            testDuration: document.getElementById('testDuration'),
            maxReadings: document.getElementById('maxReadings'),
            deviceId: document.getElementById('deviceId'),
            deviceCapacity: document.getElementById('deviceCapacity'),
            deviceUnits: document.getElementById('deviceUnits')
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

    bindEvents() {
        this.elements.connectBtn.addEventListener('click', () => this.connect());
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.elements.startReadingBtn.addEventListener('click', () => this.startReading());
        this.elements.stopReadingBtn.addEventListener('click', () => this.stopReading());
        this.elements.tareBtn.addEventListener('click', () => this.tare());
        this.elements.startTestBtn.addEventListener('click', () => this.startPerformanceTest());
        this.elements.stopTestBtn.addEventListener('click', () => this.stopPerformanceTest());
        this.elements.clearDataBtn.addEventListener('click', () => this.clearData());
        this.elements.pauseRawDataBtn.addEventListener('click', () => this.toggleRawDataPause());
        this.elements.clearRawDataBtn.addEventListener('click', () => this.clearRawData());
        
        // Settings change events
        this.elements.baudRate.addEventListener('change', (e) => {
            this.testConfig.baudRate = parseInt(e.target.value);
        });
        this.elements.readInterval.addEventListener('change', (e) => {
            this.testConfig.readInterval = parseInt(e.target.value);
        });
        this.elements.testDuration.addEventListener('change', (e) => {
            this.testConfig.testDuration = parseInt(e.target.value);
        });
        this.elements.maxReadings.addEventListener('change', (e) => {
            this.testConfig.maxReadings = parseInt(e.target.value);
        });
    }

    async connect() {
        try {
            this.log('Attempting to connect to serial device...', 'info');
            
            // Request port selection
            this.port = await navigator.serial.requestPort();
            
            // Open port with configured baud rate
            await this.port.open({ baudRate: this.testConfig.baudRate });
            
            // Set up streams
            const inputDone = this.port.readable.pipeTo(this.textDecoder.writable);
            const outputDone = this.textEncoder.readable.pipeTo(this.port.writable);
            
            // Create line processing stream
            this.lineStream = this.createLineTransformStream();
            this.textDecoder.readable.pipeTo(this.lineStream.writable);
            
            // Get line reader and writer (use line reader for all operations)
            this.lineReader = this.lineStream.readable.getReader();
            this.writer = this.textEncoder.writable.getWriter();
            
            this.isConnected = true;
            this.updateConnectionStatus();
            this.log('Successfully connected to serial device', 'success');
            
            // Get device info
            await this.getDeviceInfo();
            
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
            this.updateConnectionStatus();
            
            // Clear device information
            this.deviceId = null;
            this.deviceCapacity = null;
            this.deviceUnits = null;
            this.elements.deviceId.textContent = 'Not Connected';
            this.elements.deviceCapacity.textContent = 'Not Connected';
            this.elements.deviceUnits.textContent = 'Not Connected';
            
            this.log('Disconnected from serial device', 'info');
            
        } catch (error) {
            this.log(`Disconnect error: ${error.message}`, 'error');
        }
    }

    updateConnectionStatus() {
        const status = this.elements.connectionStatus;
        if (this.isConnected) {
            status.textContent = 'Connected';
            status.className = 'status connected';
            this.elements.connectBtn.disabled = true;
            this.elements.disconnectBtn.disabled = false;
            this.elements.startReadingBtn.disabled = false;
            this.elements.startTestBtn.disabled = false;
        } else {
            status.textContent = 'Disconnected';
            status.className = 'status disconnected';
            this.elements.connectBtn.disabled = false;
            this.elements.disconnectBtn.disabled = true;
            this.elements.startReadingBtn.disabled = true;
            this.elements.stopReadingBtn.disabled = true;
            this.elements.tareBtn.disabled = true;
            this.elements.startTestBtn.disabled = true;
            this.elements.stopTestBtn.disabled = true;
        }
    }

    updateReadingStatus() {
        const status = this.elements.readingStatus;
        if (this.isReading) {
            status.textContent = 'Reading';
            status.className = 'status reading';
            this.elements.startReadingBtn.disabled = true;
            this.elements.stopReadingBtn.disabled = false;
            this.elements.tareBtn.disabled = false;
        } else {
            status.textContent = 'Not Reading';
            status.className = 'status disconnected';
            this.elements.startReadingBtn.disabled = !this.isConnected;
            this.elements.stopReadingBtn.disabled = true;
            this.elements.tareBtn.disabled = !this.isConnected;
        }
    }

    async getDeviceInfo() {
        try {
            // Get device ID
            const deviceId = await this.sendCommand('id');
            this.deviceId = deviceId;
            this.elements.deviceId.textContent = deviceId;
            this.log(`Device ID: ${deviceId}`, 'info');
            
            // Get capacity
            const capacity = await this.sendCommand('slc');
            this.deviceCapacity = capacity;
            this.elements.deviceCapacity.textContent = capacity;
            this.log(`Device Capacity: ${capacity}`, 'info');
            
            // Get units
            const units = await this.sendCommand('units');
            this.deviceUnits = units;
            this.elements.deviceUnits.textContent = units;
            this.log(`Device Units: ${units}`, 'info');
            
        } catch (error) {
            this.log(`Error getting device info: ${error.message}`, 'error');
            // Set error state in UI
            this.elements.deviceId.textContent = 'Error';
            this.elements.deviceCapacity.textContent = 'Error';
            this.elements.deviceUnits.textContent = 'Error';
        }
    }

    async sendCommand(command) {
        if (!this.writer) {
            throw new Error('Writer not available');
        }
        
        try {
            // If we're in continuous reading mode, we need to handle this differently
            if (this.isReading && this.currentMethod === 'onread') {
                this.log(`Command sent during continuous reading: ${command}`, 'debug');
                await this.writer.write(command + '\r');
                // Don't try to read response during continuous reading
                return 'sent';
            }
            
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
        this.updateReadingStatus();
        this.log('Starting continuous reading...', 'info');
        
        // Start the appropriate reading method
        await this.readingMethods[this.currentMethod]();
    }

    async stopReading() {
        this.isReading = false;
        this.updateReadingStatus();
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        // Stop continuous reading by sending a command to stop
        if (this.writer && this.currentMethod === 'onread') {
            try {
                await this.sendCommand(''); // Send empty command or specific stop command
                this.log('Stopped continuous weight reading', 'info');
            } catch (error) {
                this.log(`Error stopping continuous reading: ${error.message}`, 'error');
            }
        }
        
        this.log('Stopped reading', 'info');
    }

    // Method 1: onread (fastest) - Continuous reading with wc command
    async readWeightOnce() {
        try {
            // Send wc command to start continuous weight reading
            await this.sendCommand('wc');
            this.log('Started continuous weight reading with wc command', 'info');
            
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
                        // Use placeholder latency since we're reading complete lines
                        const latency = 0; // Line processing latency is negligible
                        this.processReading(weight, latency);
                    }
                }
            }
            
        } catch (error) {
            this.log(`Error in readWeightOnce: ${error.message}`, 'error');
            
            if (this.isReading) {
                // Try to restart continuous reading
                setTimeout(() => this.readWeightOnce(), 100);
            }
        }
    }

    // Method 2: Interval-based reading (kept for comparison)
    async readWeightInterval() {
        this.intervalId = setInterval(async () => {
            if (!this.isReading) return;
            
            try {
                const startTime = performance.now();
                await this.sendCommand('w');
                const { value } = await this.reader.read();
                
                const endTime = performance.now();
                const latency = endTime - startTime;
                
                if (value && value.trim()) {
                    const weight = parseFloat(value.trim());
                    if (!isNaN(weight)) {
                        this.processReading(weight, latency);
                    }
                }
                
            } catch (error) {
                this.log(`Error in readWeightInterval: ${error.message}`, 'error');
            }
        }, this.testConfig.readInterval);
    }

    // Method 3: Continuous reading loop (kept for comparison)
    async readWeightContinuous() {
        while (this.isReading) {
            try {
                const startTime = performance.now();
                await this.sendCommand('w');
                const { value } = await this.reader.read();
                
                const endTime = performance.now();
                const latency = endTime - startTime;
                
                if (value && value.trim()) {
                    const weight = parseFloat(value.trim());
                    if (!isNaN(weight)) {
                        this.processReading(weight, latency);
                    }
                }
                
                // Small delay to prevent overwhelming the device
                await new Promise(resolve => setTimeout(resolve, 10));
                
            } catch (error) {
                this.log(`Error in readWeightContinuous: ${error.message}`, 'error');
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    processReading(weight, latency) {
        const timestamp = Date.now();
        
        // Apply median filter to weight
        const filteredWeight = this.filterWithMedian(weight);
        
        // Store reading data with filtered weight
        this.readings.push({
            weight: filteredWeight,
            rawWeight: weight,
            latency,
            timestamp
        });
        
        // Store latency for statistics
        this.latencies.push(latency);
        
        // Track readings per second
        this.readingsInLastSecond.push(timestamp);
        
        // Keep only last 1000 readings for performance
        if (this.readings.length > 1000) {
            this.readings.shift();
        }
        if (this.latencies.length > 1000) {
            this.latencies.shift();
        }
        
        // Update readings per second every second
        this.updateReadingsPerSecond();
        
        // Update metrics
        this.updateMetrics();
        
        // Update displays with filtered weight
        this.updateDisplays(filteredWeight, latency);
        
        // Log to raw data (show both raw and filtered)
        this.logRawData(`[${new Date(timestamp).toLocaleTimeString()}] Raw: ${weight.toFixed(3)}, Filtered: ${filteredWeight.toFixed(3)}, Latency: ${latency.toFixed(2)}ms, RPS: ${this.readingsPerSecond}`);
    }

    filterWithMedian(newWeight) {
        this.weightWindow.push(newWeight);
        if (this.weightWindow.length > this.windowSize) {
            this.weightWindow.shift();
        }
        const sorted = [...this.weightWindow].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    }

    updateReadingsPerSecond() {
        const now = Date.now();
        
        // Remove readings older than 1 second
        this.readingsInLastSecond = this.readingsInLastSecond.filter(
            timestamp => now - timestamp < 1000
        );
        
        // Update readings per second
        this.readingsPerSecond = this.readingsInLastSecond.length;
        
        // Update UI immediately
        this.elements.readingsPerSecond.textContent = this.readingsPerSecond;
    }

    updateMetrics() {
        if (this.readings.length === 0) return;
        
        // Calculate latency statistics
        const avgLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
        const minLatency = Math.min(...this.latencies);
        const maxLatency = Math.max(...this.latencies);
        
        // Update UI
        this.elements.avgLatency.textContent = avgLatency.toFixed(1);
        this.elements.minLatency.textContent = minLatency.toFixed(1);
        this.elements.maxLatency.textContent = maxLatency.toFixed(1);
        this.elements.totalReadings.textContent = this.readings.length;
    }

    updateDisplays(weight, latency) {
        this.elements.currentWeight.textContent = weight.toFixed(3);
        this.updateLatencyChart();
    }

    updateLatencyChart() {
        const chart = this.elements.latencyChart;
        chart.innerHTML = '';
        
        if (this.latencies.length === 0) return;
        
        // Get last 100 readings for chart
        const recentLatencies = this.latencies.slice(-100);
        const maxLatency = Math.max(...recentLatencies);
        const minLatency = Math.min(...recentLatencies);
        const range = maxLatency - minLatency;
        
        // Create histogram
        const buckets = 20;
        const histogram = new Array(buckets).fill(0);
        
        recentLatencies.forEach(latency => {
            const bucket = Math.floor(((latency - minLatency) / range) * (buckets - 1));
            histogram[Math.max(0, Math.min(bucket, buckets - 1))]++;
        });
        
        const maxCount = Math.max(...histogram);
        
        // Create chart bars
        histogram.forEach(count => {
            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            bar.style.height = `${(count / maxCount) * 100}%`;
            chart.appendChild(bar);
        });
    }

    async startPerformanceTest() {
        if (this.isTestRunning) return;
        
        this.isTestRunning = true;
        this.elements.startTestBtn.disabled = true;
        this.elements.stopTestBtn.disabled = false;
        
        // Clear previous data
        this.readings = [];
        this.latencies = [];
        this.readingCount = 0;
        this.readingsInLastSecond = [];
        this.readingsPerSecond = 0;
        this.weightWindow = []; // Clear the weight filter
        this.startTime = performance.now();
        
        this.log('Starting performance test...', 'info');
        this.logPerformance('=== PERFORMANCE TEST STARTED ===');
        
        // Start reading
        await this.startReading();
        
        // Set test duration timeout
        this.testTimeout = setTimeout(() => {
            this.stopPerformanceTest();
        }, this.testConfig.testDuration * 1000);
        
        // Set maximum readings timeout
        setTimeout(() => {
            if (this.readings.length >= this.testConfig.maxReadings) {
                this.stopPerformanceTest();
            }
        }, 100);
    }

    async stopPerformanceTest() {
        if (!this.isTestRunning) return;
        
        this.isTestRunning = false;
        this.elements.startTestBtn.disabled = false;
        this.elements.stopTestBtn.disabled = true;
        
        if (this.testTimeout) {
            clearTimeout(this.testTimeout);
            this.testTimeout = null;
        }
        
        await this.stopReading();
        
        // Calculate final statistics
        this.calculateFinalStats();
        
        this.log('Performance test completed', 'info');
        this.logPerformance('=== PERFORMANCE TEST COMPLETED ===');
    }

    calculateFinalStats() {
        if (this.readings.length === 0) return;
        
        const endTime = performance.now();
        const totalTime = (endTime - this.startTime) / 1000;
        const totalReadings = this.readings.length;
        const avgReadingsPerSecond = totalReadings / totalTime;
        
        const avgLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
        const minLatency = Math.min(...this.latencies);
        const maxLatency = Math.max(...this.latencies);
        
        // Calculate percentiles
        const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
        const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)];
        const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
        const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)];
        
        this.logPerformance(`Test Duration: ${totalTime.toFixed(2)} seconds`);
        this.logPerformance(`Total Readings: ${totalReadings}`);
        this.logPerformance(`Average Readings/sec: ${avgReadingsPerSecond.toFixed(2)}`);
        this.logPerformance(`Average Latency: ${avgLatency.toFixed(2)}ms`);
        this.logPerformance(`Min Latency: ${minLatency.toFixed(2)}ms`);
        this.logPerformance(`Max Latency: ${maxLatency.toFixed(2)}ms`);
        this.logPerformance(`50th Percentile: ${p50.toFixed(2)}ms`);
        this.logPerformance(`95th Percentile: ${p95.toFixed(2)}ms`);
        this.logPerformance(`99th Percentile: ${p99.toFixed(2)}ms`);
    }

    async tare() {
        try {
            await this.sendCommand('ct0');
            this.log('Tare command sent', 'info');
        } catch (error) {
            this.log(`Tare error: ${error.message}`, 'error');
        }
    }

    toggleRawDataPause() {
        this.isRawDataPaused = !this.isRawDataPaused;
        const btn = this.elements.pauseRawDataBtn;
        if (this.isRawDataPaused) {
            btn.textContent = 'Resume Logging';
            btn.className = 'btn success';
            this.log('Raw data logging paused', 'info');
        } else {
            btn.textContent = 'Pause Logging';
            btn.className = 'btn';
            this.log('Raw data logging resumed', 'info');
        }
    }

    clearRawData() {
        this.elements.rawData.textContent = '';
        this.log('Raw data cleared', 'info');
    }

    clearData() {
        this.readings = [];
        this.latencies = [];
        this.readingsInLastSecond = [];
        this.readingsPerSecond = 0;
        this.weightWindow = []; // Clear the weight filter
        this.elements.rawData.textContent = '';
        this.elements.performanceLog.textContent = '';
        this.updateLatencyChart();
        this.updateMetrics();
        this.elements.readingsPerSecond.textContent = '0';
        this.log('Data cleared', 'info');
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        
        switch (type) {
            case 'error':
                console.error(logMessage);
                break;
            case 'warning':
                console.warn(logMessage);
                break;
            case 'success':
                console.log(logMessage);
                break;
            default:
                console.log(logMessage);
        }
    }

    logRawData(message) {
        // Don't log if paused
        if (this.isRawDataPaused) return;
        
        const rawData = this.elements.rawData;
        const wasScrolledToBottom = rawData.scrollTop + rawData.clientHeight >= rawData.scrollHeight - 10;
        
        rawData.textContent += message + '\n';
        
        // Keep only last 50 lines for better performance
        const lines = rawData.textContent.split('\n');
        if (lines.length > 50) {
            rawData.textContent = lines.slice(-50).join('\n');
        }
        
        // Only auto-scroll if user was already at bottom
        if (wasScrolledToBottom) {
            rawData.scrollTop = rawData.scrollHeight;
        }
    }

    logPerformance(message) {
        const performanceLog = this.elements.performanceLog;
        const wasScrolledToBottom = performanceLog.scrollTop + performanceLog.clientHeight >= performanceLog.scrollHeight - 10;
        
        performanceLog.textContent += message + '\n';
        
        // Keep only last 30 lines for better performance
        const lines = performanceLog.textContent.split('\n');
        if (lines.length > 30) {
            performanceLog.textContent = lines.slice(-30).join('\n');
        }
        
        // Only auto-scroll if user was already at bottom
        if (wasScrolledToBottom) {
            performanceLog.scrollTop = performanceLog.scrollHeight;
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
    
    // Create and initialize the performance test application
    window.serialTest = new SerialPerformanceTest();
    
    console.log('Web Serial API Performance Test initialized');
}); 