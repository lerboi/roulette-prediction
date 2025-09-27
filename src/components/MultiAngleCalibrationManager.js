// src/components/MultiAngleCalibrationManager.js
// Multi-angle calibration management component

'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Target, 
  Database, 
  Plus, 
  Eye, 
  Settings, 
  RotateCcw, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Star,
  X,
  Play,
  Pause
} from 'lucide-react';
import { AngleDetectionEngine } from '../utils/angleDetection';
import { 
  getOrCreateCalibrationGroup,
  saveMultiAngleCalibration,
  getGroupCalibrations,
  findBestCalibrationForAngle,
  logAngleDetection,
  getUserCalibrationGroups
} from '../utils/multiAngleDatabase';
import CalibrationOverlay from './CalibrationOverlay';

const ANGLE_DEFINITIONS = {
  'overhead': { name: 'Overhead View', icon: '⬇️', minQuality: 90, description: 'Direct overhead shot' },
  'side45': { name: 'Side View 45°', icon: '↗️', minQuality: 80, description: 'Angled side view' },
  'closeup': { name: 'Close-up View', icon: '🔍', minQuality: 70, description: 'Zoomed in view' },
  'wideshot': { name: 'Wide Shot', icon: '📐', minQuality: 60, description: 'Wide angle view' },
  'extreme_side': { name: 'Extreme Side', icon: '↔️', minQuality: 30, description: 'Heavy side angle' },
  'unknown': { name: 'Unknown', icon: '❓', minQuality: 0, description: 'Unclassified angle' }
};

