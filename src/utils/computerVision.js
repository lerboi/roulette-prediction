// src/utils/computerVision.js
// Computer vision utilities for ball tracking and image processing

/**
 * Initialize ball tracking worker
 * @returns {Worker} Configured ball tracking worker
 */
export function createBallTrackingWorker() {
  // Create worker from the worker file
  const worker = new Worker(new URL('./ballTracking.worker.js', import.meta.url));
  
  console.log('🧠 Ball tracking worker created');
  return worker;
}

/**
 * Frame processor for real-time video analysis
 */
export class FrameProcessor {
  constructor(video, canvas, worker) {
    this.video = video;
    this.canvas = canvas;
    this.worker = worker;
    this.ctx = canvas.getContext('2d');
    this.isProcessing = false;
    this.frameCount = 0;
    this.targetFPS = 20;
    this.frameInterval = 1000 / this.targetFPS;
    this.lastFrameTime = 0;
    this.processingStats = {
      framesProcessed: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0
    };
  }

  /**
   * Start processing video frames
   */
  start(calibrationData = null) {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.frameCount = 0;
    this.lastFrameTime = performance.now();
    
    console.log(`🎬 Starting frame processing at ${this.targetFPS} FPS`);
    
    // Initialize worker
    this.worker.postMessage({
      type: 'START_TRACKING',
      data: { calibration: calibrationData }
    });
    
    this.processNextFrame();
  }

  /**
   * Stop processing frames
   */
  stop() {
    this.isProcessing = false;
    this.worker.postMessage({ type: 'STOP_TRACKING' });
    console.log('🛑 Frame processing stopped');
  }

  /**
   * Update calibration data
   */
  updateCalibration(calibrationData) {
    this.worker.postMessage({
      type: 'UPDATE_CALIBRATION',
      data: calibrationData
    });
  }

  /**
   * Reset revolution counter
   */
  resetRevolutions() {
    this.worker.postMessage({ type: 'RESET_REVOLUTIONS' });
  }

  /**
   * Process the next video frame
   */
  processNextFrame() {
    if (!this.isProcessing || !this.video || this.video.readyState < 2) {
      if (this.isProcessing) {
        requestAnimationFrame(() => this.processNextFrame());
      }
      return;
    }

    const currentTime = performance.now();
    const timeSinceLastFrame = currentTime - this.lastFrameTime;

    // Maintain target frame rate
    if (timeSinceLastFrame >= this.frameInterval) {
      this.captureAndProcessFrame(currentTime);
      this.lastFrameTime = currentTime;
    }

    // Schedule next frame
    requestAnimationFrame(() => this.processNextFrame());
  }

  /**
   * Capture current video frame and send to worker
   */
  captureAndProcessFrame(timestamp) {
    const startTime = performance.now();
    
    try {
      // Set canvas size to match video
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      
      // Draw current video frame
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      
      // Get image data
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      // Send to worker for processing
      this.worker.postMessage({
        type: 'PROCESS_FRAME',
        data: { imageData, timestamp }
      });
      
      this.frameCount++;
      
      // Update processing stats
      const processingTime = performance.now() - startTime;
      this.processingStats.framesProcessed++;
      this.processingStats.totalProcessingTime += processingTime;
      this.processingStats.averageProcessingTime = 
        this.processingStats.totalProcessingTime / this.processingStats.framesProcessed;
      
      // Log stats periodically
      if (this.frameCount % 100 === 0) {
        console.log(`📊 Frame processing stats:`, {
          framesProcessed: this.frameCount,
          avgProcessingTime: this.processingStats.averageProcessingTime.toFixed(2) + 'ms',
          currentFPS: (1000 / (performance.now() - this.lastFrameTime)).toFixed(1)
        });
      }
      
    } catch (error) {
      console.error('Frame capture error:', error);
    }
  }

  /**
   * Get current processing statistics
   */
  getStats() {
    return {
      ...this.processingStats,
      frameCount: this.frameCount,
      isProcessing: this.isProcessing,
      targetFPS: this.targetFPS
    };
  }
}

/**
 * Ball tracking manager for coordinating detection and tracking
 */
