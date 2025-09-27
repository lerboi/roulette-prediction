// Database utilities for storing and retrieving historical roulette data using Supabase ONLY

// Try to import Supabase, but handle the case where it might not be configured
let supabase = null;
try {
  if (typeof window !== 'undefined') {
    // Only import on client side and if environment variables exist
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      import('../lib/supabase').then(module => {
        supabase = module.supabase;
      }).catch(() => {
        console.log('Supabase not configured');
      });
    }
  }
} catch (error) {
  console.log('Supabase not available');
}

/**
 * Store prediction result in Supabase only
 * @param {Object} data - Complete prediction and result data
 * @returns {boolean} Success status
 */
export async function storePredictionResult(data) {
  if (!supabase) {
    console.warn('Supabase not configured - result not saved');
    return false;
  }

  try {
    const { error } = await supabase
      .from('prediction_results')
      .insert([{
        timestamp: new Date().toISOString(),
        settings: data.settings,
        release_position: data.releasePosition,
        actual_result: data.actualResult,
        revolutions: data.revolutions,
        predicted_number: data.predictedNumber,
        confidence: data.confidence,
        data_quality: data.dataQuality,
        velocity_data: data.velocityData,
        decel_data: data.decelData,
        was_accurate: data.wasAccurate,
        total_time: data.totalTime,
        revolution_count: data.revolutionCount
      }]);

    if (error) {
      console.error('Supabase error storing result:', error);
      return false;
    }

    console.log('✅ Result stored successfully in Supabase');
    return true;
  } catch (error) {
    console.error('Error storing to Supabase:', error);
    return false;
  }
}

/**
 * Get all stored prediction results from Supabase only
 * @returns {Array} Array of historical prediction data
 */
export async function getStoredResults() {
  if (!supabase) {
    console.warn('Supabase not configured - no historical data available');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('prediction_results')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Supabase error getting results:', error);
      return [];
    }

    if (!Array.isArray(data)) {
      console.warn('Supabase returned non-array data');
      return [];
    }

    console.log(`📊 Retrieved ${data.length} records from Supabase`);
    return data;
  } catch (error) {
    console.error('Error retrieving from Supabase:', error);
    return [];
  }
}

/**
 * Find matching historical data based on settings using Supabase only
 * @param {Object} currentSettings - Current wheel settings
 * @param {string} releasePosition - Ball release position
 * @returns {Array} Matching historical records
 */
export async function findMatchingHistory(currentSettings, releasePosition) {
  if (!supabase) {
    console.warn('Supabase not configured - no historical matching available');
    return [];
  }

  try {
    const wheelSpeedMin = currentSettings.wheelSpeed - 1;
    const wheelSpeedMax = currentSettings.wheelSpeed + 1;
    
    const { data, error } = await supabase
      .from('prediction_results')
      .select('*')
      .eq('release_position', releasePosition)
      .filter('settings->>wheelSpeed', 'gte', wheelSpeedMin.toString())
      .filter('settings->>wheelSpeed', 'lte', wheelSpeedMax.toString())
      .filter('settings->>totalTime', 'eq', currentSettings.totalTime.toString());

    if (error) {
      console.error('Supabase error finding matching history:', error);
      return [];
    }

    if (!Array.isArray(data)) {
      console.warn('Supabase returned non-array data for matching history');
      return [];
    }

    console.log(`🔍 Found ${data.length} matching historical records for position ${releasePosition}`);
    return data;
  } catch (error) {
    console.error('Error finding matching history in Supabase:', error);
    return [];
  }
}

/**
 * Get statistics about stored data from Supabase only
 * @returns {Object} Database statistics
 */
export async function getDatabaseStats() {
  if (!supabase) {
    console.warn('Supabase not configured - no stats available');
    return {
      totalRecords: 0,
      dateRange: null,
      uniqueReleasePositions: 0,
      averageAccuracy: 0,
      totalWithPredictions: 0
    };
  }

  try {
    const { data, error } = await supabase
      .from('prediction_results')
      .select('*');

    if (error) {
      console.error('Supabase error getting stats:', error);
      return {
        totalRecords: 0,
        dateRange: null,
        uniqueReleasePositions: 0,
        averageAccuracy: 0,
        totalWithPredictions: 0
      };
    }

    if (!Array.isArray(data) || data.length === 0) {
      return {
        totalRecords: 0,
        dateRange: null,
        uniqueReleasePositions: 0,
        averageAccuracy: 0,
        totalWithPredictions: 0
      };
    }

    const totalRecords = data.length;
    const dates = data.map(r => new Date(r.timestamp));
    const uniquePositions = new Set(data.map(r => r.release_position)).size;
    
    let accuratePredictions = 0;
    let totalWithPredictions = 0;
    
    data.forEach(record => {
      if (record.predicted_number !== undefined && record.predicted_number !== null) {
        totalWithPredictions++;
        if (record.was_accurate) {
          accuratePredictions++;
        }
      }
    });

    const averageAccuracy = totalWithPredictions > 0 ? 
      (accuratePredictions / totalWithPredictions) * 100 : 0;

    console.log(`📈 Database stats: ${totalRecords} total records, ${averageAccuracy.toFixed(1)}% accuracy`);

    return {
      totalRecords,
      dateRange: {
        earliest: new Date(Math.min(...dates)).toLocaleDateString(),
        latest: new Date(Math.max(...dates)).toLocaleDateString()
      },
      uniqueReleasePositions: uniquePositions,
      averageAccuracy,
      totalWithPredictions
    };
  } catch (error) {
    console.error('Error getting stats from Supabase:', error);
    return {
      totalRecords: 0,
      dateRange: null,
      uniqueReleasePositions: 0,
      averageAccuracy: 0,
      totalWithPredictions: 0
    };
  }
}

