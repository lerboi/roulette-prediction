// Physics calculation utilities for roulette prediction

/**
 * Calculate ball velocity at different points in time
 * @param {Array} revolutions - Array of revolution data points
 * @returns {Object} Velocity analysis
 */
export function calculateBallVelocity(revolutions) {
  if (revolutions.length < 2) {
    return { error: 'Need at least 2 revolutions for velocity calculation' };
  }

  const velocities = [];
  const revolutionTimes = [];

  // Calculate time between revolutions and instantaneous velocities
  for (let i = 1; i < revolutions.length; i++) {
    const timeDiff = revolutions[i].elapsedTime - revolutions[i-1].elapsedTime;
    const velocity = 1 / timeDiff; // revolutions per second
    
    revolutionTimes.push(timeDiff);
    velocities.push({
      time: revolutions[i].elapsedTime,
      velocity: velocity,
      revolutionTime: timeDiff
    });
  }

  const averageVelocity = velocities.reduce((sum, v) => sum + v.velocity, 0) / velocities.length;
  
  return {
    velocities,
    revolutionTimes,
    averageVelocity,
    initialVelocity: velocities[0]?.velocity || 0,
    finalVelocity: velocities[velocities.length - 1]?.velocity || 0
  };
}

/**
 * Calculate ball deceleration using linear regression
 * @param {Array} velocities - Velocity data points
 * @returns {Object} Deceleration analysis
 */
export function calculateDeceleration(velocities) {
  if (velocities.length < 2) {
    return { deceleration: 0, rSquared: 0 };
  }

  const n = velocities.length;
  const sumX = velocities.reduce((sum, v) => sum + v.time, 0);
  const sumY = velocities.reduce((sum, v) => sum + v.velocity, 0);
  const sumXY = velocities.reduce((sum, v) => sum + (v.time * v.velocity), 0);
  const sumXX = velocities.reduce((sum, v) => sum + (v.time * v.time), 0);

  // Linear regression: v = at + b (where 'a' is deceleration)
  const deceleration = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - deceleration * sumX) / n;

  // Calculate R-squared for goodness of fit
  const yMean = sumY / n;
  const ssRes = velocities.reduce((sum, v) => {
    const predicted = deceleration * v.time + intercept;
    return sum + Math.pow(v.velocity - predicted, 2);
  }, 0);
  const ssTot = velocities.reduce((sum, v) => sum + Math.pow(v.velocity - yMean, 2), 0);
  const rSquared = 1 - (ssRes / ssTot);

  return {
    deceleration,
    intercept,
    rSquared: Math.max(0, rSquared) // Ensure non-negative
  };
}

/**
 * Predict when the ball will drop based on velocity threshold
 * @param {Object} velocityData - Velocity calculation results
 * @param {Object} decelData - Deceleration calculation results
 * @param {number} dropThreshold - Speed at which ball drops (rev/sec)
 * @param {number} currentTime - Current elapsed time
 * @returns {Object} Drop prediction
 */
export function predictBallDrop(velocityData, decelData, dropThreshold, currentTime) {
  if (!velocityData.velocities || velocityData.velocities.length === 0) {
    return { error: 'No velocity data available' };
  }

  const { deceleration, intercept } = decelData;
  
  // Solve: dropThreshold = deceleration * t + intercept
  // t = (dropThreshold - intercept) / deceleration
  let dropTime;
  
  if (Math.abs(deceleration) < 0.001) {
    // If deceleration is nearly zero, use average velocity
    dropTime = currentTime + 2; // default assumption
  } else {
    dropTime = (dropThreshold - intercept) / deceleration;
  }

  // Ensure drop time is in the future and reasonable
  if (dropTime <= currentTime) {
    dropTime = currentTime + 0.5; // Minimum 0.5 seconds from now
  }

  const timeUntilDrop = Math.max(0, dropTime - currentTime);
  const currentVelocity = deceleration * currentTime + intercept;

  return {
    dropTime,
    timeUntilDrop,
    currentVelocity,
    confidence: Math.min(95, decelData.rSquared * 100)
  };
}

