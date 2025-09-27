// src/utils/opticalDatabase.js
// Database utilities for optical calibration data

import { supabase } from '../lib/supabase';

/**
 * Save wheel calibration to Supabase
 * @param {Object} calibrationData - Calibration data to save
 * @returns {Promise<Object>} Success status and saved data
 */
export async function saveWheelCalibration(calibrationData) {
  if (!supabase) {
    console.warn('Supabase not configured - calibration not saved');
    return { success: false, error: 'Database not available' };
  }

  try {
    // Get current user ID
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    const calibrationRecord = {
      user_id: user.id,
      casino_name: calibrationData.casinoName,
      table_name: calibrationData.tableName,
      camera_angle: calibrationData.cameraAngle,
      calibration_name: calibrationData.calibrationName,
      calibration_points: calibrationData.calibrationPoints, // Array of 4 {x, y} points
      transformation_matrix: calibrationData.transformationMatrix,
      wheel_radius_pixels: calibrationData.wheelRadiusPixels
    };

    const { data, error } = await supabase
      .from('wheel_calibrations')
      .insert([calibrationRecord])
      .select()
      .single();

    if (error) {
      console.error('Error saving calibration:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Calibration saved successfully:', data.id);
    return { success: true, data };

  } catch (error) {
    console.error('Error in saveWheelCalibration:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all wheel calibrations for current user
 * @returns {Promise<Array>} Array of calibration records
 */
export async function getUserCalibrations() {
  if (!supabase) {
    console.warn('Supabase not configured - no calibrations available');
    return [];
  }

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.warn('User not authenticated');
      return [];
    }

    const { data, error } = await supabase
      .from('wheel_calibrations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching calibrations:', error);
      return [];
    }

    console.log(`📊 Retrieved ${data.length} calibrations`);
    return data;

  } catch (error) {
    console.error('Error in getUserCalibrations:', error);
    return [];
  }
}

/**
 * Delete a wheel calibration
 * @param {string} calibrationId - ID of calibration to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteWheelCalibration(calibrationId) {
  if (!supabase) {
    console.warn('Supabase not configured');
    return false;
  }

  try {
    const { error } = await supabase
      .from('wheel_calibrations')
      .delete()
      .eq('id', calibrationId);

    if (error) {
      console.error('Error deleting calibration:', error);
      return false;
    }

    console.log('🗑️ Calibration deleted successfully');
    return true;

  } catch (error) {
    console.error('Error in deleteWheelCalibration:', error);
    return false;
  }
}

/**
 * Update an existing wheel calibration
 * @param {string} calibrationId - ID of calibration to update
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Success status and updated data
 */
export async function updateWheelCalibration(calibrationId, updateData) {
  if (!supabase) {
    console.warn('Supabase not configured');
    return { success: false, error: 'Database not available' };
  }

  try {
    const { data, error } = await supabase
      .from('wheel_calibrations')
      .update(updateData)
      .eq('id', calibrationId)
      .select()
      .single();

    if (error) {
      console.error('Error updating calibration:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Calibration updated successfully');
    return { success: true, data };

  } catch (error) {
    console.error('Error in updateWheelCalibration:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get calibration statistics for user
 * @returns {Promise<Object>} Calibration statistics
 */
export async function getCalibrationStats() {
  if (!supabase) {
    return { totalCalibrations: 0, casinos: [], tables: [] };
  }

  try {
    const calibrations = await getUserCalibrations();
    
    const uniqueCasinos = [...new Set(calibrations.map(c => c.casino_name))];
    const uniqueTables = [...new Set(calibrations.map(c => `${c.casino_name} - ${c.table_name}`))];

    return {
      totalCalibrations: calibrations.length,
      casinos: uniqueCasinos,
      tables: uniqueTables,
      mostRecentCalibration: calibrations[0] || null
    };

  } catch (error) {
    console.error('Error in getCalibrationStats:', error);
    return { totalCalibrations: 0, casinos: [], tables: [] };
  }
}