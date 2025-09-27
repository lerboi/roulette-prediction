// src/components/CalibrationOverlay.js
// Fixed version with proper video display

'use client';

import { useState, useRef, useEffect } from 'react';
import { Target, Save, RotateCcw, X, CheckCircle } from 'lucide-react';

const CALIBRATION_STEPS = [
  { id: 'top', name: 'Top (12 o\'clock)', icon: '🔺', description: 'Click the top edge of the wheel' },
  { id: 'right', name: 'Right (3 o\'clock)', icon: '▶️', description: 'Click the right edge of the wheel' },
  { id: 'bottom', name: 'Bottom (6 o\'clock)', icon: '🔻', description: 'Click the bottom edge of the wheel' },
  { id: 'left', name: 'Left (9 o\'clock)', icon: '◀️', description: 'Click the left edge of the wheel' }
];

export default function CalibrationOverlay({ 
  videoRef, 
  isVisible, 
  onClose, 
  onCalibrationComplete,
  existingCalibration = null 
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [calibrationName, setCalibrationName] = useState({
    casinoName: '',
    tableName: '',
    cameraAngle: '',
    customName: ''
  });
  
  const overlayRef = useRef(null);
  const displayVideoRef = useRef(null);
  const [videoElement, setVideoElement] = useState(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

  // Initialize video display when overlay opens
  useEffect(() => {
    if (isVisible && videoRef?.current && videoRef.current.srcObject) {
      // Clone the video stream for display
      const stream = videoRef.current.srcObject;
      
      if (displayVideoRef.current) {
        displayVideoRef.current.srcObject = stream;
        displayVideoRef.current.play().catch(console.error);
        
        displayVideoRef.current.onloadedmetadata = () => {
          setVideoDimensions({
            width: displayVideoRef.current.videoWidth,
            height: displayVideoRef.current.videoHeight
          });
        };
        
        setVideoElement(displayVideoRef.current);
      }
    }
  }, [isVisible, videoRef]);

  // Load existing calibration if provided
  useEffect(() => {
    if (existingCalibration && existingCalibration.calibration_points) {
      setCalibrationPoints(existingCalibration.calibration_points);
      setCurrentStep(4); // Skip to complete state
      setCalibrationName({
        casinoName: existingCalibration.casino_name || '',
        tableName: existingCalibration.table_name || '',
        cameraAngle: existingCalibration.camera_angle || '',
        customName: existingCalibration.calibration_name || ''
      });
    }
  }, [existingCalibration]);

  // Handle click on video overlay
  const handleOverlayClick = (event) => {
    if (currentStep >= 4 || !videoElement) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Calculate video display dimensions
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    
    // Calculate video aspect ratio and actual display size
    const videoAspectRatio = videoDimensions.width / videoDimensions.height;
    const containerAspectRatio = containerWidth / containerHeight;
    
    let videoDisplayWidth, videoDisplayHeight, videoOffsetX, videoOffsetY;
    
    if (videoAspectRatio > containerAspectRatio) {
      // Video is wider than container
      videoDisplayWidth = containerWidth;
      videoDisplayHeight = containerWidth / videoAspectRatio;
      videoOffsetX = 0;
      videoOffsetY = (containerHeight - videoDisplayHeight) / 2;
    } else {
      // Video is taller than container
      videoDisplayHeight = containerHeight;
      videoDisplayWidth = containerHeight * videoAspectRatio;
      videoOffsetX = (containerWidth - videoDisplayWidth) / 2;
      videoOffsetY = 0;
    }
    
    // Check if click is within video bounds
    if (x < videoOffsetX || x > videoOffsetX + videoDisplayWidth ||
        y < videoOffsetY || y > videoOffsetY + videoDisplayHeight) {
      return; // Click outside video area
    }
    
    // Convert to video coordinates
    const videoX = ((x - videoOffsetX) / videoDisplayWidth) * videoDimensions.width;
    const videoY = ((y - videoOffsetY) / videoDisplayHeight) * videoDimensions.height;

    const newPoint = {
      id: CALIBRATION_STEPS[currentStep].id,
      x: videoX,
      y: videoY,
      screenX: x,
      screenY: y,
      step: currentStep,
      displayX: x,
      displayY: y
    };

    setCalibrationPoints(prev => [...prev, newPoint]);
    setCurrentStep(prev => prev + 1);

    console.log(`📍 Calibration point ${currentStep + 1}/4:`, {
      step: CALIBRATION_STEPS[currentStep].id,
      videoCoords: { x: videoX.toFixed(1), y: videoY.toFixed(1) },
      displayCoords: { x: x.toFixed(1), y: y.toFixed(1) }
    });
  };

  // Reset calibration
  const resetCalibration = () => {
    setCalibrationPoints([]);
    setCurrentStep(0);
    setShowNamingModal(false);
  };

  // Calculate wheel center and radius from 4 points
  const calculateWheelGeometry = () => {
    if (calibrationPoints.length !== 4) return null;

    const [top, right, bottom, left] = calibrationPoints;
    
    // Calculate center point
    const centerX = (left.x + right.x) / 2;
    const centerY = (top.y + bottom.y) / 2;
    
    // Calculate radius (average of horizontal and vertical radii)
    const horizontalRadius = Math.abs(right.x - left.x) / 2;
    const verticalRadius = Math.abs(bottom.y - top.y) / 2;
    const averageRadius = (horizontalRadius + verticalRadius) / 2;
    
    // Detect if wheel appears elliptical (perspective distortion)
    const aspectRatio = horizontalRadius / verticalRadius;
    const isPerspectiveDistorted = Math.abs(aspectRatio - 1) > 0.1;
    
    console.log('🎯 Wheel geometry calculated:', {
      center: { x: centerX, y: centerY },
      horizontalRadius,
      verticalRadius,
      averageRadius,
      aspectRatio,
      isPerspectiveDistorted
    });

    return {
      center: { x: centerX, y: centerY },
      radius: averageRadius,
      horizontalRadius,
      verticalRadius,
      aspectRatio,
      isPerspectiveDistorted
    };
  };

  // Proceed to naming modal
  const proceedToNaming = () => {
    const geometry = calculateWheelGeometry();
    if (geometry) {
      setShowNamingModal(true);
    }
  };

  // Save calibration
  const saveCalibration = async () => {
    const geometry = calculateWheelGeometry();
    if (!geometry) return;

    // Create calibration data
    const calibrationData = {
      casinoName: calibrationName.casinoName,
      tableName: calibrationName.tableName,
      cameraAngle: calibrationName.cameraAngle,
      calibrationName: calibrationName.customName,
      calibrationPoints: calibrationPoints,
      wheelGeometry: geometry,
      wheelRadiusPixels: geometry.radius,
      wheelRadiusCm: 40, // Default - will be refined later
      transformationMatrix: null, // Will be calculated in perspective transform utils
      timestamp: new Date().toISOString()
    };

    console.log('💾 Saving calibration:', calibrationData);
    
    // Pass to parent component
    onCalibrationComplete(calibrationData);
    
    // Close overlay
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col">
      
      {/* Header */}
      <div className="bg-black/80 backdrop-blur-sm border-b border-gray-600 p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-bold text-white">🎯 Wheel Calibration</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {currentStep < 4 ? (
          <div className="space-y-2">
            <div className="text-green-400 font-medium">
              Step {currentStep + 1}/4: {CALIBRATION_STEPS[currentStep].name}
            </div>
            <div className="text-gray-300 text-sm">
              {CALIBRATION_STEPS[currentStep].description}
            </div>
            <div className="flex items-center gap-2 mt-3">
              {CALIBRATION_STEPS.map((step, index) => (
                <div
                  key={step.id}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index < currentStep
                      ? 'bg-green-500 text-white'
                      : index === currentStep
                      ? 'bg-blue-500 text-white animate-pulse'
                      : 'bg-gray-600 text-gray-400'
                  }`}
                >
                  {index < currentStep ? '✓' : index + 1}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-green-400 font-medium flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Calibration Complete!
            </div>
            <div className="text-gray-300 text-sm">
              All 4 points marked. Ready to save calibration.
            </div>
          </div>
        )}
      </div>

      {/* Video Display Area */}
      <div className="flex-1 relative overflow-hidden">
        <div 
          ref={overlayRef}
          className="w-full h-full relative cursor-crosshair bg-gray-900 flex items-center justify-center"
          onClick={handleOverlayClick}
        >
          {/* Video Element */}
          <video
            ref={displayVideoRef}
            className="max-w-full max-h-full object-contain"
            autoPlay
            muted
            playsInline
          />
          
          {/* Calibration points overlay */}
          {calibrationPoints.map((point, index) => (
            <div
              key={point.id}
              className="absolute w-4 h-4 bg-green-500 border-2 border-white rounded-full transform -translate-x-2 -translate-y-2 shadow-lg z-10"
              style={{
                left: point.displayX + 'px',
                top: point.displayY + 'px'
              }}
            >
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                {CALIBRATION_STEPS[index].icon} {CALIBRATION_STEPS[index].name}
              </div>
            </div>
          ))}
          
          {/* Instructions overlay */}
          {currentStep < 4 && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-bold mb-1">
                  {CALIBRATION_STEPS[currentStep].icon} Click {CALIBRATION_STEPS[currentStep].name}
                </div>
                <div className="text-sm opacity-80">
                  {CALIBRATION_STEPS[currentStep].description}
                </div>
              </div>
            </div>
          )}
          
          {/* No video warning */}
          {!videoElement && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <div className="text-center text-white">
                <div className="text-xl mb-2">📹 No Video Stream</div>
                <div className="text-sm opacity-80">Make sure optical monitoring is active</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="bg-black/80 backdrop-blur-sm border-t border-gray-600 p-4">
        <div className="flex justify-between items-center">
          <button
            onClick={resetCalibration}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          
          {currentStep >= 4 && (
            <button
              onClick={proceedToNaming}
              className="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all"
            >
              <Target className="w-4 h-4" />
              Save Calibration
            </button>
          )}
        </div>
      </div>

      {/* Naming Modal */}
      {showNamingModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-60">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-4">Save Calibration</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Casino Name
                  </label>
                  <input
                    type="text"
                    value={calibrationName.casinoName}
                    onChange={(e) => setCalibrationName(prev => ({ ...prev, casinoName: e.target.value }))}
                    placeholder="e.g., Bet365, Evolution Gaming"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Table Name
                  </label>
                  <input
                    type="text"
                    value={calibrationName.tableName}
                    onChange={(e) => setCalibrationName(prev => ({ ...prev, tableName: e.target.value }))}
                    placeholder="e.g., Table 1, VIP Table A"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Camera Angle
                  </label>
                  <input
                    type="text"
                    value={calibrationName.cameraAngle}
                    onChange={(e) => setCalibrationName(prev => ({ ...prev, cameraAngle: e.target.value }))}
                    placeholder="e.g., Side View 45°, Overhead, Angled Left"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Custom Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={calibrationName.customName}
                    onChange={(e) => setCalibrationName(prev => ({ ...prev, customName: e.target.value }))}
                    placeholder="e.g., Evening Session, High Stakes Table"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowNamingModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCalibration}
                  disabled={!calibrationName.casinoName || !calibrationName.tableName}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}