/**
 * Calculate final ball and wheel positions at drop time
 * @param {string} releasePosition - Initial ball position (number)
 * @param {Array} revolutions - Revolution data
 * @param {number} dropTime - Predicted drop time
 * @param {number} wheelSpeed - Wheel rotation speed (RPM) - USER SETTING
 * @param {number} wheelRadius - Wheel radius (cm) - USER SETTING (Cammegh Mercury 360: 40cm)
 * @returns {Object} Position predictions
 */
export function calculateFinalPositions(releasePosition, revolutions, dropTime, wheelSpeed, wheelRadius = 40) {
  console.log(`🎰 calculateFinalPositions called with CAMMEGH MERCURY 360 SETTINGS:`, {
    wheelSpeed: wheelSpeed + ' RPM',
    wheelRadius: wheelRadius + ' cm (Cammegh Mercury 360 standard: 40cm)',
    wheelCircumference: (2 * Math.PI * wheelRadius).toFixed(1) + ' cm',
    dropTime: dropTime?.toFixed(3) + ' seconds'
  });

  const releaseNum = parseInt(releasePosition);
  if (isNaN(releaseNum)) {
    return { error: 'Invalid release position' };
  }

  // European roulette wheel layout (0-36) - Cammegh Mercury 360 uses standard layout
  const wheelNumbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ];

  // Find release position index on wheel
  const releaseIndex = wheelNumbers.indexOf(releaseNum);
  if (releaseIndex === -1) {
    return { error: 'Release position not found on wheel' };
  }

  // Calculate ball track radius (ball runs slightly inside the wheel rim)
  const ballTrackRadius = wheelRadius * 0.9375; // ~37.5cm for 40cm wheel radius
  const ballTrackCircumference = 2 * Math.PI * ballTrackRadius;

  console.log(`📏 Cammegh Mercury 360 Measurements:`, {
    wheelRadius: wheelRadius + ' cm',
    ballTrackRadius: ballTrackRadius.toFixed(1) + ' cm', 
    ballTrackCircumference: ballTrackCircumference.toFixed(1) + ' cm',
    pocketSpacing: (ballTrackCircumference / 37).toFixed(1) + ' cm per pocket'
  });

  // Calculate total ball revolutions at drop time
  const lastRevolutionTime = revolutions.length > 0 ? revolutions[revolutions.length - 1]?.elapsedTime || 0 : 0;
  const remainingTime = dropTime - lastRevolutionTime;
  const estimatedSpeed = revolutions.length > 1 ? 
    1 / ((revolutions[revolutions.length - 1].elapsedTime - revolutions[revolutions.length - 2].elapsedTime)) : 1;
  const additionalRevolutions = Math.max(0, remainingTime * estimatedSpeed);
  const totalRevolutions = revolutions.length + additionalRevolutions;

  console.log(`🔄 Revolution calculations:`, {
    recordedRevolutions: revolutions.length,
    estimatedAdditionalRevs: additionalRevolutions.toFixed(3),
    totalRevolutions: totalRevolutions.toFixed(3)
  });

  // Calculate ball position (in wheel sectors)
  const ballSectorsFromStart = totalRevolutions * 37; // 37 sectors per revolution
  const ballFinalIndex = (releaseIndex + ballSectorsFromStart) % 37;

  // Calculate wheel position at drop time - USING USER'S WHEEL SPEED SETTING
  const wheelRevolutionsAtDrop = (wheelSpeed / 60) * dropTime; // Convert RPM to rev/sec
  const wheelSectorsFromStart = wheelRevolutionsAtDrop * 37;
  const wheelPositionShift = wheelSectorsFromStart % 37;

  console.log(`⚙️ Wheel calculations using USER SPEED ${wheelSpeed} RPM:`, {
    wheelRevolutionsAtDrop: wheelRevolutionsAtDrop.toFixed(3),
    wheelSectorsFromStart: wheelSectorsFromStart.toFixed(3),
    wheelPositionShift: wheelPositionShift.toFixed(3)
  });

  // Calculate relative position
  const relativePosition = (ballFinalIndex - wheelPositionShift + 37) % 37;
  const predictedSector = Math.round(relativePosition);
  const predictedNumber = wheelNumbers[predictedSector];

  console.log(`🎯 Final position calculations:`, {
    ballFinalIndex: ballFinalIndex.toFixed(3),
    relativePosition: relativePosition.toFixed(3),
    predictedSector,
    predictedNumber
  });

  return {
    ballPosition: ballFinalIndex,
    wheelPosition: wheelPositionShift,
    relativePosition,
    predictedSector,
    predictedNumber,
    totalRevolutions,
    // Include settings used for verification
    settingsUsed: {
      wheelSpeed: wheelSpeed + ' RPM',
      wheelRadius: wheelRadius + ' cm',
      ballTrackRadius: ballTrackRadius.toFixed(1) + ' cm',
      ballTrackCircumference: ballTrackCircumference.toFixed(1) + ' cm'
    }
  };
}

