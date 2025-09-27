// src/utils/angleDetection.js
// Camera angle detection and classification system

/**
 * Camera angle detection engine for multi-angle roulette streams
 */
export class AngleDetectionEngine {
  constructor() {
    this.detectionHistory = [];
    this.angleSignatures = new Map();
    this.currentAngle = null;
    this.confidenceThreshold = 0.75;
    this.historyLength = 10;
    this.detectionCallbacks = [];
  }

  /**
   * Analyze a frame to detect camera angle
   * @param {ImageData} imageData - Current video frame
   * @param {Object} previousFrame - Previous frame data for comparison
   * @returns {Object} Angle detection result
   */
  detectAngle(imageData, previousFrame = null) {
    const { data, width, height } = imageData;
    
    try {
      // 1. Wheel geometry analysis (primary method)
      const wheelGeometry = this.analyzeWheelGeometry(imageData);
      
      // 2. Frame fingerprinting (secondary method)
      const frameFingerprint = this.calculateFrameFingerprint(imageData);
      
      // 3. Perspective distortion analysis
      const perspectiveData = this.analyzePerspectiveDistortion(wheelGeometry);
      
      // 4. Background pattern analysis
      const backgroundSignature = this.analyzeBackgroundPattern(imageData);
      
      // Combine all detection methods
      const angleClassification = this.classifyAngle({
        wheelGeometry,
        frameFingerprint,
        perspectiveData,
        backgroundSignature
      });
      
      // Update detection history
      this.updateDetectionHistory(angleClassification);
      
      // Detect angle changes
      const angleChange = this.detectAngleChange(angleClassification);
      
      console.log('📐 Angle detection result:', {
        detectedAngle: angleClassification.angleId,
        confidence: angleClassification.confidence.toFixed(2),
        quality: angleClassification.qualityScore,
        changed: angleChange.changed
      });
      
      return {
        angleId: angleClassification.angleId,
        angleName: angleClassification.angleName,
        confidence: angleClassification.confidence,
        qualityScore: angleClassification.qualityScore,
        perspectiveData,
        frameFingerprint,
        changed: angleChange.changed,
        previousAngle: angleChange.previousAngle,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error('❌ Angle detection error:', error);
      return {
        angleId: 'unknown',
        angleName: 'Unknown Angle',
        confidence: 0,
        qualityScore: 0,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Analyze wheel geometry to determine viewing angle
   * @param {ImageData} imageData - Video frame
   * @returns {Object} Wheel geometry data
   */
  analyzeWheelGeometry(imageData) {
    const { data, width, height } = imageData;
    
    // Find circular objects (potential wheel)
    const circles = this.detectCircularObjects(imageData);
    
    if (circles.length === 0) {
      return {
        wheelFound: false,
        confidence: 0
      };
    }
    
    // Select most likely wheel (largest, most central)
    const wheel = this.selectBestWheelCandidate(circles, width, height);
    
    // Calculate wheel metrics
    const aspectRatio = wheel.horizontalRadius / wheel.verticalRadius;
    const sizeRatio = (wheel.averageRadius * 2) / Math.min(width, height);
    const centerOffset = Math.sqrt(
      Math.pow(wheel.center.x - width/2, 2) + 
      Math.pow(wheel.center.y - height/2, 2)
    ) / Math.min(width, height);
    
    return {
      wheelFound: true,
      center: wheel.center,
      horizontalRadius: wheel.horizontalRadius,
      verticalRadius: wheel.verticalRadius,
      averageRadius: wheel.averageRadius,
      aspectRatio,
      sizeRatio,
      centerOffset,
      confidence: wheel.confidence
    };
  }

  /**
   * Detect circular objects in the image
   * @param {ImageData} imageData - Video frame
   * @returns {Array} Array of detected circles
   */
  detectCircularObjects(imageData) {
    const { data, width, height } = imageData;
    const circles = [];
    
    // Convert to grayscale for edge detection
    const grayData = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      grayData[i / 4] = gray;
    }
    
    // Simple edge detection
    const edges = this.detectEdges(grayData, width, height);
    
    // Hough circle detection (simplified)
    const detectedCircles = this.houghCircleDetection(edges, width, height);
    
    return detectedCircles;
  }

  /**
   * Simple edge detection using gradient
   * @param {Uint8Array} grayData - Grayscale image data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Uint8Array} Edge map
   */
  detectEdges(grayData, width, height) {
    const edges = new Uint8Array(width * height);
    const threshold = 30;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Sobel operator
        const gx = 
          -grayData[(y-1)*width + (x-1)] + grayData[(y-1)*width + (x+1)] +
          -2*grayData[y*width + (x-1)] + 2*grayData[y*width + (x+1)] +
          -grayData[(y+1)*width + (x-1)] + grayData[(y+1)*width + (x+1)];
          
        const gy = 
          -grayData[(y-1)*width + (x-1)] - 2*grayData[(y-1)*width + x] - grayData[(y-1)*width + (x+1)] +
          grayData[(y+1)*width + (x-1)] + 2*grayData[(y+1)*width + x] + grayData[(y+1)*width + (x+1)];
        
        const magnitude = Math.sqrt(gx*gx + gy*gy);
        edges[idx] = magnitude > threshold ? 255 : 0;
      }
    }
    
    return edges;
  }

  /**
   * Simplified Hough circle detection
   * @param {Uint8Array} edges - Edge map
   * @param {number} width - Image width  
   * @param {number} height - Image height
   * @returns {Array} Detected circles
   */
  houghCircleDetection(edges, width, height) {
    const circles = [];
    const minRadius = Math.min(width, height) * 0.1;
    const maxRadius = Math.min(width, height) * 0.4;
    const radiusStep = 5;
    
    // Accumulator for potential circle centers
    const accumulator = new Map();
    
    for (let r = minRadius; r <= maxRadius; r += radiusStep) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (edges[y * width + x] > 0) {
            // For each edge point, vote for potential circle centers
            for (let angle = 0; angle < 360; angle += 30) {
              const centerX = Math.round(x - r * Math.cos(angle * Math.PI / 180));
              const centerY = Math.round(y - r * Math.sin(angle * Math.PI / 180));
              
              if (centerX >= 0 && centerX < width && centerY >= 0 && centerY < height) {
                const key = `${centerX},${centerY},${r}`;
                accumulator.set(key, (accumulator.get(key) || 0) + 1);
              }
            }
          }
        }
      }
    }
    
    // Extract circles from accumulator
    const threshold = Math.PI * 2; // Minimum votes needed
    for (const [key, votes] of accumulator) {
      if (votes >= threshold) {
        const [x, y, r] = key.split(',').map(Number);
        circles.push({
          center: { x, y },
          radius: r,
          votes,
          confidence: Math.min(1, votes / (Math.PI * r))
        });
      }
    }
    
    // Sort by confidence and remove overlapping circles
    circles.sort((a, b) => b.confidence - a.confidence);
    return this.removeOverlappingCircles(circles);
  }

  /**
   * Remove overlapping circle detections
   * @param {Array} circles - Array of detected circles
   * @returns {Array} Filtered circles
   */
  removeOverlappingCircles(circles) {
    const filtered = [];
    
    for (const circle of circles) {
      let isOverlapping = false;
      
      for (const existing of filtered) {
        const distance = Math.sqrt(
          Math.pow(circle.center.x - existing.center.x, 2) +
          Math.pow(circle.center.y - existing.center.y, 2)
        );
        
        const radiusSum = circle.radius + existing.radius;
        if (distance < radiusSum * 0.5) {
          isOverlapping = true;
          break;
        }
      }
      
      if (!isOverlapping) {
        filtered.push(circle);
      }
    }
    
    return filtered;
  }

  /**
   * Select the best wheel candidate from detected circles
   * @param {Array} circles - Detected circles
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Object} Best wheel candidate
   */
  selectBestWheelCandidate(circles, width, height) {
    if (circles.length === 0) return null;
    
    // Score circles based on size, position, and confidence
    const scoredCircles = circles.map(circle => {
      // Prefer circles near center
      const centerDistance = Math.sqrt(
        Math.pow(circle.center.x - width/2, 2) +
        Math.pow(circle.center.y - height/2, 2)
      ) / Math.min(width, height);
      
      // Prefer reasonable sizes (not too small or too large)
      const sizeScore = circle.radius / Math.min(width, height);
      const idealSize = 0.25; // 25% of image size
      const sizePenalty = Math.abs(sizeScore - idealSize) / idealSize;
      
      const score = circle.confidence * 
                   (1 - centerDistance) * 
                   (1 - sizePenalty);
      
      return {
        ...circle,
        score,
        horizontalRadius: circle.radius,
        verticalRadius: circle.radius,
        averageRadius: circle.radius
      };
    });
    
    // Return highest scoring circle
    scoredCircles.sort((a, b) => b.score - a.score);
    return scoredCircles[0];
  }

  /**
   * Calculate frame fingerprint for angle identification
   * @param {ImageData} imageData - Video frame
   * @returns {Object} Frame fingerprint
   */
  calculateFrameFingerprint(imageData) {
    const { data, width, height } = imageData;
    
    // Divide frame into grid sections and calculate average colors
    const gridSize = 8;
    const sectionWidth = Math.floor(width / gridSize);
    const sectionHeight = Math.floor(height / gridSize);
    const fingerprint = [];
    
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let r = 0, g = 0, b = 0, count = 0;
        
        const startX = gx * sectionWidth;
        const startY = gy * sectionHeight;
        const endX = Math.min(startX + sectionWidth, width);
        const endY = Math.min(startY + sectionHeight, height);
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * width + x) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
        
        fingerprint.push({
          r: Math.round(r / count),
          g: Math.round(g / count),
          b: Math.round(b / count),
          brightness: Math.round((r + g + b) / (3 * count))
        });
      }
    }
    
    // Calculate overall statistics
    const avgBrightness = fingerprint.reduce((sum, p) => sum + p.brightness, 0) / fingerprint.length;
    const brightnessVariance = fingerprint.reduce((sum, p) => sum + Math.pow(p.brightness - avgBrightness, 2), 0) / fingerprint.length;
    
    return {
      grid: fingerprint,
      avgBrightness,
      brightnessVariance,
      contrast: Math.sqrt(brightnessVariance)
    };
  }

  /**
   * Analyze perspective distortion to classify angle
   * @param {Object} wheelGeometry - Wheel geometry data
   * @returns {Object} Perspective analysis
   */
  analyzePerspectiveDistortion(wheelGeometry) {
    if (!wheelGeometry.wheelFound) {
      return {
        distortionType: 'unknown',
        severity: 0,
        confidence: 0
      };
    }
    
    const aspectRatio = wheelGeometry.aspectRatio;
    const sizeRatio = wheelGeometry.sizeRatio;
    const centerOffset = wheelGeometry.centerOffset;
    
    // Classify distortion type
    let distortionType;
    let severity;
    
    if (Math.abs(aspectRatio - 1) < 0.1) {
      distortionType = 'minimal'; // Overhead view
      severity = Math.abs(aspectRatio - 1);
    } else if (aspectRatio > 1.2) {
      distortionType = 'horizontal'; // Side view, wheel appears wider
      severity = aspectRatio - 1;
    } else if (aspectRatio < 0.8) {
      distortionType = 'vertical'; // Top/bottom view, wheel appears taller
      severity = 1 - aspectRatio;
    } else {
      distortionType = 'moderate';
      severity = Math.abs(aspectRatio - 1);
    }
    
    return {
      distortionType,
      severity,
      aspectRatio,
      sizeRatio,
      centerOffset,
      confidence: wheelGeometry.confidence
    };
  }

  /**
   * Analyze background patterns for angle identification
   * @param {ImageData} imageData - Video frame
   * @returns {Object} Background signature
   */
  analyzeBackgroundPattern(imageData) {
    const { data, width, height } = imageData;
    
    // Analyze corner regions (less likely to have wheel)
    const corners = this.analyzeCornerRegions(imageData);
    
    // Look for UI elements (betting layout, text)
    const uiElements = this.detectUIElements(imageData);
    
    // Calculate color distribution
    const colorHistogram = this.calculateColorHistogram(data);
    
    return {
      corners,
      uiElements,
      colorHistogram,
      dominantColors: this.getDominantColors(colorHistogram)
    };
  }

  /**
   * Analyze corner regions of the frame
   * @param {ImageData} imageData - Video frame
   * @returns {Object} Corner analysis
   */
  analyzeCornerRegions(imageData) {
    const { data, width, height } = imageData;
    const cornerSize = Math.min(width, height) * 0.15;
    
    const regions = {
      topLeft: this.analyzeRegion(data, width, 0, 0, cornerSize, cornerSize),
      topRight: this.analyzeRegion(data, width, width - cornerSize, 0, cornerSize, cornerSize),
      bottomLeft: this.analyzeRegion(data, width, 0, height - cornerSize, cornerSize, cornerSize),
      bottomRight: this.analyzeRegion(data, width, width - cornerSize, height - cornerSize, cornerSize, cornerSize)
    };
    
    return regions;
  }

  /**
   * Analyze a specific region of the image
   * @param {Uint8ClampedArray} data - Image data
   * @param {number} width - Image width
   * @param {number} startX - Region start X
   * @param {number} startY - Region start Y
   * @param {number} regionWidth - Region width
   * @param {number} regionHeight - Region height
   * @returns {Object} Region analysis
   */
  analyzeRegion(data, width, startX, startY, regionWidth, regionHeight) {
    let r = 0, g = 0, b = 0, count = 0;
    
    for (let y = startY; y < startY + regionHeight; y++) {
      for (let x = startX; x < startX + regionWidth; x++) {
        if (x >= 0 && x < width && y >= 0) {
          const idx = (y * width + x) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count++;
        }
      }
    }
    
    return {
      avgColor: {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
      },
      brightness: Math.round((r + g + b) / (3 * count))
    };
  }

  /**
   * Detect UI elements in the frame
   * @param {ImageData} imageData - Video frame
   * @returns {Object} UI elements detected
   */
  detectUIElements(imageData) {
    // Simplified UI detection - look for text-like regions and geometric patterns
    const { data, width, height } = imageData;
    
    // Look for high contrast regions (potential text)
    const textRegions = this.findHighContrastRegions(imageData);
    
    // Look for geometric patterns (betting layout)
    const geometricPatterns = this.findGeometricPatterns(imageData);
    
    return {
      textRegions: textRegions.length,
      geometricPatterns: geometricPatterns.length,
      uiDensity: (textRegions.length + geometricPatterns.length) / (width * height) * 10000
    };
  }

  /**
   * Find high contrast regions (potential text)
   * @param {ImageData} imageData - Video frame
   * @returns {Array} High contrast regions
   */
  findHighContrastRegions(imageData) {
    const { data, width, height } = imageData;
    const regions = [];
    const blockSize = 20;
    
    for (let y = 0; y < height - blockSize; y += blockSize) {
      for (let x = 0; x < width - blockSize; x += blockSize) {
        const contrast = this.calculateBlockContrast(data, width, x, y, blockSize);
        if (contrast > 100) { // High contrast threshold
          regions.push({ x, y, contrast });
        }
      }
    }
    
    return regions;
  }

  /**
   * Calculate contrast in a block region
   * @param {Uint8ClampedArray} data - Image data
   * @param {number} width - Image width
   * @param {number} startX - Block start X
   * @param {number} startY - Block start Y
   * @param {number} blockSize - Block size
   * @returns {number} Contrast value
   */
  calculateBlockContrast(data, width, startX, startY, blockSize) {
    let min = 255, max = 0;
    
    for (let y = startY; y < startY + blockSize; y++) {
      for (let x = startX; x < startX + blockSize; x++) {
        const idx = (y * width + x) * 4;
        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        min = Math.min(min, gray);
        max = Math.max(max, gray);
      }
    }
    
    return max - min;
  }

  /**
   * Find geometric patterns in the image
   * @param {ImageData} imageData - Video frame
   * @returns {Array} Geometric patterns
   */
  findGeometricPatterns(imageData) {
    // Simplified - detect rectangular regions and lines
    const patterns = [];
    
    // This would be expanded with actual geometric pattern detection
    // For now, return empty array
    
    return patterns;
  }

  /**
   * Calculate color histogram
   * @param {Uint8ClampedArray} data - Image data
   * @returns {Object} Color histogram
   */
  calculateColorHistogram(data) {
    const histogram = {
      r: new Array(256).fill(0),
      g: new Array(256).fill(0),
      b: new Array(256).fill(0)
    };
    
    for (let i = 0; i < data.length; i += 4) {
      histogram.r[data[i]]++;
      histogram.g[data[i + 1]]++;
      histogram.b[data[i + 2]]++;
    }
    
    return histogram;
  }

  /**
   * Get dominant colors from histogram
   * @param {Object} histogram - Color histogram
   * @returns {Array} Dominant colors
   */
  getDominantColors(histogram) {
    const dominantColors = [];
    
    // Find peaks in each channel
    ['r', 'g', 'b'].forEach(channel => {
      let maxCount = 0;
      let dominantValue = 0;
      
      for (let i = 0; i < 256; i++) {
        if (histogram[channel][i] > maxCount) {
          maxCount = histogram[channel][i];
          dominantValue = i;
        }
      }
      
      dominantColors.push({ channel, value: dominantValue, count: maxCount });
    });
    
    return dominantColors;
  }

  /**
   * Classify the detected angle based on all analysis
   * @param {Object} analysisData - Combined analysis data
   * @returns {Object} Angle classification
   */
  classifyAngle(analysisData) {
    const { wheelGeometry, frameFingerprint, perspectiveData, backgroundSignature } = analysisData;
    
    // Default classification
    let angleId = 'unknown';
    let angleName = 'Unknown Angle';
    let confidence = 0;
    let qualityScore = 0;
    
    if (wheelGeometry.wheelFound) {
      // Classify based on perspective distortion
      if (perspectiveData.distortionType === 'minimal') {
        angleId = 'overhead';
        angleName = 'Overhead View';
        confidence = 0.9;
        qualityScore = 95;
      } else if (perspectiveData.distortionType === 'horizontal' && perspectiveData.severity < 0.5) {
        angleId = 'side45';
        angleName = 'Side View 45°';
        confidence = 0.8;
        qualityScore = 85;
      } else if (perspectiveData.distortionType === 'horizontal' && perspectiveData.severity >= 0.5) {
        angleId = 'extreme_side';
        angleName = 'Extreme Side View';
        confidence = 0.7;
        qualityScore = 40;
      } else if (wheelGeometry.sizeRatio > 0.4) {
        angleId = 'closeup';
        angleName = 'Close-up View';
        confidence = 0.75;
        qualityScore = 70;
      } else if (wheelGeometry.sizeRatio < 0.15) {
        angleId = 'wideshot';
        angleName = 'Wide Shot';
        confidence = 0.6;
        qualityScore = 60;
      } else {
        angleId = 'moderate';
        angleName = 'Moderate Angle';
        confidence = 0.65;
        qualityScore = 65;
      }
      
      // Adjust confidence based on wheel detection quality
      confidence *= wheelGeometry.confidence;
      
      // Adjust quality score based on various factors
      if (wheelGeometry.centerOffset > 0.3) qualityScore -= 15; // Off-center penalty
      if (backgroundSignature.uiDensity > 50) qualityScore -= 10; // UI clutter penalty
      
      qualityScore = Math.max(0, Math.min(100, qualityScore));
    }
    
    return {
      angleId,
      angleName,
      confidence,
      qualityScore,
      wheelGeometry,
      perspectiveData
    };
  }

  /**
   * Update detection history for stability
   * @param {Object} classification - Current angle classification
   */
  updateDetectionHistory(classification) {
    this.detectionHistory.push({
      ...classification,
      timestamp: Date.now()
    });
    
    // Maintain history length
    if (this.detectionHistory.length > this.historyLength) {
      this.detectionHistory.shift();
    }
  }

  /**
   * Detect if camera angle has changed
   * @param {Object} currentClassification - Current angle classification
   * @returns {Object} Change detection result
   */
  detectAngleChange(currentClassification) {
    const previousAngle = this.currentAngle;
    
    // Use majority vote from recent history for stability
    const recentAngles = this.detectionHistory.slice(-3);
    const angleVotes = {};
    
    recentAngles.forEach(detection => {
      angleVotes[detection.angleId] = (angleVotes[detection.angleId] || 0) + 1;
    });
    
    // Find most common angle in recent history
    let mostCommonAngle = currentClassification.angleId;
    let maxVotes = 0;
    
    for (const [angle, votes] of Object.entries(angleVotes)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        mostCommonAngle = angle;
      }
    }
    
    // Update current angle if stable detection
    const angleChanged = this.currentAngle !== mostCommonAngle;
    this.currentAngle = mostCommonAngle;
    
    // Notify callbacks if angle changed
    if (angleChanged && this.detectionCallbacks.length > 0) {
      this.detectionCallbacks.forEach(callback => {
        callback({
          newAngle: mostCommonAngle,
          previousAngle,
          confidence: currentClassification.confidence,
          timestamp: Date.now()
        });
      });
    }
    
    return {
      changed: angleChanged,
      previousAngle,
      currentAngle: mostCommonAngle,
      stabilityScore: maxVotes / recentAngles.length
    };
  }

  /**
   * Add callback for angle change events
   * @param {Function} callback - Callback function
   */
  onAngleChange(callback) {
    this.detectionCallbacks.push(callback);
  }

  /**
   * Remove angle change callback
   * @param {Function} callback - Callback function to remove
   */
  removeAngleChangeCallback(callback) {
    const index = this.detectionCallbacks.indexOf(callback);
    if (index > -1) {
      this.detectionCallbacks.splice(index, 1);
    }
  }

  /**
   * Get current angle information
   * @returns {Object} Current angle data
   */
  getCurrentAngle() {
    if (this.detectionHistory.length === 0) {
      return null;
    }
    
    const latest = this.detectionHistory[this.detectionHistory.length - 1];
    return {
      angleId: this.currentAngle,
      angleName: latest.angleName,
      confidence: latest.confidence,
      qualityScore: latest.qualityScore,
      timestamp: latest.timestamp
    };
  }

  /**
   * Reset detection engine state
   */
  reset() {
    this.detectionHistory = [];
    this.angleSignatures.clear();
    this.currentAngle = null;
  }
}

export default AngleDetectionEngine;