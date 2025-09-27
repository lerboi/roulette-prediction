// src/utils/screenCapture.js
// Screen capture utilities for optical monitoring

/**
 * Check if screen capture is supported
 * @returns {boolean} Whether screen capture is available
 */
export function isScreenCaptureSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}

/**
 * Start screen capture
 * @param {Object} options - Capture options
 * @returns {Promise<MediaStream>} Video stream from screen capture
 */
export async function startScreenCapture(options = {}) {
  if (!isScreenCaptureSupported()) {
    throw new Error('Screen capture not supported in this browser');
  }

  const defaultOptions = {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 20, max: 30 }
    },
    audio: false // We don't need audio for roulette tracking
  };

  const captureOptions = {
    ...defaultOptions,
    ...options
  };

  try {
    console.log('🎥 Starting screen capture...');
    const stream = await navigator.mediaDevices.getDisplayMedia(captureOptions);
    
    console.log('✅ Screen capture started successfully');
    console.log('📺 Stream details:', {
      videoTracks: stream.getVideoTracks().length,
      resolution: `${stream.getVideoTracks()[0]?.getSettings().width}x${stream.getVideoTracks()[0]?.getSettings().height}`,
      frameRate: stream.getVideoTracks()[0]?.getSettings().frameRate
    });

    return stream;

  } catch (error) {
    console.error('❌ Screen capture failed:', error);
    
    // Provide user-friendly error messages
    if (error.name === 'NotAllowedError') {
      throw new Error('Screen capture permission denied. Please allow screen sharing and try again.');
    } else if (error.name === 'NotFoundError') {
      throw new Error('No screen or window selected for capture.');
    } else if (error.name === 'NotSupportedError') {
      throw new Error('Screen capture not supported in this browser.');
    } else {
      throw new Error(`Screen capture failed: ${error.message}`);
    }
  }
}

/**
 * Stop screen capture
 * @param {MediaStream} stream - Stream to stop
 */
export function stopScreenCapture(stream) {
  if (stream) {
    console.log('🛑 Stopping screen capture...');
    stream.getTracks().forEach(track => {
      track.stop();
      console.log(`Track stopped: ${track.kind}`);
    });
    console.log('✅ Screen capture stopped');
  }
}

/**
 * Get video stream metadata
 * @param {MediaStream} stream - Video stream
 * @returns {Object} Stream metadata
 */
export function getStreamMetadata(stream) {
  if (!stream || stream.getVideoTracks().length === 0) {
    return null;
  }

  const videoTrack = stream.getVideoTracks()[0];
  const settings = videoTrack.getSettings();
  
  return {
    width: settings.width,
    height: settings.height,
    frameRate: settings.frameRate,
    aspectRatio: settings.aspectRatio,
    deviceId: settings.deviceId,
    label: videoTrack.label
  };
}

/**
 * Create video element from stream
 * @param {MediaStream} stream - Video stream
 * @param {Object} options - Video element options
 * @returns {HTMLVideoElement} Video element
 */
export function createVideoElement(stream, options = {}) {
  const video = document.createElement('video');
  
  // Set default properties
  video.srcObject = stream;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  
  // Apply custom options
  Object.assign(video, options);
  
  return video;
}

/**
 * Capture frame from video stream
 * @param {HTMLVideoElement} video - Video element
 * @param {HTMLCanvasElement} canvas - Canvas to draw frame on
 * @returns {ImageData} Frame image data
 */
export function captureFrame(video, canvas) {
  if (!video || !canvas) {
    throw new Error('Video and canvas elements are required');
  }

  const ctx = canvas.getContext('2d');
  
  // Set canvas size to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Draw current video frame to canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Get image data
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Check if video is ready for processing
 * @param {HTMLVideoElement} video - Video element
 * @returns {boolean} Whether video is ready
 */
export function isVideoReady(video) {
  return video && 
         video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
         video.videoWidth > 0 && 
         video.videoHeight > 0;
}

/**
 * Get optimal canvas size for processing
 * @param {number} videoWidth - Original video width
 * @param {number} videoHeight - Original video height
 * @param {number} maxWidth - Maximum processing width
 * @returns {Object} Optimal canvas dimensions
 */
export function getOptimalCanvasSize(videoWidth, videoHeight, maxWidth = 1280) {
  if (videoWidth <= maxWidth) {
    return { width: videoWidth, height: videoHeight };
  }
  
  const aspectRatio = videoHeight / videoWidth;
  const optimalWidth = maxWidth;
  const optimalHeight = Math.round(optimalWidth * aspectRatio);
  
  return { width: optimalWidth, height: optimalHeight };
}