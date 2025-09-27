// src/utils/ballTracking.worker.js
// Web Worker for real-time ball detection and tracking (20 FPS)

// Worker state
let isTracking = false;
let calibrationData = null;
let previousFrame = null;
let ballPosition = null;
let ballHistory = [];
let revolutionCount = 0;
let lastRevolutionTime = 0;
let startTime = 0;

// Ball detection parameters
const BALL_DETECTION_CONFIG = {
  minRadius: 3,
  maxRadius: 25,
  motionThreshold: 20,
  colorThreshold: 100,
  confidenceThreshold: 0.6,
  historyLength: 10,
  revolutionAngleThreshold: 350 // degrees to complete revolution
};

/**
 * Main message handler for the worker
 */
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'START_TRACKING':
      startTracking(data);
      break;
    case 'STOP_TRACKING':
      stopTracking();
      break;
    case 'PROCESS_FRAME':
      processFrame(data);
      break;
    case 'UPDATE_CALIBRATION':
      updateCalibration(data);
      break;
    case 'RESET_REVOLUTIONS':
      resetRevolutions();
      break;
    default:
      console.warn('Unknown message type:', type);
  }
};

/**
 * Start ball tracking
 */
function startTracking(config) {
  console.log('🎾 Ball tracking worker started');
  isTracking = true;
  calibrationData = config.calibration;
  startTime = performance.now();
  ballHistory = [];
  revolutionCount = 0;
  lastRevolutionTime = 0;
  
  postMessage({
    type: 'TRACKING_STARTED',
    data: { timestamp: startTime }
  });
}

/**
 * Stop ball tracking
 */
function stopTracking() {
  console.log('🛑 Ball tracking worker stopped');
  isTracking = false;
  previousFrame = null;
  ballPosition = null;
  ballHistory = [];
  
  postMessage({
    type: 'TRACKING_STOPPED',
    data: { revolutionCount, totalTime: (performance.now() - startTime) / 1000 }
  });
}

/**
 * Update calibration data
 */
function updateCalibration(newCalibration) {
  calibrationData = newCalibration;
  console.log('🎯 Calibration updated in worker');
}

/**
 * Reset revolution counter
 */
function resetRevolutions() {
  revolutionCount = 0;
  lastRevolutionTime = 0;
  ballHistory = [];
  startTime = performance.now();
  
  postMessage({
    type: 'REVOLUTIONS_RESET',
    data: { revolutionCount: 0 }
  });
}

/**
 * Process a single video frame for ball detection
 */
function processFrame(frameData) {
  if (!isTracking || !frameData) return;
  
  const { imageData, timestamp } = frameData;
  const currentTime = (timestamp - startTime) / 1000; // Convert to seconds
  
  try {
    // Detect ball in current frame
    const ballDetection = detectBall(imageData);
    
    if (ballDetection.detected) {
      // Update ball position and history
      updateBallTracking(ballDetection, currentTime);
      
      // Check for revolution completion
      checkForRevolution(ballDetection, currentTime);
      
      // Send tracking update
      postMessage({
        type: 'BALL_DETECTED',
        data: {
          position: ballDetection.position,
          confidence: ballDetection.confidence,
          angle: ballDetection.angle,
          revolutionCount,
          timestamp: currentTime
        }
      });
    } else {
      // Ball not detected
      postMessage({
        type: 'BALL_LOST',
        data: {
          timestamp: currentTime,
          revolutionCount
        }
      });
    }
    
    // Store frame for motion detection
    previousFrame = imageData;
    
  } catch (error) {
    console.error('Frame processing error:', error);
    postMessage({
      type: 'PROCESSING_ERROR',
      data: { error: error.message, timestamp: currentTime }
    });
  }
}

/**
 * Detect ball in the current frame
 */
