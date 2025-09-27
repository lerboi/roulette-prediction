'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Square, RotateCcw, Settings, Mic, MicOff, Save, Database, TrendingUp } from 'lucide-react';
import SettingsPanel from '../components/SettingsPanel';
import DatabasePanel from '../components/DatabasePanel';
import { 
  calculateBallVelocity, 
  calculateDeceleration, 
  predictBallDrop, 
  calculateFinalPositions, 
  generateBettingSectors,
  generateDozensBetting,
  calculateExpectedValue,
  validateRevolutionData
} from '../utils/physics';
import { 
  storePredictionResult, 
  findMatchingHistory, 
  analyzeHistoricalProbabilities,
  getDatabaseStats
} from '../utils/database';

export default function RoulettePredictorApp() {
  // State management
  const [gameState, setGameState] = useState('idle'); // idle, collecting, calculating, results
  const [releasePosition, setReleasePosition] = useState('');
  const [revolutions, setRevolutions] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState(3);
  const [prediction, setPrediction] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [actualResult, setActualResult] = useState('');
  const [historicalAnalysis, setHistoricalAnalysis] = useState(null);
  const [showResultInput, setShowResultInput] = useState(false);
  const [showDatabasePanel, setShowDatabasePanel] = useState(false);
  const [settings, setSettings] = useState({
    wheelSpeed: 30, // RPM
    totalTime: 3, // seconds (reduced from 6)
    wheelRadius: 27, // cm
    dropThreshold: 0.5 // rev/sec
  });

  // Refs
  const startTimeRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const timerRef = useRef(null);

  // Keyboard event handler for spacebar
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.code === 'Space') {
        event.preventDefault(); // Prevent page scroll
        
        if (gameState === 'idle') {
          // Start tracking immediately
          startTracking();
        } else if (gameState === 'collecting') {
          // Record revolution if already tracking
          recordRevolution();
        }
      }
    };

    // Add event listener when component mounts
    window.addEventListener('keydown', handleKeyPress);

    // Cleanup event listener when component unmounts
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [gameState]); // Re-attach when gameState changes

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true; // Keep listening continuously
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
        parseReleasePosition(transcript);
        // Don't set isListening to false - keep it active
      };

      recognition.onerror = (event) => {
        console.log('Speech recognition error:', event.error);
        // Only stop on fatal errors, not temporary ones
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        // Automatically restart if we were supposed to be listening
        if (isListening) {
          try {
            recognition.start();
          } catch (e) {
            console.log('Could not restart recognition:', e);
          }
        }
      };

      speechRecognitionRef.current = recognition;
    }
  }, [isListening]); // Add isListening to dependencies

  // Timer countdown
  useEffect(() => {
    if (gameState === 'collecting' && timeRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setTimeRemaining(prev => {
          if (prev <= 0.1) {
            handleTimeUp();
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameState, timeRemaining]);

  // Update timeRemaining when settings change
  useEffect(() => {
    if (gameState === 'idle') {
      setTimeRemaining(settings.totalTime);
    }
  }, [settings.totalTime, gameState]);

  const parseReleasePosition = (transcript) => {
    // Parse speech input like "red 7", "black 23", "one", "seven", etc.
    const words = transcript.split(' ');
    let position = '';
    
    // Number word to digit mapping
    const numberWords = {
      'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
      'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
      'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14', 
      'fifteen': '15', 'sixteen': '16', 'seventeen': '17', 'eighteen': '18',
      'nineteen': '19', 'twenty': '20', 'twenty-one': '21', 'twenty-two': '22',
      'twenty-three': '23', 'twenty-four': '24', 'twenty-five': '25',
      'twenty-six': '26', 'twenty-seven': '27', 'twenty-eight': '28',
      'twenty-nine': '29', 'thirty': '30', 'thirty-one': '31', 'thirty-two': '32',
      'thirty-three': '33', 'thirty-four': '34', 'thirty-five': '35', 'thirty-six': '36'
    };
    
    // First, look for direct number words
    for (let word of words) {
      const cleanWord = word.toLowerCase().replace(/[^\w-]/g, '');
      if (numberWords[cleanWord]) {
        position = numberWords[cleanWord];
        break;
      }
    }
    
    // If no number word found, look for digits
    if (!position) {
      for (let word of words) {
        if (/\d+/.test(word)) {
          const number = word.match(/\d+/)[0];
          position = number;
          break;
        }
      }
    }
    
    if (position) {
      setReleasePosition(position);
    }
  };

  const startVoiceRecognition = () => {
    if (speechRecognitionRef.current && !isListening) {
      setIsListening(true);
      try {
        speechRecognitionRef.current.start();
      } catch (e) {
        console.log('Could not start recognition:', e);
        setIsListening(false);
      }
    }
  };

  const stopVoiceRecognition = () => {
    if (speechRecognitionRef.current && isListening) {
      setIsListening(false);
      speechRecognitionRef.current.stop();
    }
  };

  const startTracking = () => {
    setGameState('collecting');
    setRevolutions([]);
    setTimeRemaining(settings.totalTime);
    startTimeRef.current = Date.now();
  };

  const recordRevolution = () => {
    if (gameState !== 'collecting') return;
    
    const currentTime = Date.now();
    const elapsedTime = (currentTime - startTimeRef.current) / 1000;
    
    setRevolutions(prev => [...prev, {
      revolution: prev.length + 1,
      timestamp: currentTime,
      elapsedTime: elapsedTime
    }]);
  };

  const handleTimeUp = () => {
    if (!releasePosition) {
      setPrediction({
        error: 'Release position not set - please use voice input or type the release number',
        confidence: 0
      });
      setGameState('results');
      return;
    }
    
    setGameState('calculating');
    calculatePrediction();
  };

  const calculatePrediction = async () => {
    // Console log physics settings being applied
    console.log('🔧 PHYSICS SETTINGS APPLIED:', {
      wheelSpeed: settings.wheelSpeed + ' RPM',
      totalTime: settings.totalTime + ' seconds',
      wheelRadius: settings.wheelRadius + ' cm',
      dropThreshold: settings.dropThreshold + ' rev/sec'
    });
    console.log('📊 CALCULATION INPUT DATA:', {
      releasePosition: releasePosition,
      revolutionsCount: revolutions.length,
      elapsedTime: revolutions.length > 0 ? revolutions[revolutions.length - 1].elapsedTime + ' seconds' : 'None'
    });

    // Check for historical data first
    if (releasePosition) {
      try {
        const matchingHistory = await findMatchingHistory(settings, releasePosition);
        const historicalProbs = analyzeHistoricalProbabilities(matchingHistory);
        setHistoricalAnalysis(historicalProbs);
        console.log('📚 HISTORICAL DATA:', {
          matchingRecords: matchingHistory.length,
          hasRecommendations: historicalProbs.hasData
        });
      } catch (error) {
        console.error('Error getting historical data:', error);
        setHistoricalAnalysis(null);
      }
    }

    // Validate revolution data
    const validation = validateRevolutionData(revolutions);
    if (!validation.valid) {
      console.log('❌ VALIDATION FAILED:', validation.error);
      setPrediction({
        error: validation.error,
        confidence: 0,
        warnings: validation.warnings
      });
      setGameState('results');
      return;
    }

    console.log('✅ DATA VALIDATION PASSED:', {
      revolutionCount: revolutions.length,
      dataQuality: validation.dataQualityScore + '%',
      avgRevolutionTime: validation.avgRevolutionTime?.toFixed(3) + ' seconds'
    });

    // Calculate ball velocity and deceleration
    const velocityData = calculateBallVelocity(revolutions);
    if (velocityData.error) {
      console.log('❌ VELOCITY CALCULATION FAILED:', velocityData.error);
      setPrediction({
        error: velocityData.error,
        confidence: 0
      });
      setGameState('results');
      return;
    }

    console.log('⚡ VELOCITY DATA:', {
      initialVelocity: velocityData.initialVelocity?.toFixed(3) + ' rev/s',
      finalVelocity: velocityData.finalVelocity?.toFixed(3) + ' rev/s',
      averageVelocity: velocityData.averageVelocity?.toFixed(3) + ' rev/s'
    });

    const decelData = calculateDeceleration(velocityData.velocities);
    console.log('📉 DECELERATION DATA:', {
      deceleration: decelData.deceleration?.toFixed(6) + ' rev/s²',
      rSquared: decelData.rSquared?.toFixed(3),
      fitQuality: decelData.rSquared > 0.8 ? 'Good' : decelData.rSquared > 0.6 ? 'Fair' : 'Poor'
    });
    
    // Predict ball drop
    const currentTime = revolutions[revolutions.length - 1].elapsedTime;
    const dropPrediction = predictBallDrop(
      velocityData, 
      decelData, 
      settings.dropThreshold, // Using physics setting here
      currentTime
    );

    if (dropPrediction.error) {
      console.log('❌ DROP PREDICTION FAILED:', dropPrediction.error);
      setPrediction({
        error: dropPrediction.error,
        confidence: 0
      });
      setGameState('results');
      return;
    }

    console.log('🎯 DROP PREDICTION:', {
      dropTime: dropPrediction.dropTime?.toFixed(2) + ' seconds',
      timeUntilDrop: dropPrediction.timeUntilDrop?.toFixed(2) + ' seconds',
      currentVelocity: dropPrediction.currentVelocity?.toFixed(3) + ' rev/s',
      dropThresholdUsed: settings.dropThreshold + ' rev/s'
    });

    // Calculate final positions
    const positions = calculateFinalPositions(
      releasePosition,
      revolutions,
      dropPrediction.dropTime,
      settings.wheelSpeed, // Using physics setting here
      settings.wheelRadius // Using physics setting here
    );

    if (positions.error) {
      console.log('❌ POSITION CALCULATION FAILED:', positions.error);
      setPrediction({
        error: positions.error,
        confidence: 0
      });
      setGameState('results');
      return;
    }

    console.log('🎰 POSITION CALCULATIONS:', {
      predictedNumber: positions.predictedNumber,
      predictedSector: positions.predictedSector,
      ballPosition: positions.ballPosition?.toFixed(2),
      wheelPosition: positions.wheelPosition?.toFixed(2),
      relativePosition: positions.relativePosition?.toFixed(2),
      totalRevolutions: positions.totalRevolutions?.toFixed(2),
      settingsUsed: positions.settingsUsed || 'Not available'
    });

    // Generate betting recommendations
    const bettingSectors = generateBettingSectors(
      positions.predictedSector, 
      dropPrediction.confidence
    );

    // Generate dozens betting analysis
    const dozensAnalysis = generateDozensBetting(bettingSectors);

    // Calculate expected value
    const expectedValue = calculateExpectedValue(bettingSectors, 1);

    console.log('🎲 BETTING RECOMMENDATIONS:', {
      recommendedNumbers: bettingSectors.filter(s => s.recommended).map(s => s.number),
      bestDozen: dozensAnalysis.bestDozen?.name,
      expectedROI: expectedValue.roi?.toFixed(1) + '%',
      houseEdgeBeaten: expectedValue.houseEdgeBeaten
    });

    console.log('📈 FINAL CONFIDENCE SCORES:', {
      physicsConfidence: Math.round(dropPrediction.confidence) + '%',
      dataQuality: validation.dataQualityScore + '%',
      overallReliability: historicalAnalysis?.hasData ? 'High (with historical data)' : 'Physics-based only'
    });

    setPrediction({
      // Physics data
      velocityData,
      decelData,
      dropPrediction,
      positions,
      
      // Betting recommendations
      sectors: bettingSectors,
      dozens: dozensAnalysis,
      expectedValue,
      
      // Summary stats
      confidence: Math.round(dropPrediction.confidence),
      predictedNumber: positions.predictedNumber,
      timeUntilDrop: dropPrediction.timeUntilDrop,
      dataQuality: validation.dataQualityScore,
      warnings: validation.warnings || []
    });
    
    setGameState('results');
  };

  const saveResult = async () => {
    if (!actualResult || !prediction || !releasePosition) {
      alert('Please enter the actual result number');
      return;
    }

    const dataToStore = {
      // Settings used
      settings: { ...settings },
      
      // Input data
      releasePosition,
      actualResult: parseInt(actualResult),
      
      // Revolution data
      revolutions: [...revolutions],
      
      // Prediction data
      predictedNumber: prediction.predictedNumber,
      confidence: prediction.confidence,
      dataQuality: prediction.dataQuality,
      
      // Physics data (for analysis)
      velocityData: prediction.velocityData,
      decelData: prediction.decelData,
      
      // Accuracy
      wasAccurate: prediction.predictedNumber === parseInt(actualResult),
      
      // Metadata
      totalTime: settings.totalTime,
      revolutionCount: revolutions.length
    };

    try {
      const success = await storePredictionResult(dataToStore);
      if (success) {
        alert('Result saved to database!');
        setActualResult('');
        setShowResultInput(false);
        
        // Refresh historical analysis
        if (releasePosition) {
          const matchingHistory = await findMatchingHistory(settings, releasePosition);
          const historicalProbs = analyzeHistoricalProbabilities(matchingHistory);
          setHistoricalAnalysis(historicalProbs);
        }
      } else {
        alert('Error saving result. Please try again.');
      }
    } catch (error) {
      console.error('Error saving result:', error);
      alert('Error saving result. Please try again.');
    }
  };

  const reset = () => {
    setGameState('idle');
    setReleasePosition('');
    setRevolutions([]);
    setTimeRemaining(settings.totalTime);
    setPrediction(null);
    setActualResult('');
    setHistoricalAnalysis(null);
    setShowResultInput(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    
    // Stop voice recognition when resetting
    if (isListening) {
      stopVoiceRecognition();
    }
  };

  const getTimerColor = () => {
    if (timeRemaining > 1.5) return 'text-green-500';
    if (timeRemaining > 0.5) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Roulette Physics Predictor</h1>
          <p className="text-green-200">Based on Doyne Farmer's methodology</p>
        </div>

        {/* Main Interface */}
        <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-green-500/30 p-6 mb-6">
          
          {/* Status Display */}
          <div className="flex justify-between items-center mb-6">
            <div className="text-white">
              <span className="text-sm opacity-80">Status: </span>
              <span className="capitalize font-semibold text-green-400">{gameState}</span>
            </div>
            
            {gameState === 'collecting' && (
              <div className={`text-3xl font-bold ${getTimerColor()}`}>
                {timeRemaining.toFixed(1)}s
              </div>
            )}
          </div>

          {/* Release Position Input */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">
              Step 1: Ball Release Position 
              {gameState === 'collecting' && !releasePosition && (
                <span className="text-yellow-400 text-sm ml-2 animate-pulse">⚠ Set this while tracking!</span>
              )}
            </h3>
            <div className="flex items-center gap-4">
              <button
                onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  isListening 
                    ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                {isListening ? 'Stop Listening' : 'Start Voice Input'}
              </button>
              
              <input
                type="text"
                value={releasePosition}
                onChange={(e) => setReleasePosition(e.target.value)}
                placeholder="Or type release position (e.g., '7', '23')"
                className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-600 focus:border-green-500 focus:outline-none"
              />
              
              {releasePosition ? (
                <div className="text-green-400 font-semibold">
                  ✓ Set: {releasePosition}
                </div>
              ) : gameState === 'collecting' ? (
                <div className="text-yellow-400 font-semibold animate-pulse">
                  ⚠ Required for calculation
                </div>
              ) : (
                <div className="text-gray-400 font-semibold">
                  Optional - can set during tracking
                </div>
              )}
            </div>
          </div>

          {/* Revolution Tracking */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Step 2: Track Ball Revolutions</h3>
            <div className="flex items-center gap-4 mb-4">
              {gameState === 'idle' ? (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={startTracking}
                    className="flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-all"
                  >
                    <Play className="w-5 h-5" />
                    Start Tracking
                  </button>
                  <div className="text-green-300 text-sm opacity-80">
                    Or press <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">SPACEBAR</kbd> to start instantly
                  </div>
                </div>
              ) : gameState === 'collecting' ? (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={recordRevolution}
                    className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium text-xl animate-pulse"
                  >
                    CLICK WHEN BALL PASSES {releasePosition ? `#${releasePosition}` : 'RELEASE POINT'}
                  </button>
                  <div className="text-green-300 text-sm opacity-80">
                    Or press <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">SPACEBAR</kbd>
                  </div>
                  {!releasePosition && (
                    <div className="text-yellow-400 text-sm animate-pulse">
                      ⚠ Don't forget to set release position above!
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={reset}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium"
                >
                  <RotateCcw className="w-5 h-5" />
                  Reset
                </button>
              )}
            </div>

            {/* Revolution Data */}
            {revolutions.length > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">Recorded Revolutions: {revolutions.length}</h4>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  {revolutions.map((rev, idx) => (
                    <div key={idx} className="text-green-300">
                      #{rev.revolution}: {rev.elapsedTime.toFixed(2)}s
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Prediction Results */}
          {prediction && gameState === 'results' && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Prediction Results</h3>
              
              {prediction.error ? (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-4">
                  <p className="text-red-400 font-medium">{prediction.error}</p>
                  {prediction.warnings && prediction.warnings.length > 0 && (
                    <div className="mt-2">
                      <p className="text-red-300 text-sm">Warnings:</p>
                      <ul className="text-red-300 text-sm list-disc list-inside">
                        {prediction.warnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  
                  {/* Historical Data Display */}
                  {historicalAnalysis && historicalAnalysis.hasData && (
                    <div className="bg-cyan-500/20 border border-cyan-500 rounded-lg p-4">
                      <h4 className="text-cyan-200 font-semibold mb-3 flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        Historical Data Analysis ({historicalAnalysis.totalRecords} records)
                      </h4>
                      
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                        {historicalAnalysis.recommendations.map((rec, idx) => (
                          <div key={idx} className="bg-cyan-600/30 border border-cyan-400 rounded px-3 py-2">
                            <div className="text-cyan-100 font-bold">#{rec.number}</div>
                            <div className="text-cyan-200 text-sm">{rec.probability.toFixed(1)}%</div>
                            <div className="text-cyan-300 text-xs">{rec.count}x</div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="text-cyan-200 text-sm">
                        Confidence: {historicalAnalysis.confidence}% • Based on identical settings and release position
                      </div>
                    </div>
                  )}

                  {/* Main Prediction */}
                  <div className="bg-green-500/20 border border-green-500 rounded-lg p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <span className="text-green-200 text-sm">Predicted Number:</span>
                        <div className="text-white font-bold text-xl">{prediction.predictedNumber}</div>
                      </div>
                      <div>
                        <span className="text-green-200 text-sm">Confidence:</span>
                        <div className="text-white font-bold text-xl">{prediction.confidence}%</div>
                      </div>
                      <div>
                        <span className="text-green-200 text-sm">Data Quality:</span>
                        <div className="text-white font-bold text-xl">{prediction.dataQuality}%</div>
                      </div>
                      <div>
                        <span className="text-green-200 text-sm">Time to Drop:</span>
                        <div className="text-white font-bold text-xl">{prediction.timeUntilDrop?.toFixed(1)}s</div>
                      </div>
                    </div>
                    
                    {prediction.warnings && prediction.warnings.length > 0 && (
                      <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500 rounded">
                        <p className="text-yellow-400 text-sm font-medium">Warnings:</p>
                        <ul className="text-yellow-300 text-sm list-disc list-inside">
                          {prediction.warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Dozens Betting Recommendations */}
                  {prediction.dozens && (
                    <div className="bg-purple-500/20 border border-purple-500 rounded-lg p-4">
                      <h4 className="text-purple-200 font-semibold mb-3">Dozens Betting (2:1 Payout - 3x Return)</h4>
                      
                      {prediction.dozens.bestDozen && (
                        <div className="mb-3 p-3 bg-purple-600/30 rounded-lg border border-purple-400">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-purple-100 font-bold">🎯 Best Bet: {prediction.dozens.bestDozen.name}</span>
                            <span className={`font-bold ${prediction.dozens.bestDozen.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {prediction.dozens.bestDozen.roi.toFixed(1)}% ROI
                            </span>
                          </div>
                          <div className="text-purple-200 text-sm">
                            {prediction.dozens.bestDozen.numbers_range} • {prediction.dozens.bestDozen.totalProbability.toFixed(1)}% probability • Pays 3x your bet
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {prediction.dozens.analysis.map((dozen, idx) => (
                          <div 
                            key={idx} 
                            className={`rounded px-3 py-2 border ${
                              dozen.recommended 
                                ? 'bg-green-500/20 border-green-500 text-green-300' 
                                : 'bg-gray-600/20 border-gray-600 text-gray-300'
                            }`}
                          >
                            <div className="font-bold text-sm">{dozen.name}</div>
                            <div className="text-xs">{dozen.numbers_range}</div>
                            <div className="text-xs">{dozen.totalProbability.toFixed(1)}%</div>
                            <div className={`text-xs font-medium ${dozen.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {dozen.roi.toFixed(1)}% ROI
                            </div>
                          </div>
                        ))}
                      </div>

                      {prediction.dozens.hasAdvantage && (
                        <div className="mt-3 p-2 bg-green-500/20 border border-green-500 rounded text-center">
                          <span className="text-green-300 text-sm font-medium">
                            ✅ Positive expected value detected on dozens bets!
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Betting Recommendations */}
                  <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
                    <h4 className="text-blue-200 font-semibold mb-3">Individual Number Bets (35:1 Payout)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                      {prediction.sectors?.filter(s => s.recommended).map((sector, idx) => (
                        <div key={idx} className="bg-yellow-500/20 border border-yellow-500 rounded px-3 py-2">
                          <div className="text-yellow-400 font-bold">Number {sector.number}</div>
                          <div className="text-yellow-300 text-sm">{sector.probability}% chance</div>
                        </div>
                      ))}
                    </div>
                    
                    {prediction.expectedValue && (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-blue-200">Expected ROI: </span>
                          <span className={`font-bold ${prediction.expectedValue.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {prediction.expectedValue.roi.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-blue-200">House Edge Beaten: </span>
                          <span className={`font-bold ${prediction.expectedValue.houseEdgeBeaten ? 'text-green-400' : 'text-red-400'}`}>
                            {prediction.expectedValue.houseEdgeBeaten ? 'Yes' : 'No'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Result Input Section */}
                  <div className="bg-orange-500/20 border border-orange-500 rounded-lg p-4">
                    <h4 className="text-orange-200 font-semibold mb-3 flex items-center gap-2">
                      <Save className="w-5 h-5" />
                      Record Actual Result
                    </h4>
                    
                    {!showResultInput ? (
                      <button
                        onClick={() => setShowResultInput(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all"
                      >
                        <TrendingUp className="w-4 h-4" />
                        Add Result to Database
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            value={actualResult}
                            onChange={(e) => setActualResult(e.target.value)}
                            placeholder="Enter actual result number (0-36)"
                            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-orange-500 focus:outline-none"
                            min="0"
                            max="36"
                          />
                          <button
                            onClick={saveResult}
                            disabled={!actualResult}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-500 text-white rounded transition-all"
                          >
                            <Save className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            onClick={() => setShowResultInput(false)}
                            className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="text-orange-200 text-sm">
                          This will store your settings, predictions, and actual result for future analysis.
                          Helps improve predictions for similar conditions.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Physics Details (Collapsible) */}
                  <details className="bg-gray-800/50 rounded-lg p-4">
                    <summary className="text-gray-300 font-medium cursor-pointer hover:text-white">
                      Physics Details (Click to expand)
                    </summary>
                    <div className="mt-3 space-y-2 text-sm">
                      {prediction.velocityData && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-gray-400">Initial Velocity: </span>
                            <span className="text-white">{prediction.velocityData.initialVelocity?.toFixed(3)} rev/s</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Final Velocity: </span>
                            <span className="text-white">{prediction.velocityData.finalVelocity?.toFixed(3)} rev/s</span>
                          </div>
                        </div>
                      )}
                      {prediction.decelData && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-gray-400">Deceleration: </span>
                            <span className="text-white">{prediction.decelData.deceleration?.toFixed(6)} rev/s²</span>
                          </div>
                          <div>
                            <span className="text-gray-400">R-squared: </span>
                            <span className="text-white">{prediction.decelData.rSquared?.toFixed(3)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Instructions */}
        <div className="bg-black/10 rounded-xl p-6 text-green-100">
          <h3 className="font-semibold mb-2">Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm opacity-90">
            <li><strong>Start tracking instantly</strong> - Press <kbd className="px-1 bg-gray-700 rounded text-xs">SPACEBAR</kbd> when ball is released (or click "Start Tracking")</li>
            <li><strong>Set release position</strong> - Use voice input or type the number while tracking</li>
            <li><strong>Record revolutions</strong> - Press <kbd className="px-1 bg-gray-700 rounded text-xs">SPACEBAR</kbd> or click button each time ball passes release point</li>
            <li><strong>Get predictions</strong> - System calculates after 3 seconds with individual numbers AND dozens recommendations</li>
            <li><strong>Place bets</strong> - Use recommended sectors and check dozens betting for better odds</li>
          </ol>
          
          <div className="mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
            <h4 className="font-medium text-green-200 mb-1">⚡ Fast 3-Second Mode + Dozens Betting:</h4>
            <p className="text-sm text-green-100">
              <strong>Reduced tracking time to 3 seconds</strong> for faster decisions. Now includes dozens betting analysis 
              (1st 12, 2nd 12, 3rd 12) with 2:1 payouts - often better odds than individual numbers!
            </p>
          </div>
        </div>

        {/* Settings Panel */}
        <SettingsPanel 
          settings={settings} 
          onSettingsChange={setSettings} 
        />

        {/* Database Panel */}
        <DatabasePanel
          settings={settings}
          isOpen={showDatabasePanel}
          onClose={() => setShowDatabasePanel(false)}
        />

        {/* Database Button */}
        <button
          onClick={() => setShowDatabasePanel(true)}
          className="fixed top-4 left-4 p-3 bg-cyan-800 hover:bg-cyan-700 text-white rounded-full shadow-lg transition-all"
          title="View Historical Data"
        >
          <Database className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}