// src/utils/multiAngleDatabase.js
// Database utilities for multi-angle calibration system

import { supabase } from '../lib/supabase';

/**
 * Create a new calibration group for a casino table
 * @param {string} casinoName - Name of the casino
 * @param {string} tableName - Name/identifier of the table
 * @param {string} groupName - Optional custom name for the group
 * @returns {Promise<Object>} Result with group ID or error
 */
export async function createCalibrationGroup(casinoName, tableName, groupName = null) {
  if (!supabase) {
    return { success: false, error: 'Database not available' };
  }

  try {
    const { data, error } = await supabase
      .rpc('create_calibration_group', {
        p_casino_name: casinoName,
        p_table_name: tableName,
        p_group_name: groupName
      });

    if (error) {
      console.error('Error creating calibration group:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Calibration group created:', data);
    return { success: true, groupId: data };

  } catch (error) {
    console.error('Error in createCalibrationGroup:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get or create calibration group for a casino/table combination
 * @param {string} casinoName - Name of the casino
 * @param {string} tableName - Name/identifier of the table
 * @returns {Promise<Object>} Existing or new group
 */
export async function getOrCreateCalibrationGroup(casinoName, tableName) {
  if (!supabase) {
    return { success: false, error: 'Database not available' };
  }

  try {
    // First, try to find existing group
    const { data: existingGroups, error: searchError } = await supabase
      .from('calibration_groups')
      .select('*')
      .eq('casino_name', casinoName)
      .eq('table_name', tableName)
      .limit(1);

    if (searchError) {
      console.error('Error searching for existing group:', searchError);
      return { success: false, error: searchError.message };
    }

    if (existingGroups && existingGroups.length > 0) {
      console.log('📋 Using existing calibration group:', existingGroups[0].id);
      return { success: true, group: existingGroups[0], isNew: false };
    }

    // Create new group if none exists
    const createResult = await createCalibrationGroup(casinoName, tableName);
    if (!createResult.success) {
      return createResult;
    }

    // Fetch the newly created group
    const { data: newGroup, error: fetchError } = await supabase
      .from('calibration_groups')
      .select('*')
      .eq('id', createResult.groupId)
      .single();

    if (fetchError) {
      console.error('Error fetching new group:', fetchError);
      return { success: false, error: fetchError.message };
    }

    console.log('✨ Created new calibration group:', newGroup.id);
    return { success: true, group: newGroup, isNew: true };

  } catch (error) {
    console.error('Error in getOrCreateCalibrationGroup:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save a multi-angle calibration to a group
 * @param {string} groupId - ID of the calibration group
 * @param {Object} calibrationData - Calibration data
 * @param {string} angleIdentifier - Angle identifier (e.g., 'overhead', 'side45')
 * @param {number} qualityScore - Quality score for this calibration
 * @param {boolean} isPreferred - Whether this is the preferred angle
 * @returns {Promise<Object>} Result with calibration ID or error
 */
export async function saveMultiAngleCalibration(groupId, calibrationData, angleIdentifier, qualityScore, isPreferred = false) {
  if (!supabase) {
    return { success: false, error: 'Database not available' };
  }

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Insert the calibration
    const { data, error } = await supabase
      .from('wheel_calibrations')
      .insert([{
        user_id: user.id,
        table_group_id: groupId,
        angle_identifier: angleIdentifier,
        angle_quality_score: qualityScore,
        is_preferred_angle: isPreferred,
        casino_name: calibrationData.casinoName,
        table_name: calibrationData.tableName,
        camera_angle: calibrationData.cameraAngle,
        calibration_name: calibrationData.calibrationName,
        calibration_points: calibrationData.calibrationPoints,
        transformation_matrix: calibrationData.transformationMatrix,
        wheel_radius_pixels: calibrationData.wheelRadiusPixels
      }])
      .select()
      .single();

    if (error) {
      console.error('Error saving multi-angle calibration:', error);
      return { success: false, error: error.message };
    }

    // Update group angle count
    const { error: updateError } = await supabase
      .from('calibration_groups')
      .update({ 
        total_angles: supabase.raw('total_angles + 1'),
        preferred_angle_id: isPreferred ? data.id : supabase.raw('preferred_angle_id'),
        updated_at: new Date().toISOString()
      })
      .eq('id', groupId);

    if (updateError) {
      console.warn('Error updating group angle count:', updateError);
      // Don't fail the whole operation for this
    }

    console.log(`✅ Multi-angle calibration saved: ${angleIdentifier} (${qualityScore}%)`);
    return { success: true, calibrationId: data.id };

  } catch (error) {
    console.error('Error in saveMultiAngleCalibration:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all calibrations for a specific group
 * @param {string} groupId - ID of the calibration group
 * @returns {Promise<Array>} Array of calibrations for the group
 */
export async function getGroupCalibrations(groupId) {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('wheel_calibrations')
      .select(`
        *
      `)
      .eq('table_group_id', groupId)
      .order('angle_quality_score', { ascending: false });

    if (error) {
      console.error('Error getting group calibrations:', error);
      return [];
    }

    console.log(`📊 Retrieved ${data.length} calibrations for group ${groupId}`);
    return data;

  } catch (error) {
    console.error('Error in getGroupCalibrations:', error);
    return [];
  }
}

/**
 * Get calibration for a specific angle in a group
 * @param {string} groupId - ID of the calibration group
 * @param {string} angleIdentifier - Angle identifier
 * @returns {Promise<Object|null>} Calibration data or null
 */
export async function getAngleCalibration(groupId, angleIdentifier) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('wheel_calibrations')
      .select('*')
      .eq('table_group_id', groupId)
      .eq('angle_identifier', angleIdentifier)
      .order('angle_quality_score', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error getting angle calibration:', error);
      return null;
    }

    if (data && data.length > 0) {
      console.log(`🎯 Found calibration for angle ${angleIdentifier}`);
      return data[0];
    }

    return null;

  } catch (error) {
    console.error('Error in getAngleCalibration:', error);
    return null;
  }
}

/**
 * Get the best available calibration for a group (highest quality)
 * @param {string} groupId - ID of the calibration group
 * @returns {Promise<Object|null>} Best calibration or null
 */
export async function getBestCalibration(groupId) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('wheel_calibrations')
      .select('*')
      .eq('table_group_id', groupId)
      .order('angle_quality_score', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error getting best calibration:', error);
      return null;
    }

    if (data && data.length > 0) {
      console.log(`🌟 Best calibration: ${data[0].angle_identifier} (${data[0].angle_quality_score}%)`);
      return data[0];
    }

    return null;

  } catch (error) {
    console.error('Error in getBestCalibration:', error);
    return null;
  }
}

/**
 * Log an angle detection event
 * @param {string} groupId - ID of the calibration group
 * @param {string} detectedAngle - Detected angle identifier
 * @param {number} confidence - Detection confidence (0-1)
 * @param {number} qualityScore - Quality score (0-100)
 * @param {string} sessionId - Session identifier
 * @param {string} previousAngle - Previous angle (if any)
 * @param {number} switchDuration - Time since last switch (seconds)
 * @param {Object} metadata - Additional detection metadata
 * @returns {Promise<boolean>} Success status
 */
export async function logAngleDetection(groupId, detectedAngle, confidence, qualityScore, sessionId, previousAngle = null, switchDuration = null, metadata = null) {
  if (!supabase) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('angle_detection_log')
      .insert([{
        table_group_id: groupId,
        detected_angle: detectedAngle,
        confidence: confidence,
        quality_score: qualityScore,
        session_id: sessionId,
        previous_angle: previousAngle,
        switch_duration: switchDuration,
        detection_timestamp: new Date().toISOString()
      }]);

    if (error) {
      console.error('Error logging angle detection:', error);
      return false;
    }

    // Update last used angle in group
    const { error: updateError } = await supabase
      .from('calibration_groups')
      .update({ 
        last_used_angle: detectedAngle,
        updated_at: new Date().toISOString()
      })
      .eq('id', groupId);

    if (updateError) {
      console.warn('Error updating last used angle:', updateError);
      // Don't fail the whole operation for this
    }

    return true;

  } catch (error) {
    console.error('Error in logAngleDetection:', error);
    return false;
  }
}

/**
 * Get all calibration groups for the current user
 * @returns {Promise<Array>} Array of calibration groups
 */
export async function getUserCalibrationGroups() {
  if (!supabase) {
    return [];
  }

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.warn('User not authenticated for getUserCalibrationGroups');
      return [];
    }

    // Get all groups for the user
    const { data: groups, error: groupsError } = await supabase
      .from('calibration_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (groupsError) {
      console.error('Error getting user calibration groups:', groupsError);
      return [];
    }

    // For each group, get its calibrations
    const groupsWithCalibrations = await Promise.all(
      groups.map(async (group) => {
        const { data: calibrations, error: calibrationsError } = await supabase
          .from('wheel_calibrations')
          .select('*')
          .eq('table_group_id', group.id)
          .order('angle_quality_score', { ascending: false });

        if (calibrationsError) {
          console.error(`Error getting calibrations for group ${group.id}:`, calibrationsError);
          return {
            groupId: group.id,
            casinoName: group.casino_name,
            tableName: group.table_name,
            groupName: group.group_name,
            totalAngles: group.total_angles,
            preferredAngleId: group.preferred_angle_id,
            lastUsedAngle: group.last_used_angle,
            calibrations: []
          };
        }

        return {
          groupId: group.id,
          casinoName: group.casino_name,
          tableName: group.table_name,
          groupName: group.group_name,
          totalAngles: group.total_angles,
          preferredAngleId: group.preferred_angle_id,
          lastUsedAngle: group.last_used_angle,
          calibrations: calibrations.map(cal => ({
            id: cal.id,
            angleIdentifier: cal.angle_identifier,
            qualityScore: cal.angle_quality_score,
            calibrationName: cal.calibration_name,
            isPreferred: cal.is_preferred_angle,
            createdAt: cal.created_at
          }))
        };
      })
    );

    console.log(`📋 Retrieved ${groupsWithCalibrations.length} calibration groups`);
    return groupsWithCalibrations;

  } catch (error) {
    console.error('Error in getUserCalibrationGroups:', error);
    return [];
  }
}

/**
 * Update angle switching pattern for a group
 * @param {string} groupId - ID of the calibration group
 * @param {number} intervalSeconds - Average switching interval
 * @param {Array} angleSequence - Array of angle identifiers in order
 * @param {number} confidence - Pattern confidence (0-1)
 * @returns {Promise<boolean>} Success status
 */
export async function updateAngleSwitchingPattern(groupId, intervalSeconds, angleSequence, confidence) {
  if (!supabase) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('angle_switching_patterns')
      .upsert({
        table_group_id: groupId,
        switching_interval_seconds: intervalSeconds,
        angle_sequence: angleSequence,
        pattern_confidence: confidence,
        total_observations: 1,
        last_observed: new Date().toISOString()
      }, {
        onConflict: 'table_group_id'
      });

    if (error) {
      console.error('Error updating angle switching pattern:', error);
      return false;
    }

    console.log(`🔄 Updated switching pattern: ${angleSequence.join(' → ')} (${intervalSeconds}s)`);
    return true;

  } catch (error) {
    console.error('Error in updateAngleSwitchingPattern:', error);
    return false;
  }
}