function detectBall(imageData) {
  const { data, width, height } = imageData;
  
  // Motion detection if we have a previous frame
  let motionMap = null;
  if (previousFrame) {
    motionMap = calculateMotionDifference(data, previousFrame.data, width, height);
  }
  
  // Color-based ball detection (white ball detection)
  const ballCandidates = findBallCandidates(data, width, height, motionMap);
  
  // Select best candidate
  const bestCandidate = selectBestBallCandidate(ballCandidates, width, height);
  
  if (bestCandidate) {
    // Convert to wheel coordinates if calibrated
    let wheelCoordinates = null;
    if (calibrationData && calibrationData.perspectiveData) {
      wheelCoordinates = screenToWheelCoordinates(
        bestCandidate.x, 
        bestCandidate.y, 
        calibrationData.perspectiveData
      );
    }
    
    return {
      detected: true,
      position: { x: bestCandidate.x, y: bestCandidate.y },
      confidence: bestCandidate.confidence,
      radius: bestCandidate.radius,
      angle: wheelCoordinates ? wheelCoordinates.angle : null,
      wheelCoordinates
    };
  }
  
  return { detected: false, confidence: 0 };
}

/**
 * Calculate motion difference between frames
 */
function calculateMotionDifference(currentData, previousData, width, height) {
  const motionMap = new Uint8Array(width * height);
  
  for (let i = 0; i < currentData.length; i += 4) {
    const pixelIndex = i / 4;
    
    // Calculate grayscale values
    const currentGray = (currentData[i] + currentData[i + 1] + currentData[i + 2]) / 3;
    const previousGray = (previousData[i] + previousData[i + 1] + previousData[i + 2]) / 3;
    
    // Motion difference
    const diff = Math.abs(currentGray - previousGray);
    motionMap[pixelIndex] = diff > BALL_DETECTION_CONFIG.motionThreshold ? 255 : 0;
  }
  
  return motionMap;
}

/**
 * Find potential ball candidates using color and motion
 */
function findBallCandidates(data, width, height, motionMap) {
  const candidates = [];
  const visited = new Set();
  
  for (let y = BALL_DETECTION_CONFIG.maxRadius; y < height - BALL_DETECTION_CONFIG.maxRadius; y++) {
    for (let x = BALL_DETECTION_CONFIG.maxRadius; x < width - BALL_DETECTION_CONFIG.maxRadius; x++) {
      const pixelIndex = y * width + x;
      
      if (visited.has(pixelIndex)) continue;
      
      // Check if pixel is bright (potential ball)
      const dataIndex = pixelIndex * 4;
      const r = data[dataIndex];
      const g = data[dataIndex + 1];
      const b = data[dataIndex + 2];
      const brightness = (r + g + b) / 3;
      
      // Ball should be bright white/light colored
      if (brightness > BALL_DETECTION_CONFIG.colorThreshold) {
        // Check for motion if available
        let hasMotion = true;
        if (motionMap) {
          hasMotion = motionMap[pixelIndex] > 0;
        }
        
        if (hasMotion) {
          // Analyze circular blob around this point
          const blobAnalysis = analyzeBallBlob(data, width, height, x, y, visited);
          
          if (blobAnalysis.isValid) {
            candidates.push({
              x: blobAnalysis.centerX,
              y: blobAnalysis.centerY,
              radius: blobAnalysis.radius,
              confidence: blobAnalysis.confidence,
              brightness: brightness,
              motion: hasMotion
            });
          }
        }
      }
    }
  }
  
  return candidates;
}

/**
 * Analyze a potential ball blob for circular characteristics
 */
