// src/components/CalibrationManager.js
// Component for loading and managing saved calibrations

'use client';

import { useState, useEffect } from 'react';
import { Database, Plus, Trash2, Edit, Download, Search, X } from 'lucide-react';
import { 
  getUserCalibrations, 
  deleteWheelCalibration, 
  saveWheelCalibration,
  getCalibrationStats 
} from '../utils/opticalDatabase';

export default function CalibrationManager({ 
  isOpen, 
  onClose, 
  onLoadCalibration, 
  onNewCalibration 
}) {
  const [calibrations, setCalibrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCalibration, setSelectedCalibration] = useState(null);
  const [stats, setStats] = useState({ totalCalibrations: 0, casinos: [], tables: [] });

  // Load calibrations when component opens
  useEffect(() => {
    if (isOpen) {
      loadCalibrations();
      loadStats();
    }
  }, [isOpen]);

  const loadCalibrations = async () => {
    setLoading(true);
    try {
      const data = await getUserCalibrations();
      setCalibrations(data);
      console.log(`📊 Loaded ${data.length} calibrations`);
    } catch (error) {
      console.error('Error loading calibrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await getCalibrationStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleDeleteCalibration = async (calibrationId) => {
    if (!window.confirm('Are you sure you want to delete this calibration?')) {
      return;
    }

    const success = await deleteWheelCalibration(calibrationId);
    if (success) {
      await loadCalibrations(); // Refresh list
      await loadStats(); // Refresh stats
      if (selectedCalibration?.id === calibrationId) {
        setSelectedCalibration(null);
      }
    } else {
      alert('Failed to delete calibration');
    }
  };

  const handleLoadCalibration = (calibration) => {
    console.log('📥 Loading calibration:', calibration.calibration_name);
    onLoadCalibration(calibration);
    onClose();
  };

  const handleSaveAsNew = async (calibration) => {
    const newName = prompt('Enter new name for this calibration:', calibration.calibration_name + ' (Copy)');
    if (!newName) return;

    const calibrationData = {
      casinoName: calibration.casino_name,
      tableName: calibration.table_name,
      cameraAngle: calibration.camera_angle,
      calibrationName: newName,
      calibrationPoints: calibration.calibration_points,
      transformationMatrix: calibration.transformation_matrix,
      wheelRadiusPixels: calibration.wheel_radius_pixels
    };

    const result = await saveWheelCalibration(calibrationData);
    if (result.success) {
      await loadCalibrations();
      await loadStats();
    } else {
      alert('Failed to save calibration copy');
    }
  };

  // Filter calibrations based on search term
  const filteredCalibrations = calibrations.filter(cal => 
    cal.casino_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cal.table_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cal.camera_angle.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cal.calibration_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-6xl max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-blue-400" />
            <div>
              <h2 className="text-xl font-bold text-white">Calibration Manager</h2>
              <p className="text-gray-400 text-sm">{stats.totalCalibrations} saved calibrations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex h-[70vh]">
          
          {/* Left Panel - Calibration List */}
          <div className="w-1/2 border-r border-gray-700 flex flex-col">
            
            {/* Search and Controls */}
            <div className="p-4 border-b border-gray-700">
              <div className="flex gap-3 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search calibrations..."
                    className="w-full pl-10 pr-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none text-sm"
                  />
                </div>
                <button
                  onClick={onNewCalibration}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all text-sm"
                >
                  <Plus className="w-4 h-4" />
                  New
                </button>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-blue-500/20 border border-blue-500/30 rounded p-2 text-center">
                  <div className="text-blue-300 font-medium">{stats.totalCalibrations}</div>
                  <div className="text-blue-400">Total</div>
                </div>
                <div className="bg-green-500/20 border border-green-500/30 rounded p-2 text-center">
                  <div className="text-green-300 font-medium">{stats.casinos.length}</div>
                  <div className="text-green-400">Casinos</div>
                </div>
                <div className="bg-purple-500/20 border border-purple-500/30 rounded p-2 text-center">
                  <div className="text-purple-300 font-medium">{stats.tables.length}</div>
                  <div className="text-purple-400">Tables</div>
                </div>
              </div>
            </div>

            {/* Calibration List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3"></div>
                  <div className="text-gray-400">Loading calibrations...</div>
                </div>
              ) : filteredCalibrations.length === 0 ? (
                <div className="p-8 text-center">
                  <Database className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <div className="text-gray-400 mb-2">
                    {searchTerm ? 'No matching calibrations found' : 'No calibrations saved yet'}
                  </div>
                  <button
                    onClick={onNewCalibration}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Create your first calibration
                  </button>
                </div>
              ) : (
                <div className="space-y-2 p-4">
                  {filteredCalibrations.map((calibration) => (
                    <div
                      key={calibration.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedCalibration?.id === calibration.id
                          ? 'bg-blue-500/20 border-blue-500'
                          : 'bg-gray-800/50 border-gray-600 hover:bg-gray-800'
                      }`}
                      onClick={() => setSelectedCalibration(calibration)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-white text-sm">
                          {calibration.calibration_name || 'Unnamed Calibration'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(calibration.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-300 space-y-1">
                        <div>🏢 {calibration.casino_name}</div>
                        <div>🎯 {calibration.table_name}</div>
                        <div>📹 {calibration.camera_angle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Calibration Details */}
          <div className="w-1/2 flex flex-col">
            {selectedCalibration ? (
              <>
                {/* Calibration Info */}
                <div className="p-6 border-b border-gray-700">
                  <h3 className="text-lg font-bold text-white mb-4">
                    {selectedCalibration.calibration_name || 'Unnamed Calibration'}
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400 mb-1">Casino</div>
                      <div className="text-white">{selectedCalibration.casino_name}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Table</div>
                      <div className="text-white">{selectedCalibration.table_name}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Camera Angle</div>
                      <div className="text-white">{selectedCalibration.camera_angle}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Wheel Radius</div>
                      <div className="text-white">{selectedCalibration.wheel_radius_pixels?.toFixed(1)} px</div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Created</div>
                      <div className="text-white">{new Date(selectedCalibration.created_at).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Last Updated</div>
                      <div className="text-white">{new Date(selectedCalibration.updated_at).toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* Calibration Points Visualization */}
                <div className="flex-1 p-6">
                  <h4 className="text-white font-medium mb-3">Calibration Points</h4>
                  
                  {selectedCalibration.calibration_points && (
                    <div className="space-y-3">
                      {selectedCalibration.calibration_points.map((point, index) => (
                        <div key={point.id} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <div className="text-white font-medium">{point.id.charAt(0).toUpperCase() + point.id.slice(1)} Point</div>
                            <div className="text-gray-400 text-sm">
                              X: {point.x?.toFixed(1)}, Y: {point.y?.toFixed(1)}
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Calculated Center */}
                      {(() => {
                        const points = selectedCalibration.calibration_points;
                        if (points.length === 4) {
                          const top = points.find(p => p.id === 'top');
                          const bottom = points.find(p => p.id === 'bottom');
                          const left = points.find(p => p.id === 'left');
                          const right = points.find(p => p.id === 'right');
                          
                          if (top && bottom && left && right) {
                            const centerX = (left.x + right.x) / 2;
                            const centerY = (top.y + bottom.y) / 2;
                            const radius = Math.abs(right.x - left.x) / 2;
                            
                            return (
                              <div className="mt-4 p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                                <div className="text-blue-300 font-medium mb-2">🎯 Calculated Wheel Center</div>
                                <div className="text-blue-100 text-sm">
                                  Center: ({centerX.toFixed(1)}, {centerY.toFixed(1)})
                                </div>
                                <div className="text-blue-100 text-sm">
                                  Radius: {radius.toFixed(1)} pixels
                                </div>
                              </div>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="p-6 border-t border-gray-700">
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleLoadCalibration(selectedCalibration)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Load Calibration
                    </button>
                    
                    <button
                      onClick={() => handleSaveAsNew(selectedCalibration)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all"
                    >
                      <Edit className="w-4 h-4" />
                      Copy
                    </button>
                    
                    <button
                      onClick={() => handleDeleteCalibration(selectedCalibration.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <div className="text-gray-400 mb-2">Select a calibration to view details</div>
                  <div className="text-gray-500 text-sm">
                    Choose from the list on the left to load, edit, or delete calibrations
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}