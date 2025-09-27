// src/utils/realTimeAngleSwitcher.js
// Real-time angle detection and automatic calibration switching

import { AngleDetectionEngine } from './angleDetection';
import { 
  findBestCalibrationForAngle, 
  logAngleDetection,
  updateAngleSwitchingPattern 
} from './multiAngleDatabase';

/**
 * Real-time angle switching manager for multi-angle ball tracking
 */
export class RealTimeAngleSwitcher {
  constructor() {
    this.angleDetectionEngine = new AngleDetectionEngine();
    this.isActive = false;
    this.currentGroupId = null;
    this.currentCalibration = null;
    this.currentAngle = null;
    this.sessionId = null;
    this.switchingHistory = [];
    this.callbacks = {
      onAngleChanged: null,
      onCalibrationSwitched: null,
      onSwitchingError: null
    };
    
    // Detection settings
    this.detectionInterval = 2000; // Check angle every 2 seconds
    this.confidenceThreshold = 0.7;
    this.stabilityWindow = 3; // Require 3 consistent detections before switching
    this.detectionTimer = null;
    this.lastSwitchTime = 0;
    this.minSwitchInterval = 5000; // Minimum 5 seconds between switches
    
    // Pattern learning
    this.angleSequence = [];
    this.switchTimings = [];
  }

  /**
   * Start real-time angle detection and switching
   * @param {string} groupId - Calibration group ID
   * @param {Object} initialCalibration - Initial calibration to use
   * @param {HTMLVideoElement} videoElement - Video element for angle detection
   * @param {HTMLCanvasElement} canvasElement - Canvas for frame processing
   */
  async start(groupId, initialCalibration, videoElement, canvasElement) {
    if (this.isActive) {
      console.warn('Real-time angle switcher already active');
      return;
    }

    this.currentGroupId = groupId;
    this.currentCalibration = initialCalibration;
    this.currentAngle = initialCalibration?.angle_identifier || 'unknown';
    this.sessionId = 'session_' + Date.now();
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    this.isActive = true;
    this.switchingHistory = [];
    this.angleSequence = [this.currentAngle];

    console.log('🔄 Starting real-time angle switching for group:', groupId);
    console.log('📐 Initial angle:', this.currentAngle);

    // Set up angle change callback
    this.angleDetectionEngine.onAngleChange(this.handleAngleChange.bind(this));

    // Start periodic angle detection
    this.startPeriodicDetection();

    // Log initial state
    await this.logDetection(this.currentAngle, 1.0, initialCalibration?.angle_quality_score || 0);
  }

  /**
   * Stop real-time angle detection and switching
   */
  stop() {
    if (!this.isActive) return;

    console.log('🛑 Stopping real-time angle switching');

    this.isActive = false;
    this.clearDetectionTimer();
    this.angleDetectionEngine.reset();

    // Analyze and save switching patterns
    this.analyzeAndSavePatterns();

    // Clear state
    this.currentGroupId = null;
    this.currentCalibration = null;
    this.currentAngle = null;
    this.sessionId = null;
  }

  /**
   * Start periodic angle detection
   */
  startPeriodicDetection() {
    this.clearDetectionTimer();
    
    this.detectionTimer = setInterval(() => {
      this.performAngleDetection();
    }, this.detectionInterval);

    console.log(`🔍 Started periodic angle detection (every ${this.detectionInterval}ms)`);
  }

