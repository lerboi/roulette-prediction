'use client';

import { useState } from 'react';
import { Settings, X, Save } from 'lucide-react';

export default function SettingsPanel({ settings, onSettingsChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);

  const handleSave = () => {
    onSettingsChange(tempSettings);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setTempSettings(settings);
    setIsOpen(false);
  };

  return (
    <>
      {/* Settings Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 p-3 bg-gray-800 hover:bg-gray-700 text-white rounded-full shadow-lg transition-all"
      >
        <Settings className="w-6 h-6" />
      </button>

      {/* Settings Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md">
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">Physics Settings</h2>
              <button
                onClick={handleCancel}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Settings Form */}
            <div className="p-6 space-y-6">
              
              {/* Wheel Speed */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Wheel Speed (RPM)
                </label>
                <input
                  type="number"
                  value={tempSettings.wheelSpeed || 30}
                  onChange={(e) => setTempSettings(prev => ({
                    ...prev,
                    wheelSpeed: parseFloat(e.target.value) || 30
                  }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-green-500 focus:outline-none"
                  min="10"
                  max="60"
                  step="0.1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Typical range: 20-40 RPM. Measure by timing wheel rotations.
                </p>
              </div>

              {/* Total Time */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Total Spin Time (seconds)
                </label>
                <input
                  type="number"
                  value={tempSettings.totalTime || 3}
                  onChange={(e) => setTempSettings(prev => ({
                    ...prev,
                    totalTime: parseFloat(e.target.value) || 3
                  }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-green-500 focus:outline-none"
                  min="3"
                  max="15"
                  step="0.5"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Time from ball release to bet closure.
                </p>
              </div>

              {/* Wheel Radius */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Wheel Radius (cm)
                </label>
                <input
                  type="number"
                  value={tempSettings.wheelRadius || 40} // Fallback to 40 if undefined/NaN
                  onChange={(e) => setTempSettings(prev => ({
                    ...prev,
                    wheelRadius: parseFloat(e.target.value) || 40 // Fallback to 40 if NaN
                  }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-green-500 focus:outline-none"
                  min="35"
                  max="45"
                  step="0.5"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Cammegh Mercury 360: 40cm radius. Standard casino wheels: 37-42cm.
                </p>
              </div>

              {/* Ball Drop Threshold */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Ball Drop Speed Threshold (rev/sec)
                </label>
                <input
                  type="number"
                  value={tempSettings.dropThreshold || 0.5}
                  onChange={(e) => setTempSettings(prev => ({
                    ...prev,
                    dropThreshold: parseFloat(e.target.value) || 0.5
                  }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-green-500 focus:outline-none"
                  min="0.1"
                  max="2"
                  step="0.1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Speed at which ball typically drops into pockets.
                </p>
              </div>

            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-gray-700">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}