/**
 * Get angle switching pattern for a group
 * @param {string} groupId - ID of the calibration group
 * @returns {Promise<Object|null>} Switching pattern or null
 */
export async function getAngleSwitchingPattern(groupId) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('angle_switching_patterns')
      .select('*')
      .eq('table_group_id', groupId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error getting angle switching pattern:', error);
      return null;
    }

    if (data) {
      console.log(`🔄 Retrieved switching pattern: ${data.angle_sequence?.join(' → ')}`);
      return data;
    }

    return null;

  } catch (error) {
    console.error('Error in getAngleSwitchingPattern:', error);
    return null;
  }
}

/**
 * Get angle detection statistics for a group
 * @param {string} groupId - ID of the calibration group
 * @param {number} hoursBack - How many hours back to analyze (default: 24)
 * @returns {Promise<Object>} Detection statistics
 */
export async function getAngleDetectionStats(groupId, hoursBack = 24) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('angle_detection_log')
      .select('*')
      .eq('table_group_id', groupId)
      .gte('detection_timestamp', new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString())
      .order('detection_timestamp', { ascending: false });

    if (error) {
      console.error('Error getting angle detection stats:', error);
      return null;
    }

    // Analyze the data
    const stats = {
      totalDetections: data.length,
      uniqueAngles: [...new Set(data.map(d => d.detected_angle))],
      averageConfidence: data.reduce((sum, d) => sum + d.confidence, 0) / data.length || 0,
      averageQuality: data.reduce((sum, d) => sum + (d.quality_score || 0), 0) / data.length || 0,
      angleCounts: {},
      switchFrequency: 0,
      lastDetection: data[0] || null
    };

    // Count detections per angle
    data.forEach(detection => {
      stats.angleCounts[detection.detected_angle] = 
        (stats.angleCounts[detection.detected_angle] || 0) + 1;
    });

    // Calculate switch frequency
    const switches = data.filter(d => d.previous_angle && d.previous_angle !== d.detected_angle);
    stats.switchFrequency = switches.length;

    console.log(`📊 Detection stats for last ${hoursBack}h: ${stats.totalDetections} detections, ${stats.switchFrequency} switches`);
    return stats;

  } catch (error) {
    console.error('Error in getAngleDetectionStats:', error);
    return null;
  }
}

