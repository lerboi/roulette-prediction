// src/components/OpticalMonitor.js
// Enhanced optical monitoring component with real-time angle switching

'use client';

import { useState, useRef, useEffect } from 'react';
import { Camera, Square, Settings, Eye, EyeOff, AlertCircle, Target, Database, X, RotateCcw, Zap } from 'lucide-react';
import CalibrationOverlay from './CalibrationOverlay';
import CalibrationManager from './CalibrationManager';
import MultiAngleCalibrationManager from './MultiAngleCalibrationManager';
import { 
  startScreenCapture, 
  stopScreenCapture, 
  isScreenCaptureSupported,
  createVideoElement,
  getStreamMetadata,
  isVideoReady
} from '../utils/screenCapture';
import { saveWheelCalibration } from '../utils/opticalDatabase';
import { calculatePerspectiveTransform, validateCalibrationQuality, estimateWheelRadiusCm } from '../utils/perspectiveTransform';
import { BallTrackingManager } from '../utils/computerVision';
import { RealTimeAngleSwitcher } from '../utils/realTimeAngleSwitcher';
import { getOrCreateCalibrationGroup, getBestCalibration } from '../utils/multiAngleDatabase';

export default function OpticalMonitor({ 
  isActive, 
  onToggle, 
  onCalibrationData, 
  onRevolutionDetected,
  settings 
}) {
  // State management
  const [captureState, setCaptureState] = useState('idle'); // idle, starting, active, error
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [streamMetadata, setStreamMetadata] = useState(null);
  const [trackingStatus, setTrackingStatus] = useState({
    ballDetected: false,
    confidence: 0,
    wheelDetected: false,
    calibrated: false
  });
  
  // Calibration state
  const [showCalibrationOverlay, setShowCalibrationOverlay] = useState(false);
  const [showCalibrationManager, setShowCalibrationManager] = useState(false);
  const [showMultiAngleManager, setShowMultiAngleManager] = useState(false);
  const [currentCalibration, setCurrentCalibration] = useState(null);
  const [calibrationQuality, setCalibrationQuality] = useState(null);
  
  // Multi-angle state
  const [multiAngleMode, setMultiAngleMode] = useState(false);
  const [calibrationGroup, setCalibrationGroup] = useState(null);
  const [currentAngleInfo, setCurrentAngleInfo] = useState({
    angle: 'unknown',
    angleName: 'Unknown',
    confidence: 0,
    quality: 0,
    lastSwitch: null
  });
  const [switchingStats, setSwitchingStats] = useState({
    totalSwitches: 0,
    sessionDuration: 0,
    averageInterval: 0
  });

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const ballTrackingManagerRef = useRef(null);
  const angleSwitcherRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stopScreenCapture(stream);
      }
      if (ballTrackingManagerRef.current) {
        ballTrackingManagerRef.current.destroy();
      }
      if (angleSwitcherRef.current) {
        angleSwitcherRef.current.stop();
      }
    };
  }, [stream]);

  // Start optical monitoring
  const startOpticalMonitoring = async () => {
    if (!isScreenCaptureSupported()) {
      setError('Screen capture not supported in this browser. Please use Chrome, Firefox, or Edge.');
      return;
    }

    setCaptureState('starting');
    setError(null);

    try {
      console.log('🎥 Starting optical monitoring...');
      
      // Start screen capture
      const captureStream = await startScreenCapture({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 20, max: 25 }
        }
      });

      // Create video element
      if (videoRef.current) {
        videoRef.current.srcObject = captureStream;
        
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          console.log('📹 Video metadata loaded');
          const metadata = getStreamMetadata(captureStream);
          setStreamMetadata(metadata);
          console.log('📊 Stream metadata:', metadata);
        };

        videoRef.current.oncanplay = () => {
          console.log('✅ Video ready for processing');
          setCaptureState('active');
          setTrackingStatus(prev => ({ ...prev, wheelDetected: true }));
          
          // Initialize ball tracking
          initializeBallTracking();
        };
      }

      setStream(captureStream);

      // Handle stream ending (user stops sharing)
      captureStream.getVideoTracks()[0].onended = () => {
        console.log('📺 Screen sharing ended by user');
        stopOpticalMonitoring();
      };

    } catch (error) {
      console.error('❌ Failed to start optical monitoring:', error);
      setError(error.message);
      setCaptureState('error');
    }
  };

  // Initialize ball tracking system
  const initializeBallTracking = async () => {
    try {
      if (!ballTrackingManagerRef.current) {
        ballTrackingManagerRef.current = new BallTrackingManager();
        
        // Set up tracking callbacks
        ballTrackingManagerRef.current.setCallbacks({
          onBallDetected: handleBallDetected,
          onBallLost: handleBallLost,
          onRevolutionDetected: handleRevolutionDetected,
          onTrackingStarted: handleTrackingStarted,
          onTrackingStopped: handleTrackingStopped,
          onError: handleTrackingError
        });
      }
      
      const initialized = await ballTrackingManagerRef.current.initialize(
        videoRef.current, 
        canvasRef.current
      );
      
      if (initialized) {
        console.log('🎾 Ball tracking system ready');
        
        // Initialize angle switcher if in multi-angle mode
        if (multiAngleMode && calibrationGroup) {
          initializeAngleSwitcher();
        }
        
        // Start tracking if we have calibration data
        if (currentCalibration) {
          ballTrackingManagerRef.current.startTracking(currentCalibration);
        }
      } else {
        throw new Error('Failed to initialize ball tracking');
      }
    } catch (error) {
      console.error('❌ Ball tracking initialization failed:', error);
      setError('Ball tracking initialization failed: ' + error.message);
    }
  };

  // Initialize angle switcher for multi-angle mode
  const initializeAngleSwitcher = async () => {
    try {
      if (!angleSwitcherRef.current) {
        angleSwitcherRef.current = new RealTimeAngleSwitcher();
        
        // Set up angle switching callbacks
        angleSwitcherRef.current.setCallbacks({
          onCalibrationSwitched: handleCalibrationSwitched,
          onSwitchingError: handleSwitchingError
        });
      }

      // Start angle switching with current calibration
      if (currentCalibration && calibrationGroup) {
        await angleSwitcherRef.current.start(
          calibrationGroup.id,
          currentCalibration,
          videoRef.current,
          canvasRef.current
        );
        
        console.log('🔄 Real-time angle switching activated');
      }
    } catch (error) {
      console.error('❌ Angle switcher initialization failed:', error);
      setError('Angle switcher initialization failed: ' + error.message);
    }
  };

  // Handle calibration switched by angle detection
  const handleCalibrationSwitched = (switchData) => {
    const { newCalibration, angleChange, fallbackUsed, reason } = switchData;
    
    console.log('🔄 Calibration switched automatically:', {
      from: angleChange.from,
      to: angleChange.to,
      calibrationId: newCalibration.id,
      fallback: fallbackUsed
    });

    // Update current calibration
    setCurrentCalibration(newCalibration);
    
    // Update angle info
    setCurrentAngleInfo({
      angle: angleChange.to,
      angleName: newCalibration.angle_identifier,
      confidence: Math.round(angleChange.confidence * 100),
      quality: newCalibration.angle_quality_score,
      lastSwitch: Date.now()
    });

    // Update ball tracking with new calibration
    if (ballTrackingManagerRef.current) {
      ballTrackingManagerRef.current.updateCalibration(newCalibration);
    }

    // Notify parent component
    if (onCalibrationData) {
      onCalibrationData({
        wheelRadiusCm: estimateWheelRadiusCm(newCalibration.wheel_radius_pixels, streamMetadata),
        calibrationId: newCalibration.id,
        transformData: newCalibration.perspective_data,
        qualityAssessment: { quality: newCalibration.angle_quality_score },
        autoSwitched: true,
        angleChange,
        fallbackUsed,
        reason
      });
    }

    // Update switching stats
    if (angleSwitcherRef.current) {
      const stats = angleSwitcherRef.current.getSessionStatistics();
      setSwitchingStats({
        totalSwitches: stats.totalSwitches,
        sessionDuration: Math.round(stats.sessionDuration / 1000),
        averageInterval: stats.averageSwitchInterval
      });
    }
  };

  // Handle angle switching errors
  const handleSwitchingError = (errorData) => {
    const { newAngle, reason, action } = errorData;
    
    console.warn('⚠️ Angle switching error:', {
      angle: newAngle,
      reason,
      action
    });

    // Update angle info to show the detection even if switching failed
    setCurrentAngleInfo(prev => ({
      ...prev,
      angle: newAngle,
      angleName: newAngle,
      lastSwitch: Date.now()
    }));
  };

  // Ball tracking event handlers
  const handleBallDetected = (data) => {
    setTrackingStatus(prev => ({
      ...prev,
      ballDetected: true,
      confidence: Math.round(data.confidence * 100)
    }));
  };

  const handleBallLost = (data) => {
    setTrackingStatus(prev => ({
      ...prev,
      ballDetected: false,
      confidence: 0
    }));
  };

  const handleRevolutionDetected = (data) => {
    console.log(`🔄 Revolution ${data.revolutionNumber} detected at ${data.timestamp.toFixed(2)}s`);
    
    // Notify parent component about revolution
    if (onRevolutionDetected) {
      const revolutionData = {
        revolution: data.revolutionNumber,
        timestamp: Date.now(),
        elapsedTime: data.timestamp,
        position: data.position,
        angle: data.angle,
        revolutionNumber: data.revolutionNumber
      };
      
      onRevolutionDetected(revolutionData);
    }
  };

  const handleTrackingStarted = (data) => {
    console.log('🎬 Ball tracking started at:', data.timestamp);
  };

  const handleTrackingStopped = (data) => {
    console.log('🛑 Ball tracking stopped. Total revolutions:', data.revolutionCount);
  };

  const handleTrackingError = (data) => {
    console.error('🚨 Ball tracking error:', data.error);
    setError('Ball tracking error: ' + data.error);
  };

  // Handle calibration completion
  const handleCalibrationComplete = async (calibrationData) => {
    console.log('🎯 Calibration completed:', calibrationData);
    
    try {
      // Calculate perspective transformation
      const transformData = calculatePerspectiveTransform(calibrationData.calibrationPoints);
      
      // Validate calibration quality
      const qualityAssessment = validateCalibrationQuality(transformData);
      setCalibrationQuality(qualityAssessment);
      
      // Estimate wheel radius in cm
      const radiusCm = estimateWheelRadiusCm(transformData.averageRadius, streamMetadata);
      
      // Enhance calibration data with transform calculations
      const enhancedCalibration = {
        ...calibrationData,
        transformationMatrix: transformData.transformMatrix,
        wheelRadiusPixels: transformData.averageRadius,
        wheelRadiusCm: radiusCm,
        perspectiveData: transformData,
        qualityAssessment
      };
      
      // Save to database
      const saveResult = await saveWheelCalibration(enhancedCalibration);
      if (saveResult.success) {
        console.log('✅ Calibration saved to database');
        setCurrentCalibration(enhancedCalibration);
        setTrackingStatus(prev => ({ ...prev, calibrated: true }));
        
        // Notify parent component with physics settings
        if (onCalibrationData) {
          onCalibrationData({
            wheelRadiusCm: radiusCm,
            calibrationId: saveResult.data.id,
            transformData,
            qualityAssessment
          });
        }
        
        // Start ball tracking with new calibration
        if (ballTrackingManagerRef.current) {
          ballTrackingManagerRef.current.updateCalibration(enhancedCalibration);
          ballTrackingManagerRef.current.startTracking(enhancedCalibration);
        }
      } else {
        console.error('❌ Failed to save calibration:', saveResult.error);
        setError('Failed to save calibration: ' + saveResult.error);
      }
    } catch (error) {
      console.error('❌ Error processing calibration:', error);
      setError('Error processing calibration: ' + error.message);
    }
  };

  // Load existing calibration
  const handleLoadCalibration = (calibration) => {
    console.log('📥 Loading existing calibration:', calibration.calibration_name);
    
    try {
      // Reconstruct perspective transform data
      const transformData = calculatePerspectiveTransform(calibration.calibration_points);
      const qualityAssessment = validateCalibrationQuality(transformData);
      
      setCurrentCalibration({
        ...calibration,
        perspectiveData: transformData,
        qualityAssessment
      });
      setCalibrationQuality(qualityAssessment);
      setTrackingStatus(prev => ({ ...prev, calibrated: true }));
      
      // Notify parent component
      if (onCalibrationData) {
        onCalibrationData({
          wheelRadiusCm: calibration.wheel_radius_pixels ? 
            estimateWheelRadiusCm(calibration.wheel_radius_pixels, streamMetadata) : 40,
          calibrationId: calibration.id,
          transformData,
          qualityAssessment
        });
      }
      
      // Update ball tracking with loaded calibration
      if (ballTrackingManagerRef.current) {
        ballTrackingManagerRef.current.updateCalibration({
          ...calibration,
          perspectiveData: transformData,
          qualityAssessment
        });
        ballTrackingManagerRef.current.startTracking({
          ...calibration,
          perspectiveData: transformData
        });
      }
      
    } catch (error) {
      console.error('❌ Error loading calibration:', error);
      setError('Error loading calibration: ' + error.message);
    }
  };

  // Handle multi-angle calibration setup complete
  const handleMultiAngleCalibrationChange = async (bestCalibration, group) => {
    console.log('🎯 Multi-angle setup complete:', {
      group: group.casino_name + ' - ' + group.table_name,
      bestCalibration: bestCalibration.angle_identifier
    });

    setMultiAngleMode(true);
    setCalibrationGroup(group);
    setCurrentCalibration(bestCalibration);
    setTrackingStatus(prev => ({ ...prev, calibrated: true }));

    // Set initial angle info
    setCurrentAngleInfo({
      angle: bestCalibration.angle_identifier,
      angleName: bestCalibration.angle_identifier,
      confidence: 100,
      quality: bestCalibration.angle_quality_score,
      lastSwitch: Date.now()
    });

    // Initialize angle switcher
    if (videoRef.current && canvasRef.current) {
      await initializeAngleSwitcher();
    }

    // Update ball tracking
    if (ballTrackingManagerRef.current) {
      ballTrackingManagerRef.current.updateCalibration(bestCalibration);
      ballTrackingManagerRef.current.startTracking(bestCalibration);
    }

    // Notify parent component
    if (onCalibrationData) {
      onCalibrationData({
        wheelRadiusCm: estimateWheelRadiusCm(bestCalibration.wheel_radius_pixels, streamMetadata),
        calibrationId: bestCalibration.id,
        transformData: bestCalibration.perspective_data,
        qualityAssessment: { quality: bestCalibration.angle_quality_score },
        multiAngleMode: true,
        groupId: group.id
      });
    }
  };

  // Start new calibration
  const startNewCalibration = () => {
    setShowCalibrationManager(false);
    setShowCalibrationOverlay(true);
  };

  // Stop optical monitoring
  const stopOpticalMonitoring = () => {
    console.log('🛑 Stopping optical monitoring...');
    
    // Stop angle switcher
    if (angleSwitcherRef.current) {
      angleSwitcherRef.current.stop();
    }
    
    // Stop ball tracking
    if (ballTrackingManagerRef.current) {
      ballTrackingManagerRef.current.stopTracking();
    }
    
    if (stream) {
      stopScreenCapture(stream);
      setStream(null);
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCaptureState('idle');
    setStreamMetadata(null);
    setTrackingStatus({
      ballDetected: false,
      confidence: 0,
      wheelDetected: false,
      calibrated: false
    });
    setError(null);
    setMultiAngleMode(false);
    setCalibrationGroup(null);
    setCurrentAngleInfo({
      angle: 'unknown',
      angleName: 'Unknown',
      confidence: 0,
      quality: 0,
      lastSwitch: null
    });

    // Notify parent component
    onToggle(false);
  };

  // Toggle optical monitoring
  const handleToggle = () => {
    if (captureState === 'active') {
      stopOpticalMonitoring();
    } else if (captureState === 'idle') {
      startOpticalMonitoring();
      onToggle(true);
    }
  };

  // Render different states
  const renderControls = () => {
    switch (captureState) {
      case 'starting':
        return (
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
            <span className="text-blue-300">Starting screen capture...</span>
          </div>
        );

      case 'active':
        return (
          <div className="space-y-3">
            {/* Stream Info */}
            {streamMetadata && (
              <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-3">
                <div className="text-blue-200 text-sm font-medium mb-2">📺 Stream Active</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-100">
                  <div>Resolution: {streamMetadata.width}×{streamMetadata.height}</div>
                  <div>Frame Rate: {streamMetadata.frameRate}fps</div>
                </div>
              </div>
            )}

            {/* Multi-Angle Status */}
            {multiAngleMode && (
              <div className="bg-purple-500/20 border border-purple-500 rounded-lg p-3">
                <div className="text-purple-200 text-sm font-medium mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Multi-Angle Mode Active
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-purple-100">
                  <div>Current Angle: {currentAngleInfo.angleName}</div>
                  <div>Quality: {currentAngleInfo.quality}%</div>
                  <div>Total Switches: {switchingStats.totalSwitches}</div>
                  <div>Avg Interval: {switchingStats.averageInterval}s</div>
                </div>
                {currentAngleInfo.lastSwitch && (
                  <div className="text-purple-300 text-xs mt-1">
                    Last switch: {Math.round((Date.now() - currentAngleInfo.lastSwitch) / 1000)}s ago
                  </div>
                )}
              </div>
            )}

            {/* Tracking Status */}
            <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-3">
              <div className="text-gray-200 text-sm font-medium mb-2">🎯 Tracking Status</div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm">Wheel Detected:</span>
                  <span className={`text-sm font-medium ${trackingStatus.wheelDetected ? 'text-green-400' : 'text-red-400'}`}>
                    {trackingStatus.wheelDetected ? '✅ Yes' : '❌ No'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm">Ball Detected:</span>
                  <span className={`text-sm font-medium ${trackingStatus.ballDetected ? 'text-green-400' : 'text-yellow-400'}`}>
                    {trackingStatus.ballDetected ? '✅ Yes' : '⏳ Waiting'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm">Calibrated:</span>
                  <span className={`text-sm font-medium ${trackingStatus.calibrated ? 'text-green-400' : 'text-orange-400'}`}>
                    {trackingStatus.calibrated ? '✅ Yes' : '⚙️ Pending'}
                  </span>
                </div>
                {trackingStatus.confidence > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 text-sm">Confidence:</span>
                    <span className="text-blue-400 text-sm font-medium">{trackingStatus.confidence}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Calibration Quality Display */}
            {calibrationQuality && (
              <div className={`border rounded-lg p-3 ${
                calibrationQuality.quality >= 80 ? 'bg-green-500/20 border-green-500' :
                calibrationQuality.quality >= 60 ? 'bg-blue-500/20 border-blue-500' :
                calibrationQuality.quality >= 40 ? 'bg-yellow-500/20 border-yellow-500' :
                'bg-red-500/20 border-red-500'
              }`}>
                <div className="text-sm font-medium mb-2">
                  📊 Calibration Quality: {calibrationQuality.qualityLevel} ({calibrationQuality.quality}%)
                </div>
                {calibrationQuality.issues.length > 0 && (
                  <div className="text-xs space-y-1">
                    {calibrationQuality.issues.map((issue, index) => (
                      <div key={index} className="opacity-90">⚠️ {issue}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Current Calibration Info */}
            {currentCalibration && (
              <div className="bg-cyan-500/20 border border-cyan-500 rounded-lg p-3">
                <div className="text-cyan-200 text-sm font-medium mb-2">🎯 Active Calibration</div>
                <div className="text-cyan-100 text-xs space-y-1">
                  <div>🏢 {currentCalibration.casino_name || currentCalibration.casinoName}</div>
                  <div>🎯 {currentCalibration.table_name || currentCalibration.tableName}</div>
                  <div>📹 {currentCalibration.camera_angle || currentCalibration.cameraAngle}</div>
                  <div>📏 {currentCalibration.wheelRadiusCm?.toFixed(1) || 40}cm radius</div>
                  {multiAngleMode && (
                    <div>🔄 Mode: Multi-Angle ({currentAngleInfo.angle})</div>
                  )}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={stopOpticalMonitoring}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
              >
                <Square className="w-4 h-4" />
                Stop Tracking
              </button>
              
              <button
                onClick={() => setShowCalibrationManager(true)}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-all"
              >
                <Database className="w-4 h-4" />
                Calibrations
              </button>

              <button
                onClick={() => setShowMultiAngleManager(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-all"
              >
                <Zap className="w-4 h-4" />
                Multi-Angle
              </button>

              <button
                onClick={async () => {
                  try {
                    const { testDatabaseConnection } = await import('../utils/multiAngleDatabase');
                    const result = await testDatabaseConnection();
                    console.log('Database test result:', result);
                    
                    if (result.errors.length > 0) {
                      alert('Database errors found. Check console for details.');
                    } else {
                      alert('Database test passed! Check console for details.');
                    }
                  } catch (error) {
                    console.error('Test failed:', error);
                    alert('Test failed: ' + error.message);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-all"
              >
                🔍 Test Database
              </button>
              
              {!trackingStatus.calibrated && !multiAngleMode && (
                <button
                  onClick={() => setShowCalibrationOverlay(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all"
                >
                  <Target className="w-4 h-4" />
                  Calibrate Wheel
                </button>
              )}

              {multiAngleMode && (
                <button
                  onClick={() => {
                    setMultiAngleMode(false);
                    setCalibrationGroup(null);
                    if (angleSwitcherRef.current) {
                      angleSwitcherRef.current.stop();
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  Exit Multi-Angle
                </button>
              )}
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
              <AlertCircle className="w-5 h-5" />
              Optical Monitoring Error
            </div>
            <p className="text-red-300 text-sm mb-3">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setCaptureState('idle');
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-all"
            >
              Try Again
            </button>
          </div>
        );

      default:
        return (
          <button
            onClick={handleToggle}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all"
            disabled={!isScreenCaptureSupported()}
          >
            <Camera className="w-4 h-4" />
            Start Optical Monitoring
          </button>
        );
    }
  };

  return (
    <>
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-blue-500/30 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Optical Monitoring</h3>
          {multiAngleMode && (
            <div className="ml-2 px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded text-purple-300 text-xs">
              Multi-Angle
            </div>
          )}
          <div className={`ml-auto w-3 h-3 rounded-full ${
            captureState === 'active' ? 'bg-green-400 animate-pulse' : 
            captureState === 'starting' ? 'bg-yellow-400 animate-pulse' :
            captureState === 'error' ? 'bg-red-400' : 'bg-gray-400'
          }`}></div>
        </div>

        {!isScreenCaptureSupported() && (
          <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 mb-4">
            <div className="text-yellow-400 text-sm font-medium mb-1">⚠️ Browser Not Supported</div>
            <div className="text-yellow-300 text-sm">
              Please use Chrome, Firefox, or Edge for optical monitoring features.
            </div>
          </div>
        )}

        {renderControls()}

        {/* Hidden video element for processing */}
        <video
          ref={videoRef}
          style={{ display: 'none' }}
          autoPlay
          muted
          playsInline
        />

        {/* Hidden canvas for frame processing */}
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
      </div>

      {/* Calibration Overlay */}
      {showCalibrationOverlay && (
        <CalibrationOverlay
          videoRef={videoRef}
          isVisible={showCalibrationOverlay}
          onClose={() => setShowCalibrationOverlay(false)}
          onCalibrationComplete={handleCalibrationComplete}
        />
      )}

      {/* Calibration Manager */}
      {showCalibrationManager && (
        <CalibrationManager
          isOpen={showCalibrationManager}
          onClose={() => setShowCalibrationManager(false)}
          onLoadCalibration={handleLoadCalibration}
          onNewCalibration={startNewCalibration}
        />
      )}

      {/* Multi-Angle Calibration Manager */}
      {showMultiAngleManager && (
        <MultiAngleCalibrationManager
          videoRef={videoRef}
          canvasRef={canvasRef}
          isActive={captureState === 'active'}
          onCalibrationChange={handleMultiAngleCalibrationChange}
          casinoName="Test Casino" // You can make this dynamic
          tableName="Table 1" // You can make this dynamic
        />
      )}
    </>
  );
}