/**
 * Clear all stored data from Supabase only
 * @returns {boolean} Success status
 */
export async function clearAllData() {
  if (!supabase) {
    console.warn('Supabase not configured - cannot clear data');
    return false;
  }

  try {
    const { error } = await supabase
      .from('prediction_results')
      .delete()
      .neq('id', 0); // Delete all records

    if (error) {
      console.error('Supabase error clearing data:', error);
      return false;
    }

    console.log('🗑️ All data cleared from Supabase');
    return true;
  } catch (error) {
    console.error('Error clearing Supabase data:', error);
    return false;
  }
}

/**
 * Analyze historical data to generate probability distribution
 * @param {Array} historicalData - Matching historical records
 * @returns {Object} Probability analysis
 */
export function analyzeHistoricalProbabilities(historicalData) {
  // Ensure historicalData is an array
  if (!Array.isArray(historicalData) || historicalData.length === 0) {
    return {
      hasData: false,
      totalRecords: 0,
      numberFrequencies: {},
      recommendations: []
    };
  }

  console.log(`📊 Analyzing ${historicalData.length} historical records`);

  // Count frequency of each result number
  const numberFrequencies = {};
  historicalData.forEach(record => {
    // Handle Supabase format (snake_case)
    const resultNumber = record.actual_result;
    if (resultNumber !== undefined && resultNumber !== null) {
      numberFrequencies[resultNumber] = (numberFrequencies[resultNumber] || 0) + 1;
    }
  });

  // Calculate probabilities
  const totalRecords = historicalData.length;
  const numberProbabilities = {};
  Object.keys(numberFrequencies).forEach(number => {
    numberProbabilities[number] = {
      frequency: numberFrequencies[number],
      probability: (numberFrequencies[number] / totalRecords) * 100,
      count: numberFrequencies[number]
    };
  });

  // Sort by probability (highest first)
  const sortedNumbers = Object.keys(numberProbabilities)
    .sort((a, b) => numberProbabilities[b].probability - numberProbabilities[a].probability)
    .map(number => ({
      number: parseInt(number),
      ...numberProbabilities[number]
    }));

  // Generate recommendations (top 5 most frequent)
  const recommendations = sortedNumbers.slice(0, 5);

  console.log('🎯 Historical analysis:', {
    mostFrequentNumber: recommendations[0]?.number,
    highestProbability: recommendations[0]?.probability?.toFixed(1) + '%',
    totalUniqueNumbers: sortedNumbers.length
  });

  return {
    hasData: true,
    totalRecords,
    numberFrequencies,
    recommendations,
    allNumbers: sortedNumbers,
    confidence: Math.min(95, totalRecords * 5)
  };
}

/**
 * Export data as JSON for backup
 * @returns {string} JSON string of all data
 */
export async function exportData() {
  const data = await getStoredResults();
  console.log(`📤 Exporting ${data.length} records`);
  return JSON.stringify(data, null, 2);
}

/**
 * Import data from JSON (Supabase batch insert)
 * @param {string} jsonData - JSON string to import
 * @returns {boolean} Success status
 */
export async function importData(jsonData) {
  if (!supabase) {
    console.warn('Supabase not configured - cannot import data');
    return false;
  }

  try {
    const data = JSON.parse(jsonData);
    if (!Array.isArray(data)) {
      console.error('Import data is not an array');
      return false;
    }

    // Batch insert to Supabase
    const { error } = await supabase
      .from('prediction_results')
      .insert(data);

    if (error) {
      console.error('Supabase error importing data:', error);
      return false;
    }

    console.log(`📥 Successfully imported ${data.length} records`);
    return true;
  } catch (error) {
    console.error('Error importing data:', error);
    return false;
  }
}
    