function analyzeBallBlob(data, width, height, centerX, centerY, visited) {
  const brightPixels = [];
  const searchRadius = BALL_DETECTION_CONFIG.maxRadius;
  
  // Collect bright pixels in the area
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > searchRadius) continue;
      
      const pixelIndex = y * width + x;
      const dataIndex = pixelIndex * 4;
      const brightness = (data[dataIndex] + data[dataIndex + 1] + data[dataIndex + 2]) / 3;
      
      if (brightness > BALL_DETECTION_CONFIG.colorThreshold) {
        brightPixels.push({ x, y, distance, brightness });
        visited.add(pixelIndex);
      }
    }
  }
  
  if (brightPixels.length < 5) {
    return { isValid: false };
  }
  
  // Calculate center of mass
  let sumX = 0, sumY = 0, totalBrightness = 0;
  brightPixels.forEach(pixel => {
    sumX += pixel.x * pixel.brightness;
    sumY += pixel.y * pixel.brightness;
    totalBrightness += pixel.brightness;
  });
  
  const actualCenterX = sumX / totalBrightness;
  const actualCenterY = sumY / totalBrightness;
  
  // Calculate average distance from center (radius estimate)
  const avgRadius = brightPixels.reduce((sum, pixel) => {
    const dx = pixel.x - actualCenterX;
    const dy = pixel.y - actualCenterY;
    return sum + Math.sqrt(dx * dx + dy * dy);
  }, 0) / brightPixels.length;
  
  // Check if size is reasonable for a ball
  const sizeValid = avgRadius >= BALL_DETECTION_CONFIG.minRadius && 
                   avgRadius <= BALL_DETECTION_CONFIG.maxRadius;
  
  // Calculate circularity (how round the blob is)
  const circularity = calculateCircularity(brightPixels, actualCenterX, actualCenterY, avgRadius);
  
  const confidence = (circularity * 0.6) + (Math.min(totalBrightness / 255, 1) * 0.4);
  
  return {
    isValid: sizeValid && confidence > BALL_DETECTION_CONFIG.confidenceThreshold,
    centerX: actualCenterX,
    centerY: actualCenterY,
    radius: avgRadius,
    confidence,
    pixelCount: brightPixels.length
  };
}

/**
 * Calculate how circular a blob is
 */
function calculateCircularity(pixels, centerX, centerY, expectedRadius) {
  if (pixels.length === 0) return 0;
  
  let radiusVariance = 0;
  pixels.forEach(pixel => {
    const dx = pixel.x - centerX;
    const dy = pixel.y - centerY;
    const actualRadius = Math.sqrt(dx * dx + dy * dy);
    const variance = Math.abs(actualRadius - expectedRadius) / expectedRadius;
    radiusVariance += variance;
  });
  
  const avgVariance = radiusVariance / pixels.length;
  return Math.max(0, 1 - avgVariance); // 1 = perfect circle, 0 = not circular
}

/**
 * Select the best ball candidate from multiple detections
 */
function selectBestBallCandidate(candidates, width, height) {
  if (candidates.length === 0) return null;
  
  // Score candidates based on multiple factors
  candidates.forEach(candidate => {
    let score = candidate.confidence;
    
    // Prefer candidates closer to previous ball position
    if (ballPosition) {
      const dx = candidate.x - ballPosition.x;
      const dy = candidate.y - ballPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxExpectedMovement = 50; // pixels per frame
      const movementScore = Math.max(0, 1 - (distance / maxExpectedMovement));
      score += movementScore * 0.3;
    }
    
    // Prefer candidates on the wheel rim if calibrated
    if (calibrationData && calibrationData.perspectiveData) {
      const wheelCoords = screenToWheelCoordinates(
        candidate.x, candidate.y, calibrationData.perspectiveData
      );
      
      // Ball should be on or near the rim
      const idealDistance = 0.85; // Slightly inside the wheel edge
      const distanceFromIdeal = Math.abs(wheelCoords.distance - idealDistance);
      const rimScore = Math.max(0, 1 - (distanceFromIdeal / 0.3));
      score += rimScore * 0.4;
    }
    
    candidate.finalScore = score;
  });
  
  // Return highest scoring candidate
  return candidates.reduce((best, current) => 
    current.finalScore > best.finalScore ? current : best
  );
}

/**
 * Update ball tracking history and position
 */
function updateBallTracking(ballDetection, currentTime) {
  ballPosition = ballDetection.position;
  
  // Add to history
  ballHistory.push({
    position: ballDetection.position,
    angle: ballDetection.angle,
    timestamp: currentTime,
    confidence: ballDetection.confidence
  });
  
  // Maintain history length
  if (ballHistory.length > BALL_DETECTION_CONFIG.historyLength) {
    ballHistory.shift();
  }
}