export class BallTrackingManager {
  constructor() {
    this.worker = null;
    this.frameProcessor = null;
    this.callbacks = {
      onBallDetected: null,
      onBallLost: null,
      onRevolutionDetected: null,
      onTrackingStarted: null,
      onTrackingStopped: null,
      onError: null
    };
    this.trackingState = {
      isActive: false,
      ballDetected: false,
      confidence: 0,
      revolutionCount: 0,
      lastPosition: null
    };
  }

  /**
   * Initialize the tracking system
   */
  async initialize(video, canvas) {
    try {
      this.worker = createBallTrackingWorker();
      this.frameProcessor = new FrameProcessor(video, canvas, this.worker);
      
      // Set up worker message handling
      this.worker.onmessage = (e) => this.handleWorkerMessage(e);
      this.worker.onerror = (error) => this.handleWorkerError(error);
      
      console.log('✅ Ball tracking system initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize ball tracking:', error);
      return false;
    }
  }

  /**
   * Start ball tracking
   */
  startTracking(calibrationData = null) {
    if (!this.frameProcessor) {
      throw new Error('Tracking system not initialized');
    }
    
    this.trackingState.isActive = true;
    this.frameProcessor.start(calibrationData);
    
    console.log('🎾 Ball tracking started');
  }

  /**
   * Stop ball tracking
   */
  stopTracking() {
    if (this.frameProcessor) {
      this.frameProcessor.stop();
    }
    
    this.trackingState.isActive = false;
    this.trackingState.ballDetected = false;
    this.trackingState.confidence = 0;
    
    console.log('🛑 Ball tracking stopped');
  }

  /**
   * Update calibration data
   */
  updateCalibration(calibrationData) {
    if (this.frameProcessor) {
      this.frameProcessor.updateCalibration(calibrationData);
    }
  }

  /**
   * Reset revolution counter
   */
  resetRevolutions() {
    if (this.frameProcessor) {
      this.frameProcessor.resetRevolutions();
    }
    this.trackingState.revolutionCount = 0;
  }

  /**
   * Set callback functions for tracking events
   */
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Handle messages from the worker
   */
  handleWorkerMessage(e) {
    const { type, data } = e.data;
    
    switch (type) {
      case 'TRACKING_STARTED':
        this.trackingState.isActive = true;
        if (this.callbacks.onTrackingStarted) {
          this.callbacks.onTrackingStarted(data);
        }
        break;
        
      case 'TRACKING_STOPPED':
        this.trackingState.isActive = false;
        this.trackingState.ballDetected = false;
        if (this.callbacks.onTrackingStopped) {
          this.callbacks.onTrackingStopped(data);
        }
        break;
        
      case 'BALL_DETECTED':
        this.trackingState.ballDetected = true;
        this.trackingState.confidence = data.confidence;
        this.trackingState.lastPosition = data.position;
        this.trackingState.revolutionCount = data.revolutionCount;
        
        if (this.callbacks.onBallDetected) {
          this.callbacks.onBallDetected(data);
        }
        break;
        
      case 'BALL_LOST':
        this.trackingState.ballDetected = false;
        this.trackingState.confidence = 0;
        
        if (this.callbacks.onBallLost) {
          this.callbacks.onBallLost(data);
        }
        break;
        
      case 'REVOLUTION_DETECTED':
        this.trackingState.revolutionCount = data.revolutionNumber;
        
        if (this.callbacks.onRevolutionDetected) {
          this.callbacks.onRevolutionDetected(data);
        }
        break;
        
      case 'PROCESSING_ERROR':
        console.error('Worker processing error:', data.error);
        if (this.callbacks.onError) {
          this.callbacks.onError(data);
        }
        break;
        
      default:
        console.warn('Unknown worker message type:', type);
    }
  }

  /**
   * Handle worker errors
   */
  handleWorkerError(error) {
    console.error('Ball tracking worker error:', error);
    if (this.callbacks.onError) {
      this.callbacks.onError({ error: error.message });
    }
  }

  /**
   * Get current tracking state
   */
  getTrackingState() {
    return { ...this.trackingState };
  }

  /**
   * Get processing statistics
   */
  getProcessingStats() {
    return this.frameProcessor ? this.frameProcessor.getStats() : null;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.frameProcessor) {
      this.frameProcessor.stop();
    }
    