  /**
   * Clear detection timer
   */
  clearDetectionTimer() {
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
      this.detectionTimer = null;
    }
  }

  /**
   * Perform a single angle detection
   */
  performAngleDetection() {
    if (!this.isActive || !this.videoElement || !this.canvasElement) {
      return;
    }

    try {
      // Capture current frame
      const canvas = this.canvasElement;
      const video = this.videoElement;
      
      if (video.readyState < 2) {
        return; // Video not ready
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Detect angle
      const result = this.angleDetectionEngine.detectAngle(imageData);
      
      if (result.confidence >= this.confidenceThreshold) {
        console.log('📐 Angle detected:', {
          angle: result.angleId,
          confidence: result.confidence.toFixed(2),
          quality: result.qualityScore
        });

        // Check if angle has changed and is stable
        if (result.changed && this.shouldSwitchAngle(result.angleId)) {
          this.handleAngleSwitch(result.angleId, result.confidence, result.qualityScore);
        }

        // Log detection
        this.logDetection(result.angleId, result.confidence, result.qualityScore);
      }
    } catch (error) {
      console.error('❌ Error during angle detection:', error);
    }
  }

  /**
   * Check if we should switch to a new angle
   * @param {string} newAngle - Newly detected angle
   * @returns {boolean} Whether to switch
   */
  shouldSwitchAngle(newAngle) {
    // Don't switch to the same angle
    if (newAngle === this.currentAngle) {
      return false;
    }

    // Respect minimum switch interval
    const timeSinceLastSwitch = Date.now() - this.lastSwitchTime;
    if (timeSinceLastSwitch < this.minSwitchInterval) {
      console.log(`⏳ Too soon to switch (${timeSinceLastSwitch}ms < ${this.minSwitchInterval}ms)`);
      return false;
    }

    // Don't switch to unknown angles unless necessary
    if (newAngle === 'unknown' && this.currentCalibration) {
      console.log('❓ Skipping switch to unknown angle');
      return false;
    }

    return true;
  }

  /**
   * Handle angle change detection
   * @param {Object} angleChangeData - Angle change event data
   */
  async handleAngleChange(angleChangeData) {
    const { newAngle, previousAngle, confidence } = angleChangeData;
    
    console.log('🔄 Angle change detected:', {
      from: previousAngle,
      to: newAngle,
      confidence: confidence.toFixed(2)
    });

    // Update sequence tracking
    if (newAngle !== previousAngle) {
      this.angleSequence.push(newAngle);
      this.switchTimings.push(Date.now());
    }
  }

  /**
   * Handle angle switch with calibration update
   * @param {string} newAngle - New angle to switch to
   * @param {number} confidence - Detection confidence
   * @param {number} qualityScore - Detection quality score
   */
  async handleAngleSwitch(newAngle, confidence, qualityScore) {
    const previousAngle = this.currentAngle;
    const switchTime = Date.now();
    const switchDuration = Math.round((switchTime - this.lastSwitchTime) / 1000);

    console.log(`🔄 Switching angle: ${previousAngle} → ${newAngle}`);

    try {
      // Find best calibration for new angle
      const calibrationResult = await findBestCalibrationForAngle(
        this.currentGroupId, 
        newAngle, 
        60 // Minimum quality threshold
      );

      if (calibrationResult.calibration) {
        // Switch to new calibration
        const oldCalibration = this.currentCalibration;
        this.currentCalibration = calibrationResult.calibration;
        this.currentAngle = newAngle;
        this.lastSwitchTime = switchTime;

        // Record switch in history
        this.switchingHistory.push({
          fromAngle: previousAngle,
          toAngle: newAngle,
          timestamp: switchTime,
          duration: switchDuration,
          calibrationUsed: calibrationResult.calibration.id,
          wasFallback: calibrationResult.fallback,
          confidence,
          qualityScore
        });

        console.log(`✅ Calibration switched:`, {
          angle: newAngle,
          calibrationId: calibrationResult.calibration.id,
          quality: calibrationResult.calibration.angle_quality_score,
          fallback: calibrationResult.fallback
        });

        // Notify callback
        if (this.callbacks.onCalibrationSwitched) {
          this.callbacks.onCalibrationSwitched({
            newCalibration: this.currentCalibration,
            oldCalibration,
            angleChange: {
              from: previousAngle,
              to: newAngle,
              switchDuration,
              confidence,
              qualityScore
            },
            fallbackUsed: calibrationResult.fallback,
            reason: calibrationResult.reason
          });
        }

        // Log successful switch
        await this.logDetection(newAngle, confidence, qualityScore, previousAngle, switchDuration);

      } else {
        // No suitable calibration found
        console.warn(`⚠️ No calibration available for angle: ${newAngle}`);
        console.warn(`Reason: ${calibrationResult.reason}`);

        // Keep current calibration but note the angle change
        this.currentAngle = newAngle;

        if (this.callbacks.onSwitchingError) {
          this.callbacks.onSwitchingError({
            newAngle,
            previousAngle,
            reason: calibrationResult.reason,
            action: 'keeping_current_calibration'
          });
        }
      }

    } catch (error) {
      console.error('❌ Error during angle switch:', error);

      if (this.callbacks.onSwitchingError) {
        this.callbacks.onSwitchingError({
          newAngle,
          previousAngle,
          error: error.message,
          action: 'switch_failed'
        });
      }
    }
  }

  /**
   * Log angle detection event
   * @param {string} angle - Detected angle
   * @param {number} confidence - Detection confidence
   * @param {number} qualityScore - Quality score
   * @param {string} previousAngle - Previous angle
   * @param {number} switchDuration - Duration since last switch
   */
  async logDetection(angle, confidence, qualityScore, previousAngle = null, switchDuration = null) {
    try {
      await logAngleDetection(
        this.currentGroupId,
        angle,
        confidence,
        qualityScore,
        this.sessionId,
        previousAngle,
        switchDuration
      );
    } catch (error) {
      console.error('Error logging angle detection:', error);
    }
  }

  /**
   * Analyze switching patterns and save to database
   */
  async analyzeAndSavePatterns() {
    if (this.switchingHistory.length < 2) {
      console.log('📊 Not enough switching data for pattern analysis');
      return;
    }

    try {
      // Calculate average switching interval
      const intervals = [];
      for (let i = 1; i < this.switchTimings.length; i++) {
        const interval = (this.switchTimings[i] - this.switchTimings[i-1]) / 1000;
        intervals.push(interval);
      }

      const avgInterval = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);

      // Get unique angle sequence
      const uniqueSequence = [...new Set(this.angleSequence)];

      // Calculate pattern confidence based on consistency
      const patternConfidence = this.calculatePatternConfidence();

      console.log('📊 Switching pattern analysis:', {
        totalSwitches: this.switchingHistory.length,
        avgInterval: avgInterval + 's',
        angleSequence: uniqueSequence,
        confidence: (patternConfidence * 100).toFixed(1) + '%'
      });

      // Save pattern to database
      await updateAngleSwitchingPattern(
        this.currentGroupId,
        avgInterval,
        uniqueSequence,
        patternConfidence
      );

    } catch (error) {
      console.error('Error analyzing switching patterns:', error);
    }
  }

  /**
   * Calculate pattern confidence based on switching consistency
   * @returns {number} Confidence score (0-1)
   */
  calculatePatternConfidence() {
    if (this.switchingHistory.length < 3) return 0.5;

    // Check timing consistency
    const intervals = this.switchingHistory.map(switch_ => switch_.duration);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const timingConsistency = Math.max(0, 1 - (variance / (avgInterval * avgInterval)));

    // Check angle sequence patterns
    const sequenceConsistency = this.analyzeSequenceConsistency();

    // Combine factors
    const confidence = (timingConsistency * 0.6) + (sequenceConsistency * 0.4);
    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Analyze consistency of angle sequences
   * @returns {number} Sequence consistency score (0-1)
   */
  analyzeSequenceConsistency() {
    if (this.angleSequence.length < 4) return 0.5;

    // Look for repeating patterns
    const transitions = {};
    for (let i = 1; i < this.angleSequence.length; i++) {
      const transition = `${this.angleSequence[i-1]}→${this.angleSequence[i]}`;
      transitions[transition] = (transitions[transition] || 0) + 1;
    }

    // Calculate how often transitions repeat
    const transitionCounts = Object.values(transitions);
    const totalTransitions = transitionCounts.reduce((a, b) => a + b, 0);
    const repeatingTransitions = transitionCounts.filter(count => count > 1).length;

    return repeatingTransitions / totalTransitions;
  }

  /**
   * Get current angle switching state
   * @returns {Object} Current state information
   */
  getCurrentState() {
    return {
      isActive: this.isActive,
      currentAngle: this.currentAngle,
      currentCalibration: this.currentCalibration,
      sessionId: this.sessionId,
      switchingHistory: [...this.switchingHistory],
      angleSequence: [...this.angleSequence],
      lastSwitchTime: this.lastSwitchTime,
      totalSwitches: this.switchingHistory.length
    };
  }

  /**
   * Set callback functions for angle switching events
   * @param {Object} callbacks - Event callbacks
   */
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Force a manual angle switch (for testing or manual override)
   * @param {string} targetAngle - Angle to switch to
   */
  async forceAngleSwitch(targetAngle) {
    if (!this.isActive) {
      throw new Error('Angle switcher not active');
    }

    console.log(`🔧 Forcing manual switch to angle: ${targetAngle}`);
    await this.handleAngleSwitch(targetAngle, 1.0, 100);
  }

  /**
   * Update detection settings
   * @param {Object} settings - New settings
   */
  updateSettings(settings) {
    if (settings.detectionInterval) {
      this.detectionInterval = settings.detectionInterval;
      if (this.isActive) {
        this.startPeriodicDetection(); // Restart with new interval
      }
    }

    if (settings.confidenceThreshold) {
      this.confidenceThreshold = settings.confidenceThreshold;
    }

    if (settings.minSwitchInterval) {
      this.minSwitchInterval = settings.minSwitchInterval;
    }

    console.log('⚙️ Updated angle switcher settings:', settings);
  }

  /**
   * Get switching statistics for the current session
   * @returns {Object} Session statistics
   */
  getSessionStatistics() {
    const stats = {
      sessionDuration: this.sessionId ? Date.now() - parseInt(this.sessionId.split('_')[1]) : 0,
      totalSwitches: this.switchingHistory.length,
      uniqueAngles: new Set(this.angleSequence).size,
      averageSwitchInterval: 0,
      mostCommonAngle: null,
      switchingFrequency: 0
    };

    if (this.switchingHistory.length > 0) {
      // Calculate average interval
      const intervals = this.switchingHistory.map(s => s.duration).filter(d => d > 0);
      stats.averageSwitchInterval = intervals.length > 0 ? 
        Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;

      // Find most common angle
      const angleCounts = {};
      this.angleSequence.forEach(angle => {
        angleCounts[angle] = (angleCounts[angle] || 0) + 1;
      });
      stats.mostCommonAngle = Object.keys(angleCounts).reduce((a, b) => 
        angleCounts[a] > angleCounts[b] ? a : b);

      // Calculate switching frequency (switches per minute)
      stats.switchingFrequency = (this.switchingHistory.length / (stats.sessionDuration / 60000)).toFixed(2);
    }

    return stats;
  }
}

export default RealTimeAngleSwitcher;