/**
 * Check if ball completed a revolution
 */
function checkForRevolution(ballDetection, currentTime) {
  if (!ballDetection.angle || ballHistory.length < 5) return;
  
  // Look for angle wrap-around (360° → 0° or 0° → 360°)
  const recentHistory = ballHistory.slice(-5);
  const angleHistory = recentHistory.map(h => h.angle).filter(a => a !== null);
  
  if (angleHistory.length < 3) return;
  
  // Check for revolution completion by looking for large angle jumps
  for (let i = 1; i < angleHistory.length; i++) {
    const prevAngle = angleHistory[i - 1];
    const currAngle = angleHistory[i];
    
    // Revolution detected if we cross the 0°/360° boundary
    const angleDiff = Math.abs(currAngle - prevAngle);
    
    if (angleDiff > BALL_DETECTION_CONFIG.revolutionAngleThreshold) {
      // Verify this is a real revolution by checking direction consistency
      if (isValidRevolution(angleHistory, i)) {
        revolutionCount++;
        lastRevolutionTime = currentTime;
        
        postMessage({
          type: 'REVOLUTION_DETECTED',
          data: {
            revolutionNumber: revolutionCount,
            timestamp: currentTime,
            angle: currAngle,
            position: ballDetection.position
          }
        });
        
        console.log(`🔄 Revolution ${revolutionCount} detected at ${currentTime.toFixed(2)}s`);
      }
    }
  }
}

/**
 * Validate that a revolution is real and not noise
 */
function isValidRevolution(angleHistory, crossingIndex) {
  // Check if ball was moving in consistent direction before crossing
  if (crossingIndex < 2) return false;
  
  const beforeCrossing = angleHistory.slice(0, crossingIndex);
  const directionConsistent = checkDirectionConsistency(beforeCrossing);
  
  // Also check timing - revolutions shouldn't be too fast or slow
  const timeSinceLastRevolution = ballHistory[ballHistory.length - 1].timestamp - lastRevolutionTime;
  const minRevolutionTime = 0.3; // seconds
  const maxRevolutionTime = 5.0; // seconds
  
  const timingValid = lastRevolutionTime === 0 || 
    (timeSinceLastRevolution >= minRevolutionTime && timeSinceLastRevolution <= maxRevolutionTime);
  
  return directionConsistent && timingValid;
}

/**
 * Check if ball movement direction is consistent
 */
function checkDirectionConsistency(angles) {
  if (angles.length < 3) return false;
  
  let clockwiseCount = 0;
  let counterClockwiseCount = 0;
  
  for (let i = 1; i < angles.length; i++) {
    let diff = angles[i] - angles[i - 1];
    
    // Handle angle wrapping
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    if (diff > 0) clockwiseCount++;
    else if (diff < 0) counterClockwiseCount++;
  }
  
  // Direction should be consistent (at least 60% in one direction)
  const total = clockwiseCount + counterClockwiseCount;
  const consistency = Math.max(clockwiseCount, counterClockwiseCount) / total;
  
  return consistency >= 0.6;
}

/**
 * Convert screen coordinates to wheel coordinates using calibration
 */
function screenToWheelCoordinates(screenX, screenY, perspectiveData) {
  if (!perspectiveData || !perspectiveData.center) {
    return { x: screenX, y: screenY, angle: null, distance: null };
  }
  
  const { center, averageRadius } = perspectiveData;
  
  // Translate to wheel center
  const relativeX = screenX - center.x;
  const relativeY = screenY - center.y;
  
  // Calculate distance from center
  const distance = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
  const normalizedDistance = distance / averageRadius;
  
  // Calculate angle (0° = right, increases clockwise)
  let angle = Math.atan2(relativeY, relativeX) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  
  // Convert to wheel angle (0° = top, increases clockwise)
  const wheelAngle = (angle + 90) % 360;
  
  return {
    x: relativeX / averageRadius,
    y: relativeY / averageRadius,
    angle: wheelAngle,
    distance: normalizedDistance
  };
}