    if (this.worker) {
      this.worker.terminate();
    }
    
    this.worker = null;
    this.frameProcessor = null;
    
    console.log('🧹 Ball tracking system destroyed');
  }
}

/**
 * Utility functions for image processing
 */

/**
 * Convert RGB to grayscale
 */
export function rgbToGrayscale(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Apply Gaussian blur to reduce noise
 */
export function gaussianBlur(imageData, radius = 1) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data);
  
  // Simple box blur approximation of Gaussian blur
  const kernelSize = radius * 2 + 1;
  const kernelWeight = 1 / (kernelSize * kernelSize);
  
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      // Apply kernel
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
          r += data[pixelIndex];
          g += data[pixelIndex + 1];
          b += data[pixelIndex + 2];
          a += data[pixelIndex + 3];
        }
      }
      
      const outputIndex = (y * width + x) * 4;
      output[outputIndex] = r * kernelWeight;
      output[outputIndex + 1] = g * kernelWeight;
      output[outputIndex + 2] = b * kernelWeight;
      output[outputIndex + 3] = a * kernelWeight;
    }
  }
  
  return new ImageData(output, width, height);
}

/**
 * Edge detection using Sobel operator
 */
export function sobelEdgeDetection(imageData) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);
  
  // Sobel kernels
  const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      
      // Apply Sobel kernels
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
          const gray = rgbToGrayscale(data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2]);
          
          gx += gray * sobelX[ky + 1][kx + 1];
          gy += gray * sobelY[ky + 1][kx + 1];
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const outputIndex = (y * width + x) * 4;
      
      output[outputIndex] = magnitude;
      output[outputIndex + 1] = magnitude;
      output[outputIndex + 2] = magnitude;
      output[outputIndex + 3] = 255;
    }
  }
  
  return new ImageData(output, width, height);
}

/**
 * Threshold an image to create binary image
 */
export function threshold(imageData, thresholdValue = 128) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = rgbToGrayscale(data[i], data[i + 1], data[i + 2]);
    const value = gray > thresholdValue ? 255 : 0;
    
    output[i] = value;
    output[i + 1] = value;
    output[i + 2] = value;
    output[i + 3] = 255;
  }
  
  return new ImageData(output, width, height);
}

/**
 * Morphological operations for noise reduction
 */
export function morphologicalClose(imageData, kernelSize = 3) {
  // Dilation followed by erosion
  const dilated = dilate(imageData, kernelSize);
  return erode(dilated, kernelSize);
}

function dilate(imageData, kernelSize) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const radius = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxValue = 0;
      
      // Check kernel area
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const pixelIndex = (ny * width + nx) * 4;
            maxValue = Math.max(maxValue, data[pixelIndex]);
          }
        }
      }
      
      const outputIndex = (y * width + x) * 4;
      output[outputIndex] = maxValue;
      output[outputIndex + 1] = maxValue;
      output[outputIndex + 2] = maxValue;
      output[outputIndex + 3] = 255;
    }
  }
  
  return new ImageData(output, width, height);
}

function erode(imageData, kernelSize) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const radius = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minValue = 255;
      
      // Check kernel area
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const pixelIndex = (ny * width + nx) * 4;
            minValue = Math.min(minValue, data[pixelIndex]);
          }
        }
      }
      
      const outputIndex = (y * width + x) * 4;
      output[outputIndex] = minValue;
      output[outputIndex + 1] = minValue;
      output[outputIndex + 2] = minValue;
      output[outputIndex + 3] = 255;
    }
  }
  
  return new ImageData(output, width, height);
}

/**
 * Calculate image statistics for adaptive processing
 */
export function calculateImageStats(imageData) {
  const { data, width, height } = imageData;
  let min = 255, max = 0, sum = 0;
  const histogram = new Array(256).fill(0);
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = rgbToGrayscale(data[i], data[i + 1], data[i + 2]);
    min = Math.min(min, gray);
    max = Math.max(max, gray);
    sum += gray;
    histogram[Math.floor(gray)]++;
  }
  
  const pixelCount = width * height;
  const mean = sum / pixelCount;
  
  // Calculate standard deviation
  let variance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = rgbToGrayscale(data[i], data[i + 1], data[i + 2]);
    variance += Math.pow(gray - mean, 2);
  }
  const stdDev = Math.sqrt(variance / pixelCount);
  
  return {
    min,
    max,
    mean,
    stdDev,
    histogram,
    pixelCount,
    contrast: max - min
  };
}