/**
 * Find the best calibration for a detected angle, with fallback options
 * @param {string} groupId - ID of the calibration group
 * @param {string} detectedAngle - Currently detected angle
 * @param {number} qualityThreshold - Minimum quality threshold (default: 60)
 * @returns {Promise<Object>} Best available calibration with metadata
 */
export async function findBestCalibrationForAngle(groupId, detectedAngle, qualityThreshold = 60) {
  if (!supabase) {
    return { calibration: null, fallback: false, reason: 'Database not available' };
  }

  try {
    // First, try to get exact angle match
    let calibration = await getAngleCalibration(groupId, detectedAngle);
    
    if (calibration && calibration.angle_quality_score >= qualityThreshold) {
      return { 
        calibration, 
        fallback: false, 
        reason: `Exact match for ${detectedAngle}`,
        angleUsed: detectedAngle
      };
    }

    // If no exact match or quality too low, find best available
    const allCalibrations = await getGroupCalibrations(groupId);
    
    if (allCalibrations.length === 0) {
      return { 
        calibration: null, 
        fallback: false, 
        reason: 'No calibrations available for this group' 
      };
    }

    // Filter by quality threshold and sort by quality
    const qualityCalibrations = allCalibrations
      .filter(cal => cal.angle_quality_score >= qualityThreshold)
      .sort((a, b) => b.angle_quality_score - a.angle_quality_score);

    if (qualityCalibrations.length > 0) {
      const bestCalibration = qualityCalibrations[0];
      return {
        calibration: bestCalibration,
        fallback: bestCalibration.angle_identifier !== detectedAngle,
        reason: `Using best available: ${bestCalibration.angle_identifier} (${bestCalibration.angle_quality_score}%)`,
        angleUsed: bestCalibration.angle_identifier
      };
    }

    // Last resort: use any available calibration
    const lastResort = allCalibrations[0];
    return {
      calibration: lastResort,
      fallback: true,
      reason: `Last resort: ${lastResort.angle_identifier} (${lastResort.angle_quality_score}%) - below quality threshold`,
      angleUsed: lastResort.angle_identifier
    };

  } catch (error) {
    console.error('Error in findBestCalibrationForAngle:', error);
    return { calibration: null, fallback: false, reason: error.message };
  }
}

