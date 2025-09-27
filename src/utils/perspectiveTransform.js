// src/utils/perspectiveTransform.js
// Perspective transformation and geometric calculations for wheel calibration

/**
 * Calculate perspective transformation matrix from 4 calibration points
 * @param {Array} calibrationPoints - Array of 4 points: [top, right, bottom, left]
 * @returns {Object} Transformation data
 */
export function calculatePerspectiveTransform(calibrationPoints) {
  if (calibrationPoints.length !== 4) {
    throw new Error('Exactly 4 calibration points required');
  }

  // Find points by ID for consistency
  const top = calibrationPoints.find(p => p.id === 'top');
  const right = calibrationPoints.find(p => p.id === 'right');
  const bottom = calibrationPoints.find(p => p.id === 'bottom');
  const left = calibrationPoints.find(p => p.id === 'left');

  if (!top || !right || !bottom || !left) {
    throw new Error('Missing required calibration points (top, right, bottom, left)');
  }

  console.log('🔧 Calculating perspective transform from points:', {
    top: { x: top.x, y: top.y },
    right: { x: right.x, y: right.y },
    bottom: { x: bottom.x, y: bottom.y },
    left: { x: left.x, y: left.y }
  });

  // Calculate wheel center
  const center = {
    x: (left.x + right.x) / 2,
    y: (top.y + bottom.y) / 2
  };

  // Calculate radii
  const horizontalRadius = Math.abs(right.x - left.x) / 2;
  const verticalRadius = Math.abs(bottom.y - top.y) / 2;
  const averageRadius = (horizontalRadius + verticalRadius) / 2;

  // Calculate distortion metrics
  const aspectRatio = horizontalRadius / verticalRadius;
  const distortionFactor = Math.abs(aspectRatio - 1);
  const isPerspectiveDistorted = distortionFactor > 0.1;

  // Calculate perspective angle estimation
  let perspectiveAngle = 0;
  if (isPerspectiveDistorted) {
    // Estimate viewing angle based on ellipse distortion
    perspectiveAngle = Math.acos(Math.min(horizontalRadius, verticalRadius) / Math.max(horizontalRadius, verticalRadius));
    perspectiveAngle = perspectiveAngle * (180 / Math.PI); // Convert to degrees
  }

  console.log('📐 Wheel geometry calculated:', {
    center,
    horizontalRadius: horizontalRadius.toFixed(1),
    verticalRadius: verticalRadius.toFixed(1),
    averageRadius: averageRadius.toFixed(1),
    aspectRatio: aspectRatio.toFixed(3),
    distortionFactor: distortionFactor.toFixed(3),
    isPerspectiveDistorted,
    estimatedPerspectiveAngle: perspectiveAngle.toFixed(1) + '°'
  });

  // Create transformation matrix for perspective correction
  // This is a simplified approach - for complex perspective correction,
  // we'd need a full homography calculation
  const transformMatrix = createTransformMatrix(
    calibrationPoints,
    center,
    averageRadius
  );

  return {
    center,
    horizontalRadius,
    verticalRadius,
    averageRadius,
    aspectRatio,
    distortionFactor,
    isPerspectiveDistorted,
    perspectiveAngle,
    transformMatrix,
    // Conversion functions
    screenToWheel: (screenX, screenY) => screenToWheelCoordinates(screenX, screenY, center, averageRadius),
    wheelToScreen: (wheelX, wheelY) => wheelToScreenCoordinates(wheelX, wheelY, center, averageRadius),
    // Angle conversion
    screenAngleToWheelAngle: (screenAngle) => correctAngleForPerspective(screenAngle, aspectRatio),
    wheelAngleToScreenAngle: (wheelAngle) => correctAngleForPerspective(wheelAngle, 1/aspectRatio)
  };
}

/**
 * Create a basic transformation matrix
 * @param {Array} calibrationPoints - 4 calibration points
 * @param {Object} center - Wheel center point
 * @param {number} radius - Average wheel radius
 * @returns {Array} 3x3 transformation matrix
 */
function createTransformMatrix(calibrationPoints, center, radius) {
  // For now, create a basic scaling/translation matrix
  // In a full implementation, this would be a proper homography matrix
  
  const scaleX = radius / (Math.abs(calibrationPoints.find(p => p.id === 'right').x - calibrationPoints.find(p => p.id === 'left').x) / 2);
  const scaleY = radius / (Math.abs(calibrationPoints.find(p => p.id === 'bottom').y - calibrationPoints.find(p => p.id === 'top').y) / 2);
  
  // Basic affine transformation matrix
  return [
    [scaleX, 0, -center.x * scaleX],
    [0, scaleY, -center.y * scaleY],
    [0, 0, 1]
  ];
}

/**
 * Convert screen coordinates to wheel coordinates (normalized)
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate  
 * @param {Object} center - Wheel center
 * @param {number} radius - Wheel radius
 * @returns {Object} Wheel coordinates {x, y, angle, distance}
 */
export function screenToWheelCoordinates(screenX, screenY, center, radius) {
  // Translate to wheel center
  const relativeX = screenX - center.x;
  const relativeY = screenY - center.y;
  
  // Calculate distance from center
  const distance = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
  const normalizedDistance = distance / radius;
  
  // Calculate angle (0° = right, increases clockwise)
  let angle = Math.atan2(relativeY, relativeX) * (180 / Math.PI);
  if (angle < 0) angle += 360; // Normalize to 0-360°
  
  // Convert to wheel angle (0° = top, increases clockwise like roulette)
  const wheelAngle = (angle + 90) % 360;
  
  return {
    x: relativeX / radius, // Normalized coordinates (-1 to 1)
    y: relativeY / radius,
    angle: wheelAngle,
    distance: normalizedDistance,
    isInsideWheel: normalizedDistance <= 1
  };
}