export default function MultiAngleCalibrationManager({ 
  videoRef, 
  canvasRef, 
  isActive, 
  onCalibrationChange,
  casinoName = '',
  tableName = ''
}) {
  // State management
  const [isOpen, setIsOpen] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('detection'); // detection, calibration, complete
  const [detectedAngles, setDetectedAngles] = useState(new Map());
  const [calibrationGroup, setCalibrationGroup] = useState(null);
  const [existingCalibrations, setExistingCalibrations] = useState([]);
  const [currentCalibrationAngle, setCurrentCalibrationAngle] = useState(null);
  const [showCalibrationOverlay, setShowCalibrationOverlay] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [sessionId] = useState(() => 'session_' + Date.now());

  // Refs
  const angleDetectionEngineRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const detectionStartTimeRef = useRef(null);

  // Detection settings
  const DETECTION_DURATION = 60; // seconds
  const DETECTION_INTERVAL = 500; // ms between detections

  // Initialize angle detection engine
  useEffect(() => {
    if (isActive && !angleDetectionEngineRef.current) {
      angleDetectionEngineRef.current = new AngleDetectionEngine();
      
      // Set up angle change callback
      angleDetectionEngineRef.current.onAngleChange((angleChange) => {
        console.log('📐 Angle changed:', angleChange);
        handleAngleDetected(angleChange.newAngle, angleChange.confidence);
      });
    }

    return () => {
      if (angleDetectionEngineRef.current) {
        angleDetectionEngineRef.current.reset();
      }
    };
  }, [isActive]);

  // Load existing calibration data when component opens
  useEffect(() => {
    if (isOpen && casinoName && tableName) {
      loadExistingCalibrations();
    }
  }, [isOpen, casinoName, tableName]);

  /**
   * Load existing calibrations for this casino/table
   */
  const loadExistingCalibrations = async () => {
    try {
      const groupResult = await getOrCreateCalibrationGroup(casinoName, tableName);
      if (groupResult.success) {
        setCalibrationGroup(groupResult.group);
        
        const calibrations = await getGroupCalibrations(groupResult.group.id);
        setExistingCalibrations(calibrations);
        
        console.log(`📋 Loaded ${calibrations.length} existing calibrations for ${casinoName} - ${tableName}`);
        
        // If we have calibrations, skip detection phase
        if (calibrations.length > 0) {
          setCurrentPhase('complete');
        }
      }
    } catch (error) {
      console.error('Error loading existing calibrations:', error);
    }
  };

  /**
   * Start the angle detection process
   */
  const startAngleDetection = async () => {
    if (!videoRef?.current || !canvasRef?.current || !angleDetectionEngineRef.current) {
      alert('Video stream not ready. Please ensure optical monitoring is active.');
      return;
    }

    setIsDetecting(true);
    setDetectedAngles(new Map());
    setDetectionProgress(0);
    detectionStartTimeRef.current = Date.now();

    console.log('🔍 Starting angle detection for 60 seconds...');

    detectionIntervalRef.current = setInterval(() => {
      performAngleDetection();
      updateDetectionProgress();
    }, DETECTION_INTERVAL);

    // Stop after detection duration
    setTimeout(() => {
      stopAngleDetection();
    }, DETECTION_DURATION * 1000);
  };

  /**
   * Perform a single angle detection
   */
  const performAngleDetection = () => {
    if (!videoRef?.current || !canvasRef?.current || !angleDetectionEngineRef.current) {
      return;
    }

    try {
      // Capture current frame
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Detect angle
      const result = angleDetectionEngineRef.current.detectAngle(imageData);
      
      if (result.confidence > 0.5) {
        handleAngleDetected(result.angleId, result.confidence, result.qualityScore);
        
        // Log detection event
        if (calibrationGroup) {
          logAngleDetection(
            calibrationGroup.id,
            result.angleId,
            result.confidence,
            result.qualityScore,
            sessionId,
            result.previousAngle,
            null,
            { wheelGeometry: result.wheelGeometry, perspectiveData: result.perspectiveData }
          );
        }
      }
    } catch (error) {
      console.error('Error during angle detection:', error);
    }
  };

  /**
   * Handle a detected angle
   */
  const handleAngleDetected = (angleId, confidence, qualityScore = null) => {
    setDetectedAngles(prev => {
      const updated = new Map(prev);
      const existing = updated.get(angleId) || { count: 0, totalConfidence: 0, bestQuality: 0 };
      
      updated.set(angleId, {
        count: existing.count + 1,
        totalConfidence: existing.totalConfidence + confidence,
        avgConfidence: (existing.totalConfidence + confidence) / (existing.count + 1),
        bestQuality: qualityScore ? Math.max(existing.bestQuality, qualityScore) : existing.bestQuality,
        lastSeen: Date.now()
      });
      
      return updated;
    });
  };

  /**
   * Update detection progress
   */
  const updateDetectionProgress = () => {
    const elapsed = Date.now() - detectionStartTimeRef.current;
    const progress = Math.min(100, (elapsed / (DETECTION_DURATION * 1000)) * 100);
    setDetectionProgress(progress);
  };

  /**
   * Stop angle detection
   */
  const stopAngleDetection = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    
    setIsDetecting(false);
    setDetectionProgress(100);
    
    // Move to calibration phase if angles were detected
    if (detectedAngles.size > 0) {
      setCurrentPhase('calibration');
      console.log(`✅ Detection complete. Found ${detectedAngles.size} unique angles`);
    } else {
      console.log('❌ No angles detected during scanning period');
    }
  };

  /**
   * Start calibrating a specific angle
   */
  const startAngleCalibration = (angleId) => {
    setCurrentCalibrationAngle(angleId);
    setShowCalibrationOverlay(true);
    console.log(`🎯 Starting calibration for angle: ${angleId}`);
  };

  /**
   * Handle completed calibration
   */
  const handleCalibrationComplete = async (calibrationData) => {
    if (!currentCalibrationAngle || !calibrationGroup) {
      console.error('No current angle or group for calibration');
      return;
    }

    try {
      const angleData = detectedAngles.get(currentCalibrationAngle);
      const qualityScore = angleData?.bestQuality || 70;
      
      // Enhance calibration data with angle information
      const enhancedData = {
        ...calibrationData,
        angleIdentifier: currentCalibrationAngle,
        angleName: ANGLE_DEFINITIONS[currentCalibrationAngle]?.name || currentCalibrationAngle
      };

      // Save to database
      const result = await saveMultiAngleCalibration(
        calibrationGroup.id,
        enhancedData,
        currentCalibrationAngle,
        qualityScore,
        existingCalibrations.length === 0 // First calibration is preferred
      );

      if (result.success) {
        console.log(`✅ Calibration saved for angle: ${currentCalibrationAngle}`);
        
        // Reload calibrations
        await loadExistingCalibrations();
        
        // Close overlay
        setShowCalibrationOverlay(false);
        setCurrentCalibrationAngle(null);
        
        // Check if we're done
        const totalCalibratedAngles = existingCalibrations.length + 1;
        if (totalCalibratedAngles >= detectedAngles.size || totalCalibratedAngles >= 3) {
          setCurrentPhase('complete');
        }
      } else {
        alert('Failed to save calibration: ' + result.error);
      }
    } catch (error) {
      console.error('Error saving calibration:', error);
      alert('Error saving calibration: ' + error.message);
    }
  };

  /**
   * Get quality color for angle
   */
  const getQualityColor = (qualityScore) => {
    if (qualityScore >= 90) return 'text-green-400 bg-green-500/20 border-green-500';
    if (qualityScore >= 75) return 'text-blue-400 bg-blue-500/20 border-blue-500';
    if (qualityScore >= 60) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500';
    return 'text-red-400 bg-red-500/20 border-red-500';
  };

  /**
   * Get recommendations for angles to calibrate
   */
  const getAngleRecommendations = () => {
    const angles = Array.from(detectedAngles.entries())
      .map(([angleId, data]) => ({
        angleId,
        ...data,
        definition: ANGLE_DEFINITIONS[angleId],
        isCalibrated: existingCalibrations.some(cal => cal.angle_identifier === angleId),
        shouldCalibrate: data.bestQuality >= (ANGLE_DEFINITIONS[angleId]?.minQuality || 50)
      }))
      .sort((a, b) => b.bestQuality - a.bestQuality);

    return angles;
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-all"
      >
        <Target className="w-4 h-4" />
        Multi-Angle Setup
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-hidden">
          
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-gray-700">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Target className="w-6 h-6 text-purple-400" />
                Multi-Angle Calibration Setup
              </h2>
              <p className="text-gray-400 text-sm">
                {casinoName && tableName ? `${casinoName} - ${tableName}` : 'Configure calibrations for multiple camera angles'}
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            
            {/* Phase: Angle Detection */}
            {currentPhase === 'detection' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    🔍 Step 1: Detect Camera Angles
                  </h3>
                  <p className="text-gray-300 text-sm mb-6">
                    Watch the video stream for 60 seconds to identify all camera angles used by this table.
                  </p>
                </div>

                {!isDetecting ? (
                  <div className="text-center">
                    <button
                      onClick={startAngleDetection}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg mx-auto transition-all"
                    >
                      <Eye className="w-5 h-5" />
                      Start Angle Detection
                    </button>
                    <p className="text-gray-400 text-xs mt-2">
                      Make sure optical monitoring is active and video stream is visible
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-blue-200 font-medium">🔍 Detecting angles...</span>
                        <span className="text-blue-400 text-sm">{detectionProgress.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${detectionProgress}%` }}
                        ></div>
                      </div>
                    </div>

                    {detectedAngles.size > 0 && (
                      <div className="bg-gray-800/50 rounded-lg p-4">
                        <h4 className="text-white font-medium mb-3">Detected Angles ({detectedAngles.size})</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {Array.from(detectedAngles.entries()).map(([angleId, data]) => (
                            <div key={angleId} className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg">{ANGLE_DEFINITIONS[angleId]?.icon || '📷'}</span>
                                <span className="text-white text-sm font-medium">
                                  {ANGLE_DEFINITIONS[angleId]?.name || angleId}
                                </span>
                              </div>
                              <div className="text-gray-300 text-xs">
                                Seen: {data.count}x | Conf: {(data.avgConfidence * 100).toFixed(0)}%
                              </div>
                              {data.bestQuality > 0 && (
                                <div className={`text-xs mt-1 px-2 py-1 rounded border ${getQualityColor(data.bestQuality)}`}>
                                  Quality: {data.bestQuality}%
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-center">
                      <button
                        onClick={stopAngleDetection}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg mx-auto transition-all"
                      >
                        <Pause className="w-4 h-4" />
                        Stop Early
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Phase: Calibration */}
            {currentPhase === 'calibration' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    🎯 Step 2: Calibrate Each Angle
                  </h3>
                  <p className="text-gray-300 text-sm mb-6">
                    Calibrate the wheel for each detected camera angle. Focus on high-quality angles first.
                  </p>
                </div>

                <div className="grid gap-4">
                  {getAngleRecommendations().map((angle) => (
                    <div 
                      key={angle.angleId} 
                      className={`border rounded-lg p-4 ${
                        angle.isCalibrated ? 'bg-green-500/10 border-green-500' : 
                        angle.shouldCalibrate ? 'bg-blue-500/10 border-blue-500' :
                        'bg-gray-500/10 border-gray-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{angle.definition?.icon || '📷'}</span>
                          <div>
                            <h4 className="text-white font-medium">
                              {angle.definition?.name || angle.angleId}
                            </h4>
                            <p className="text-gray-400 text-sm">
                              {angle.definition?.description || 'Camera angle'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm text-gray-300">
                              Quality: <span className={`font-medium ${
                                angle.bestQuality >= 90 ? 'text-green-400' :
                                angle.bestQuality >= 75 ? 'text-blue-400' :
                                angle.bestQuality >= 60 ? 'text-yellow-400' : 'text-red-400'
                              }`}>{angle.bestQuality}%</span>
                            </div>
                            <div className="text-xs text-gray-400">
                              Detected {angle.count}x
                            </div>
                          </div>
                          
                          {angle.isCalibrated ? (
                            <div className="flex items-center gap-2 text-green-400">
                              <CheckCircle className="w-5 h-5" />
                              <span className="text-sm">Calibrated</span>
                            </div>
                          ) : angle.shouldCalibrate ? (
                            <button
                              onClick={() => startAngleCalibration(angle.angleId)}
                              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all"
                            >
                              <Target className="w-4 h-4" />
                              Calibrate
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 text-yellow-400">
                              <AlertCircle className="w-5 h-5" />
                              <span className="text-sm">Low Quality</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Recommendation badge */}
                      {angle.shouldCalibrate && !angle.isCalibrated && (
                        <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-blue-300 text-xs">
                          <Star className="w-3 h-3" />
                          Recommended for calibration
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="text-center">
                  <button
                    onClick={() => setCurrentPhase('complete')}
                    className="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg mx-auto transition-all"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Finish Setup
                  </button>
                </div>
              </div>
            )}

            {/* Phase: Complete */}
            {currentPhase === 'complete' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    ✅ Multi-Angle Setup Complete
                  </h3>
                  <p className="text-gray-300 text-sm mb-6">
                    Your multi-angle calibration is ready. The system will automatically switch between calibrations as camera angles change.
                  </p>
                </div>

                {/* Calibration Summary */}
                <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
                  <h4 className="text-green-200 font-medium mb-3 flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Calibration Summary
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-400">{existingCalibrations.length}</div>
                      <div className="text-green-200 text-sm">Total Angles</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-400">
                        {existingCalibrations.filter(cal => cal.angle_quality_score >= 80).length}
                      </div>
                      <div className="text-blue-200 text-sm">High Quality</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-400">
                        {existingCalibrations.filter(cal => cal.is_preferred_angle).length}
                      </div>
                      <div className="text-purple-200 text-sm">Preferred</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-400">
                        {Math.round(existingCalibrations.reduce((sum, cal) => sum + cal.angle_quality_score, 0) / existingCalibrations.length || 0)}%
                      </div>
                      <div className="text-yellow-200 text-sm">Avg Quality</div>
                    </div>
                  </div>
                </div>

                {/* Existing Calibrations List */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="text-white font-medium mb-3">Configured Angles</h4>
                  <div className="space-y-3">
                    {existingCalibrations.map((calibration) => (
                      <div key={calibration.id} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg border border-gray-600">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">
                            {ANGLE_DEFINITIONS[calibration.angle_identifier]?.icon || '📷'}
                          </span>
                          <div>
                            <div className="text-white font-medium">
                              {ANGLE_DEFINITIONS[calibration.angle_identifier]?.name || calibration.angle_identifier}
                            </div>
                            <div className="text-gray-400 text-sm">
                              {calibration.calibration_name || 'Multi-angle calibration'}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {calibration.is_preferred_angle && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded text-yellow-300 text-xs">
                              <Star className="w-3 h-3" />
                              Preferred
                            </div>
                          )}
                          <div className={`px-2 py-1 rounded border text-xs ${getQualityColor(calibration.angle_quality_score)}`}>
                            {calibration.angle_quality_score}%
                          </div>
                          <div className="text-gray-400 text-xs">
                            {new Date(calibration.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setCurrentPhase('detection')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Add More Angles
                  </button>
                  
                  <button
                    onClick={() => {
                      if (onCalibrationChange && existingCalibrations.length > 0) {
                        const bestCalibration = existingCalibrations
                          .sort((a, b) => b.angle_quality_score - a.angle_quality_score)[0];
                        onCalibrationChange(bestCalibration, calibrationGroup);
                      }
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Use Multi-Angle Setup
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calibration Overlay */}
      {showCalibrationOverlay && currentCalibrationAngle && (
        <CalibrationOverlay
          videoRef={videoRef}
          isVisible={showCalibrationOverlay}
          onClose={() => {
            setShowCalibrationOverlay(false);
            setCurrentCalibrationAngle(null);
          }}
          onCalibrationComplete={handleCalibrationComplete}
        />
      )}
    </>
  );
}