/**
 * Delete a calibration group and all its calibrations
 * @param {string} groupId - ID of the calibration group
 * @returns {Promise<boolean>} Success status
 */
export async function deleteCalibrationGroup(groupId) {
  if (!supabase) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('calibration_groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      console.error('Error deleting calibration group:', error);
      return false;
    }

    console.log(`🗑️ Deleted calibration group: ${groupId}`);
    return true;

  } catch (error) {
    console.error('Error in deleteCalibrationGroup:', error);
    return false;
  }
}

/**
 * Set preferred angle for a group
 * @param {string} groupId - ID of the calibration group
 * @param {string} calibrationId - ID of the calibration to set as preferred
 * @returns {Promise<boolean>} Success status
 */
export async function setPreferredAngle(groupId, calibrationId) {
  if (!supabase) {
    return false;
  }

  try {
    // First, clear all preferred flags in the group
    await supabase
      .from('wheel_calibrations')
      .update({ is_preferred_angle: false })
      .eq('table_group_id', groupId);

    // Set the new preferred calibration
    const { error: setError } = await supabase
      .from('wheel_calibrations')
      .update({ is_preferred_angle: true })
      .eq('id', calibrationId);

    if (setError) {
      console.error('Error setting preferred calibration:', setError);
      return false;
    }

    // Update the group's preferred angle reference
    const { error: groupError } = await supabase
      .from('calibration_groups')
      .update({ preferred_angle_id: calibrationId })
      .eq('id', groupId);

    if (groupError) {
      console.error('Error updating group preferred angle:', groupError);
      return false;
    }

    console.log(`⭐ Set preferred angle for group ${groupId}`);
    return true;

  } catch (error) {
    console.error('Error in setPreferredAngle:', error);
    return false;
  }
}

