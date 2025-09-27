'use client';

import { useState } from 'react';
import { Database, X, Download, Upload, Trash2, BarChart3, TrendingUp } from 'lucide-react';
import { 
  getDatabaseStats, 
  getStoredResults, 
  clearAllData, 
  exportData, 
  importData,
  findMatchingHistory,
  analyzeHistoricalProbabilities
} from '../utils/database';

export default function DatabasePanel({ settings, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('stats');
  const [stats, setStats] = useState(() => getDatabaseStats());
  const [allResults, setAllResults] = useState(() => getStoredResults());
  const [analysisSettings, setAnalysisSettings] = useState({
    wheelSpeed: settings.wheelSpeed,
    totalTime: settings.totalTime,
    releasePosition: ''
  });
  const [customAnalysis, setCustomAnalysis] = useState(null);

  const refreshData = () => {
    setStats(getDatabaseStats());
    setAllResults(getStoredResults());
  };

  const handleClearData = () => {
    if (window.confirm('Are you sure you want to clear all stored data? This cannot be undone.')) {
      const success = clearAllData();
      if (success) {
        alert('All data cleared successfully');
        refreshData();
      } else {
        alert('Error clearing data');
      }
    }
  };

  const handleExportData = () => {
    const jsonData = exportData();
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roulette-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const success = importData(e.target.result);
          if (success) {
            alert('Data imported successfully');
            refreshData();
          } else {
            alert('Error importing data - invalid format');
          }
        } catch (error) {
          alert('Error importing data: ' + error.message);
        }
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  const runCustomAnalysis = () => {
    if (!analysisSettings.releasePosition) {
      alert('Please enter a release position for analysis');
      return;
    }

    const matchingData = findMatchingHistory(
      {
        wheelSpeed: analysisSettings.wheelSpeed,
        totalTime: analysisSettings.totalTime,
        wheelRadius: settings.wheelRadius,
        dropThreshold: settings.dropThreshold
      },
      analysisSettings.releasePosition
    );

    const analysis = analyzeHistoricalProbabilities(matchingData);
    setCustomAnalysis(analysis);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-6 h-6" />
            Historical Data Management
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'stats' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Statistics
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'records' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Records
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'analysis' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Analysis
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'manage' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Manage
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          
          {/* Statistics Tab */}
          {activeTab === 'stats' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
                  <div className="text-blue-200 text-sm">Total Records</div>
                  <div className="text-white text-2xl font-bold">{stats.totalRecords}</div>
                </div>
                <div className="bg-green-500/20 border border-green-500 rounded-lg p-4">
                  <div className="text-green-200 text-sm">Unique Positions</div>
                  <div className="text-white text-2xl font-bold">{stats.uniqueReleasePositions}</div>
                </div>
                <div className="bg-purple-500/20 border border-purple-500 rounded-lg p-4">
                  <div className="text-purple-200 text-sm">Accuracy</div>
                  <div className="text-white text-2xl font-bold">{stats.averageAccuracy?.toFixed(1)}%</div>
                </div>
                <div className="bg-orange-500/20 border border-orange-500 rounded-lg p-4">
                  <div className="text-orange-200 text-sm">With Predictions</div>
                  <div className="text-white text-2xl font-bold">{stats.totalWithPredictions}</div>
                </div>
              </div>

              {stats.dateRange && (
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-2">Date Range</h4>
                  <p className="text-gray-300">
                    From {stats.dateRange.earliest} to {stats.dateRange.latest}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Records Tab */}
          {activeTab === 'records' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-white font-semibold">Recent Records</h4>
                <button
                  onClick={refreshData}
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  Refresh
                </button>
              </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {allResults.slice(-20).reverse().map((record, idx) => (
                  <div key={record.id} className="bg-gray-800/50 rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-white">
                        Release: #{record.releasePosition} → Result: #{record.actualResult}
                      </div>
                      <div className={`px-2 py-1 rounded text-xs ${
                        record.wasAccurate ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {record.wasAccurate ? 'Accurate' : 'Miss'}
                      </div>
                    </div>
                    <div className="text-gray-400 grid grid-cols-2 gap-4">
                      <div>Predicted: #{record.predictedNumber} ({record.confidence}%)</div>
                      <div>Settings: {record.settings.wheelSpeed}RPM, {record.settings.totalTime}s</div>
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      {new Date(record.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {allResults.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No records found. Start making predictions and saving results!
                </div>
              )}
            </div>
          )}

          {/* Analysis Tab */}
          {activeTab === 'analysis' && (
            <div className="space-y-4">
              <h4 className="text-white font-semibold">Custom Analysis</h4>
              
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Wheel Speed (RPM)</label>
                    <input
                      type="number"
                      value={analysisSettings.wheelSpeed}
                      onChange={(e) => setAnalysisSettings(prev => ({
                        ...prev,
                        wheelSpeed: parseFloat(e.target.value)
                      }))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Total Time (s)</label>
                    <input
                      type="number"
                      value={analysisSettings.totalTime}
                      onChange={(e) => setAnalysisSettings(prev => ({
                        ...prev,
                        totalTime: parseFloat(e.target.value)
                      }))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Release Position</label>
                    <input
                      type="text"
                      value={analysisSettings.releasePosition}
                      onChange={(e) => setAnalysisSettings(prev => ({
                        ...prev,
                        releasePosition: e.target.value
                      }))}
                      placeholder="e.g., 7, 23"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                
                <button
                  onClick={runCustomAnalysis}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-all"
                >
                  <BarChart3 className="w-4 h-4" />
                  Run Analysis
                </button>
              </div>

              {customAnalysis && (
                <div className="bg-cyan-500/20 border border-cyan-500 rounded-lg p-4">
                  {customAnalysis.hasData ? (
                    <>
                      <h5 className="text-cyan-200 font-medium mb-3">
                        Analysis Results ({customAnalysis.totalRecords} matching records)
                      </h5>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {customAnalysis.recommendations.map((rec, idx) => (
                          <div key={idx} className="bg-cyan-600/30 border border-cyan-400 rounded px-3 py-2">
                            <div className="text-cyan-100 font-bold">#{rec.number}</div>
                            <div className="text-cyan-200 text-sm">{rec.probability.toFixed(1)}%</div>
                            <div className="text-cyan-300 text-xs">{rec.count}x hits</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-cyan-200">
                      No matching records found for these settings and release position.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manage Tab */}
          {activeTab === 'manage' && (
            <div className="space-y-4">
              <h4 className="text-white font-semibold">Data Management</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Export Data */}
                <div className="bg-green-500/20 border border-green-500 rounded-lg p-4">
                  <h5 className="text-green-200 font-medium mb-2 flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export Data
                  </h5>
                  <p className="text-green-100 text-sm mb-3">
                    Download all stored data as JSON for backup or analysis.
                  </p>
                  <button
                    onClick={handleExportData}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded transition-all"
                    disabled={stats.totalRecords === 0}
                  >
                    Export JSON
                  </button>
                </div>

                {/* Import Data */}
                <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
                  <h5 className="text-blue-200 font-medium mb-2 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Import Data
                  </h5>
                  <p className="text-blue-100 text-sm mb-3">
                    Upload previously exported JSON data.
                  </p>
                  <label className="block">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportData}
                      className="hidden"
                    />
                    <span className="inline-block px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-all cursor-pointer">
                      Choose File
                    </span>
                  </label>
                </div>

                {/* Clear Data */}
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 md:col-span-2">
                  <h5 className="text-red-200 font-medium mb-2 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    Clear All Data
                  </h5>
                  <p className="text-red-100 text-sm mb-3">
                    Permanently delete all stored prediction data. This cannot be undone.
                  </p>
                  <button
                    onClick={handleClearData}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-all"
                    disabled={stats.totalRecords === 0}
                  >
                    Clear All Data
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}