/**
 * Generate betting sectors based on predicted position
 * @param {number} predictedSector - Main predicted sector
 * @param {number} confidence - Prediction confidence (0-100)
 * @returns {Array} Recommended betting sectors with probabilities
 */
export function generateBettingSectors(predictedSector, confidence) {
  const sectors = [];
  const wheelNumbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ];

  // Determine spread based on confidence
  let spread = 3; // default ±3 sectors
  if (confidence > 80) spread = 2;
  if (confidence > 90) spread = 1;
  if (confidence < 60) spread = 4;

  // Generate sector recommendations
  for (let i = -spread; i <= spread; i++) {
    const sectorIndex = (predictedSector + i + 37) % 37;
    const number = wheelNumbers[sectorIndex];
    
    // Calculate probability based on distance from center
    let probability;
    if (i === 0) {
      probability = Math.max(20, confidence * 0.4); // Center sector
    } else if (Math.abs(i) === 1) {
      probability = Math.max(15, confidence * 0.25); // Adjacent sectors
    } else {
      probability = Math.max(5, confidence * 0.1); // Outer sectors
    }

    sectors.push({
      sector: sectorIndex,
      number: number,
      distance: Math.abs(i),
      probability: Math.round(probability),
      recommended: Math.abs(i) <= 2 // Recommend inner sectors
    });
  }

  // Sort by probability (highest first)
  sectors.sort((a, b) => b.probability - a.probability);

  return sectors;
}

/**
 * Generate dozens betting recommendations (1st 12, 2nd 12, 3rd 12)
 * @param {Array} sectors - Individual number sectors with probabilities
 * @returns {Object} Dozens betting analysis
 */
export function generateDozensBetting(sectors) {
  const dozens = {
    first: { name: '1st 12', numbers: [], totalProbability: 0, numbers_range: '1-12' },
    second: { name: '2nd 12', numbers: [], totalProbability: 0, numbers_range: '13-24' },
    third: { name: '3rd 12', numbers: [], totalProbability: 0, numbers_range: '25-36' },
    zero: { name: 'Zero', numbers: [], totalProbability: 0, numbers_range: '0' }
  };

  // Categorize numbers and sum probabilities
  sectors.forEach(sector => {
    const number = sector.number;
    
    if (number === 0) {
      dozens.zero.numbers.push(sector);
      dozens.zero.totalProbability += sector.probability;
    } else if (number >= 1 && number <= 12) {
      dozens.first.numbers.push(sector);
      dozens.first.totalProbability += sector.probability;
    } else if (number >= 13 && number <= 24) {
      dozens.second.numbers.push(sector);
      dozens.second.totalProbability += sector.probability;
    } else if (number >= 25 && number <= 36) {
      dozens.third.numbers.push(sector);
      dozens.third.totalProbability += sector.probability;
    }
  });

  // Sort dozens by probability
  const sortedDozens = Object.values(dozens)
    .filter(dozen => dozen.totalProbability > 0)
    .sort((a, b) => b.totalProbability - a.totalProbability);

  // Calculate expected values for dozens bets
  // Dozens bet pays 2:1 (you get 3x your bet back including original stake)
  const dozensPayout = 2; // 2:1 payout ratio
  const dozensAnalysis = sortedDozens.map(dozen => {
    const winProbability = dozen.totalProbability / 100;
    
    // Expected value calculation for 2:1 payout (3x total return):
    // Win: probability * (2 * bet) = probability * 2 (profit only)  
    // Lose: (1 - probability) * (-1 * bet) = (1 - probability) * (-1) (loss)
    // EV = (winProb * 2) + ((1 - winProb) * (-1))
    // EV = (winProb * 2) - (1 - winProb) = (winProb * 3) - 1
    const expectedValue = (winProbability * 3) - 1; // This gives profit/loss per $1 bet
    const roi = expectedValue * 100; // Convert to percentage
    
    console.log(`📊 Dozens calculation for ${dozen.name}:`, {
      probability: dozen.totalProbability.toFixed(1) + '%',
      winProbability: winProbability.toFixed(3),
      expectedValue: expectedValue.toFixed(3),
      roi: roi.toFixed(1) + '%',
      payout: '2:1 (3x total return)'
    });
    
    return {
      ...dozen,
      expectedValue,
      roi,
      recommended: roi > -2.7, // Recommend if better than house edge (-2.7%)
      payout: `2:1`
    };
  });

  return {
    analysis: dozensAnalysis,
    bestDozen: dozensAnalysis[0] || null,
    hasAdvantage: dozensAnalysis.some(d => d.roi > 0)
  };
}