/**
 * Export calibration group data for backup
 * @param {string} groupId - ID of the calibration group
 * @returns {Promise<Object>} Exported data
 */
export async function exportCalibrationGroup(groupId) {
  if (!supabase) {
    return null;
  }

  try {
    // Get group info
    const { data: group, error: groupError } = await supabase
      .from('calibration_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupError) {
      console.error('Error getting group for export:', groupError);
      return null;
    }

    // Get all calibrations
    const calibrations = await getGroupCalibrations(groupId);

    // Get switching pattern
    const switchingPattern = await getAngleSwitchingPattern(groupId);

    // Get recent detection stats
    const detectionStats = await getAngleDetectionStats(groupId, 168); // Last week

    const exportData = {
      group,
      calibrations,
      switchingPattern,
      detectionStats,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    console.log(`📤 Exported calibration group: ${group.casino_name} - ${group.table_name}`);
    return exportData;

  } catch (error) {
    console.error('Error in exportCalibrationGroup:', error);
    return null;
  }
}

/**
 * Import calibration group data from backup
 * @param {Object} importData - Previously exported data
 * @returns {Promise<Object>} Import result
 */
export async function importCalibrationGroup(importData) {
  if (!supabase || !importData.group) {
    return { success: false, error: 'Invalid import data or database not available' };
  }

  try {
    const { group, calibrations, switchingPattern } = importData;

    // Create new group
    const groupResult = await createCalibrationGroup(
      group.casino_name,
      group.table_name,
      group.group_name + ' (Imported)'
    );

    if (!groupResult.success) {
      return groupResult;
    }

    const newGroupId = groupResult.groupId;
    let importedCount = 0;

    // Import calibrations
    for (const calibration of calibrations) {
      const calibrationData = {
        casinoName: calibration.casino_name,
        tableName: calibration.table_name,
        cameraAngle: calibration.camera_angle,
        calibrationName: calibration.calibration_name,
        calibrationPoints: calibration.calibration_points,
        transformationMatrix: calibration.transformation_matrix,
        wheelRadiusPixels: calibration.wheel_radius_pixels
      };

      const result = await saveMultiAngleCalibration(
        newGroupId,
        calibrationData,
        calibration.angle_identifier,
        calibration.angle_quality_score,
        calibration.is_preferred_angle
      );

      if (result.success) {
        importedCount++;
      }
    }

    // Import switching pattern if available
    if (switchingPattern) {
      await updateAngleSwitchingPattern(
        newGroupId,
        switchingPattern.switching_interval_seconds,
        switchingPattern.angle_sequence,
        switchingPattern.pattern_confidence
      );
    }

    console.log(`📥 Imported calibration group: ${importedCount}/${calibrations.length} calibrations`);
    return { 
      success: true, 
      groupId: newGroupId, 
      importedCalibrations: importedCount,
      totalCalibrations: calibrations.length
    };

  } catch (error) {
    console.error('Error in importCalibrationGroup:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get calibration group statistics for dashboard
 * @returns {Promise<Object>} Overall statistics
 */
export async function getCalibrationGroupStats() {

  
  if (!supabase) {
    return null;
  }

  try {
    const groups = await getUserCalibrationGroups();
    
    const stats = {
      totalGroups: groups.length,
      totalCalibrations: groups.reduce((sum, g) => sum + g.calibrations.length, 0),
      averageAnglesPerGroup: 0,
      topCasinos: {},
      qualityDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
      angleTypeDistribution: {}
    };

    if (groups.length > 0) {
      stats.averageAnglesPerGroup = stats.totalCalibrations / groups.length;
    }

    // Analyze groups
    groups.forEach(group => {
      // Count casinos
      stats.topCasinos[group.casinoName] = (stats.topCasinos[group.casinoName] || 0) + 1;

      // Analyze calibration quality and types
      group.calibrations.forEach(cal => {
        // Quality distribution
        if (cal.qualityScore >= 90) stats.qualityDistribution.excellent++;
        else if (cal.qualityScore >= 75) stats.qualityDistribution.good++;
        else if (cal.qualityScore >= 60) stats.qualityDistribution.fair++;
        else stats.qualityDistribution.poor++;

        // Angle type distribution
        stats.angleTypeDistribution[cal.angleIdentifier] = 
          (stats.angleTypeDistribution[cal.angleIdentifier] || 0) + 1;
      });
    });

    console.log(`📈 Calibration stats: ${stats.totalGroups} groups, ${stats.totalCalibrations} calibrations`);
    return stats;

  } catch (error) {
    console.error('Error in getCalibrationGroupStats:', error);
    return null;
  }
}

// Debug function to test database connection and table existence
// Add this temporarily to your multiAngleDatabase.js file for testing

/**
 * Debug function to test database connection and operations
 * @returns {Promise<Object>} Debug information
 */
export async function debugDatabaseConnection() {
  console.log('🔍 Starting database debug...');
  
  const debugInfo = {
    supabaseAvailable: !!supabase,
    userAuthenticated: false,
    userInfo: null,
    tablesAccessible: {},
    errors: []
  };

  try {
    // Test 1: Check if supabase is available
    if (!supabase) {
      debugInfo.errors.push('Supabase client not available');
      return debugInfo;
    }
    
    console.log('✅ Supabase client is available');

    // Test 2: Check user authentication
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        debugInfo.errors.push(`User auth error: ${userError.message}`);
      } else if (user) {
        debugInfo.userAuthenticated = true;
        debugInfo.userInfo = {
          id: user.id,
          email: user.email,
          role: user.role
        };
        console.log('✅ User authenticated:', user.email);
      } else {
        debugInfo.errors.push('No user found - not authenticated');
      }
    } catch (authError) {
      debugInfo.errors.push(`Auth check failed: ${authError.message}`);
    }

    // Test 3: Check table access (wheel_calibrations - should exist)
    try {
      console.log('🔍 Testing wheel_calibrations table access...');
      const { data, error } = await supabase
        .from('wheel_calibrations')
        .select('count')
        .limit(1);
      
      if (error) {
        debugInfo.tablesAccessible.wheel_calibrations = false;
        debugInfo.errors.push(`wheel_calibrations error: ${error.message}`);
      } else {
        debugInfo.tablesAccessible.wheel_calibrations = true;
        console.log('✅ wheel_calibrations table accessible');
      }
    } catch (tableError) {
      debugInfo.tablesAccessible.wheel_calibrations = false;
      debugInfo.errors.push(`wheel_calibrations exception: ${tableError.message}`);
    }

    // Test 4: Check calibration_groups table
    try {
      console.log('🔍 Testing calibration_groups table access...');
      const { data, error } = await supabase
        .from('calibration_groups')
        .select('count')
        .limit(1);
      
      if (error) {
        debugInfo.tablesAccessible.calibration_groups = false;
        debugInfo.errors.push(`calibration_groups error: ${error.message}`);
        console.error('❌ calibration_groups table error:', error);
      } else {
        debugInfo.tablesAccessible.calibration_groups = true;
        console.log('✅ calibration_groups table accessible');
      }
    } catch (tableError) {
      debugInfo.tablesAccessible.calibration_groups = false;
      debugInfo.errors.push(`calibration_groups exception: ${tableError.message}`);
      console.error('❌ calibration_groups table exception:', tableError);
    }

    // Test 5: Try a simple insert if everything looks good
    if (debugInfo.userAuthenticated && debugInfo.tablesAccessible.calibration_groups) {
      try {
        console.log('🔍 Testing calibration_groups insert...');
        const { data, error } = await supabase
          .from('calibration_groups')
          .insert([{
            user_id: debugInfo.userInfo.id,
            casino_name: 'TEST_CASINO',
            table_name: 'TEST_TABLE',
            group_name: 'Debug Test Group',
            total_angles: 0
          }])
          .select()
          .single();

        if (error) {
          debugInfo.errors.push(`Insert test failed: ${error.message}`);
          console.error('❌ Insert test failed:', error);
        } else {
          console.log('✅ Insert test successful, created group:', data.id);
          
          // Clean up the test record
          await supabase
            .from('calibration_groups')
            .delete()
            .eq('id', data.id);
          
          console.log('✅ Test record cleaned up');
        }
      } catch (insertError) {
        debugInfo.errors.push(`Insert test exception: ${insertError.message}`);
        console.error('❌ Insert test exception:', insertError);
      }
    }

  } catch (globalError) {
    debugInfo.errors.push(`Global error: ${globalError.message}`);
    console.error('❌ Global debug error:', globalError);
  }

  console.log('🔍 Debug complete:', debugInfo);
  return debugInfo;
}

// Call this function to test your database connection
export async function testDatabaseConnection() {
  const debugResult = await debugDatabaseConnection();
  
  console.log('=== DATABASE DEBUG RESULTS ===');
  console.log('Supabase Available:', debugResult.supabaseAvailable);
  console.log('User Authenticated:', debugResult.userAuthenticated);
  if (debugResult.userInfo) {
    console.log('User:', debugResult.userInfo.email);
  }
  console.log('Table Access:', debugResult.tablesAccessible);
  
  if (debugResult.errors.length > 0) {
    console.log('=== ERRORS FOUND ===');
    debugResult.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
  } else {
    console.log('✅ No errors found!');
  }
  
  return debugResult;
}

export default {
  createCalibrationGroup,
  getOrCreateCalibrationGroup,
  saveMultiAngleCalibration,
  getGroupCalibrations,
  getAngleCalibration,
  getBestCalibration,
  logAngleDetection,
  getUserCalibrationGroups,
  updateAngleSwitchingPattern,
  getAngleSwitchingPattern,
  getAngleDetectionStats,
  findBestCalibrationForAngle,
  deleteCalibrationGroup,
  setPreferredAngle,
  exportCalibrationGroup,
  importCalibrationGroup,
  getCalibrationGroupStats,
  testDatabaseConnection,
  debugDatabaseConnection
};