/**
 * Convert wheel coordinates back to screen coordinates
 * @param {number} wheelX - Normalized wheel X (-1 to 1)
 * @param {number} wheelY - Normalized wheel Y (-1 to 1)
 * @param {Object} center - Wheel center
 * @param {number} radius - Wheel radius
 * @returns {Object} Screen coordinates {x, y}
 */
export function wheelToScreenCoordinates(wheelX, wheelY, center, radius) {
  return {
    x: center.x + (wheelX * radius),
    y: center.y + (wheelY * radius)
  };
}

/**
 * Correct angle for perspective distortion
 * @param {number} angle - Original angle in degrees
 * @param {number} aspectRatio - Perspective aspect ratio
 * @returns {number} Corrected angle
 */
export function correctAngleForPerspective(angle, aspectRatio) {
  if (Math.abs(aspectRatio - 1) < 0.1) {
    return angle; // No significant distortion
  }
  
  // Apply perspective correction to angle
  // This is a simplified correction - real perspective correction is more complex
  const radians = angle * (Math.PI / 180);
  const correctedRadians = Math.atan2(Math.sin(radians) * aspectRatio, Math.cos(radians));
  let correctedAngle = correctedRadians * (180 / Math.PI);
  
  if (correctedAngle < 0) correctedAngle += 360;
  return correctedAngle;
}

/**
 * Calculate wheel number position from angle
 * @param {number} wheelAngle - Angle on wheel (0° = top, clockwise)
 * @param {number} zeroAngle - Angle where zero is positioned
 * @returns {Object} Number position info
 */
export function calculateNumberPosition(wheelAngle, zeroAngle = 0) {
  // European roulette wheel layout
  const wheelNumbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ];
  
  // Calculate angle per number (360° / 37 numbers)
  const anglePerNumber = 360 / 37;
  
  // Adjust angle relative to zero position
  let adjustedAngle = wheelAngle - zeroAngle;
  if (adjustedAngle < 0) adjustedAngle += 360;
  
  // Find nearest number
  const numberIndex = Math.round(adjustedAngle / anglePerNumber) % 37;
  const nearestNumber = wheelNumbers[numberIndex];
  
  // Calculate exact position within the number sector
  const exactPosition = (adjustedAngle % anglePerNumber) / anglePerNumber;
  
  return {
    number: nearestNumber,
    numberIndex,
    exactAngle: adjustedAngle,
    sectorPosition: exactPosition, // 0-1 within the number sector
    angleFromCenter: adjustedAngle
  };
}

/**
 * Estimate wheel radius in centimeters from pixel radius
 * @param {number} radiusPixels - Wheel radius in pixels
 * @param {Object} calibrationMetadata - Additional calibration data
 * @returns {number} Estimated radius in centimeters
 */
export function estimateWheelRadiusCm(radiusPixels, calibrationMetadata = {}) {
  // For Cammegh Mercury 360, actual radius is 40cm
  // We can estimate based on typical video resolutions and wheel sizes
  
  const defaultRadiusCm = 40; // Cammegh Mercury 360 standard
  
  // If we have stream metadata, we can make better estimates
  if (calibrationMetadata.streamWidth && calibrationMetadata.streamHeight) {
    // Estimate based on typical casino camera setups
    // This is a rough estimation - in practice, you'd calibrate this
    const estimatedRadiusCm = (radiusPixels / calibrationMetadata.streamWidth) * 200; // Rough estimate
    
    console.log('📏 Radius estimation:', {
      radiusPixels,
      streamWidth: calibrationMetadata.streamWidth,
      estimatedRadiusCm: estimatedRadiusCm.toFixed(1),
      usingDefault: estimatedRadiusCm < 25 || estimatedRadiusCm > 60
    });
    
    // Sanity check - wheel radius should be reasonable
    if (estimatedRadiusCm >= 25 && estimatedRadiusCm <= 60) {
      return estimatedRadiusCm;
    }
  }
  
  return defaultRadiusCm;
}

/**
 * Validate calibration quality
 * @param {Object} transformData - Perspective transformation data
 * @returns {Object} Quality assessment
 */
export function validateCalibrationQuality(transformData) {
  const { aspectRatio, distortionFactor, averageRadius } = transformData;
  
  let quality = 100;
  const issues = [];
  
  // Check for excessive perspective distortion
  if (distortionFactor > 0.3) {
    quality -= 30;
    issues.push('High perspective distortion detected');
  } else if (distortionFactor > 0.15) {
    quality -= 15;
    issues.push('Moderate perspective distortion');
  }
  
  // Check for reasonable wheel size
  if (averageRadius < 50) {
    quality -= 20;
    issues.push('Wheel appears very small - check zoom level');
  } else if (averageRadius > 500) {
    quality -= 10;
    issues.push('Wheel appears very large - check distance');
  }
  
  // Check aspect ratio for reasonable camera angle
  if (aspectRatio < 0.5 || aspectRatio > 2.0) {
    quality -= 25;
    issues.push('Extreme camera angle detected');
  }
  
  quality = Math.max(0, quality);
  
  const qualityLevel = quality >= 80 ? 'Excellent' : 
                      quality >= 60 ? 'Good' : 
                      quality >= 40 ? 'Fair' : 'Poor';
  
  console.log('✅ Calibration quality assessment:', {
    quality: quality + '%',
    level: qualityLevel,
    issues: issues.length > 0 ? issues : ['No issues detected']
  });
  
  return {
    quality,
    qualityLevel,
    issues,
    isAcceptable: quality >= 40
  };
}