/**
 * Calculate expected value for betting strategy
 * @param {Array} sectors - Betting sectors with probabilities
 * @param {number} betAmount - Amount to bet per sector
 * @returns {Object} Expected value analysis
 */
export function calculateExpectedValue(sectors, betAmount = 1) {
  const recommendedSectors = sectors.filter(s => s.recommended);
  const totalProbability = recommendedSectors.reduce((sum, s) => sum + s.probability, 0);
  
  // Normalize probabilities to sum to 100
  const normalizedSectors = recommendedSectors.map(s => ({
    ...s,
    normalizedProbability: (s.probability / totalProbability) * 100
  }));

  // Calculate expected value
  // European roulette: single number pays 35:1, house edge is 2.7%
  const singleNumberPayout = 35;
  const totalBet = recommendedSectors.length * betAmount;
  
  let expectedWin = 0;
  normalizedSectors.forEach(sector => {
    const winProbability = sector.normalizedProbability / 100;
    expectedWin += winProbability * (singleNumberPayout * betAmount);
  });

  const expectedValue = expectedWin - totalBet;
  const roi = (expectedValue / totalBet) * 100;

  return {
    totalBet,
    expectedWin,
    expectedValue,
    roi,
    normalizedSectors,
    houseEdgeBeaten: roi > 2.7 // If ROI > house edge, we have an advantage
  };
}

/**
 * Validate revolution data for consistency
 * @param {Array} revolutions - Revolution timing data
 * @returns {Object} Validation results
 */
export function validateRevolutionData(revolutions) {
  if (revolutions.length < 2) {
    return {
      valid: false,
      error: 'Need at least 2 revolutions',
      warnings: []
    };
  }

  const warnings = [];
  const revolutionTimes = [];
  
  // Calculate revolution times
  for (let i = 1; i < revolutions.length; i++) {
    const timeDiff = revolutions[i].elapsedTime - revolutions[i-1].elapsedTime;
    revolutionTimes.push(timeDiff);
  }

  // Check for consistent timing
  const avgTime = revolutionTimes.reduce((a, b) => a + b, 0) / revolutionTimes.length;
  const maxDeviation = Math.max(...revolutionTimes.map(t => Math.abs(t - avgTime)));
  
  if (maxDeviation > avgTime * 0.5) {
    warnings.push('Large variation in revolution timing detected');
  }

  // Check for reasonable revolution times (0.3 to 3 seconds per revolution)
  const unreasonableTimes = revolutionTimes.filter(t => t < 0.3 || t > 3);
  if (unreasonableTimes.length > 0) {
    warnings.push('Some revolution times seem unrealistic');
  }

  // Check for minimum data quality
  const dataQualityScore = Math.max(0, 100 - (warnings.length * 25) - (maxDeviation / avgTime * 50));

  return {
    valid: revolutionTimes.length >= 1,
    warnings,
    avgRevolutionTime: avgTime,
    maxDeviation,
    dataQualityScore: Math.round(dataQualityScore),
    revolutionCount: revolutions.length
  };
}