/**
 * Adaptive threshold based on image statistics
 */
export function adaptiveThreshold(imageData, windowSize = 15) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const radius = Math.floor(windowSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Calculate local mean
      let sum = 0;
      let count = 0;
      
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const pixelIndex = (ny * width + nx) * 4;
            const gray = rgbToGrayscale(data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2]);
            sum += gray;
            count++;
          }
        }
      }
      
      const localMean = sum / count;
      const currentPixelIndex = (y * width + x) * 4;
      const currentGray = rgbToGrayscale(data[currentPixelIndex], data[currentPixelIndex + 1], data[currentPixelIndex + 2]);
      
      // Threshold with slight bias toward bright objects (ball)
      const threshold = localMean + 10;
      const value = currentGray > threshold ? 255 : 0;
      
      output[currentPixelIndex] = value;
      output[currentPixelIndex + 1] = value;
      output[currentPixelIndex + 2] = value;
      output[currentPixelIndex + 3] = 255;
    }
  }
  
  return new ImageData(output, width, height);
}

/**
 * Template matching for ball detection (alternative approach)
 */
export function templateMatch(imageData, template, threshold = 0.8) {
  const { data: imgData, width: imgWidth, height: imgHeight } = imageData;
  const { data: tempData, width: tempWidth, height: tempHeight } = template;
  
  const matches = [];
  
  for (let y = 0; y <= imgHeight - tempHeight; y++) {
    for (let x = 0; x <= imgWidth - tempWidth; x++) {
      const correlation = calculateNormalizedCorrelation(
        imgData, imgWidth, imgHeight, x, y,
        tempData, tempWidth, tempHeight
      );
      
      if (correlation > threshold) {
        matches.push({
          x: x + tempWidth / 2,
          y: y + tempHeight / 2,
          correlation,
          confidence: correlation
        });
      }
    }
  }
  
  return matches;
}

function calculateNormalizedCorrelation(imgData, imgWidth, imgHeight, startX, startY, tempData, tempWidth, tempHeight) {
  let imgSum = 0, tempSum = 0, imgSqSum = 0, tempSqSum = 0, crossSum = 0;
  const pixelCount = tempWidth * tempHeight;
  
  // Calculate sums
  for (let y = 0; y < tempHeight; y++) {
    for (let x = 0; x < tempWidth; x++) {
      const imgIndex = ((startY + y) * imgWidth + (startX + x)) * 4;
      const tempIndex = (y * tempWidth + x) * 4;
      
      const imgGray = rgbToGrayscale(imgData[imgIndex], imgData[imgIndex + 1], imgData[imgIndex + 2]);
      const tempGray = rgbToGrayscale(tempData[tempIndex], tempData[tempIndex + 1], tempData[tempIndex + 2]);
      
      imgSum += imgGray;
      tempSum += tempGray;
      imgSqSum += imgGray * imgGray;
      tempSqSum += tempGray * tempGray;
      crossSum += imgGray * tempGray;
    }
  }
  
  // Calculate normalized correlation
  const imgMean = imgSum / pixelCount;
  const tempMean = tempSum / pixelCount;
  
  const numerator = crossSum - pixelCount * imgMean * tempMean;
  const denominator = Math.sqrt(
    (imgSqSum - pixelCount * imgMean * imgMean) *
    (tempSqSum - pixelCount * tempMean * tempMean)
  );
  
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Create a circular template for ball detection
 */
export function createBallTemplate(radius = 8) {
  const size = radius * 2 + 1;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Create white circle on black background
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, size, size);
  
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(radius, radius, radius - 1, 0, 2 * Math.PI);
  ctx.fill();
  
  return ctx.getImageData(0, 0, size, size);
}

export default {
  BallTrackingManager,
  FrameProcessor,
  createBallTrackingWorker,
  rgbToGrayscale,
  gaussianBlur,
  sobelEdgeDetection,
  threshold,
  adaptiveThreshold,
  morphologicalClose,
  calculateImageStats,
  templateMatch,
  createBallTemplate
};