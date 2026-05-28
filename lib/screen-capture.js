/**
 * Screen Capture Module
 * Handles screen sharing via getDisplayMedia and frame capture.
 */

export class ScreenCapture {
  constructor() {
    this.stream = null;
    this.videoElement = null;
    this.capturedFrames = [];
    this.isCapturing = false;
  }

  /**
   * Start screen sharing. Prompts the user to select a screen/window/tab.
   * @returns {boolean} Whether capture started successfully
   */
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'never',
          displaySurface: 'monitor'
        },
        audio: false
      });

      // Create a hidden video element to render the stream
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.stream;
      this.videoElement.muted = true;
      await this.videoElement.play();

      this.isCapturing = true;
      this.capturedFrames = [];

      // Listen for the user stopping the share via browser UI
      this.stream.getVideoTracks()[0].addEventListener('ended', () => {
        this.isCapturing = false;
      });

      return true;
    } catch (error) {
      console.error('Screen capture failed:', error);
      // User cancelled the picker or permission denied
      return false;
    }
  }

  /**
   * Capture the current frame from the screen share.
   * @returns {string|null} Base64 data URL of the captured frame
   */
  captureFrame() {
    if (!this.isCapturing || !this.videoElement) return null;

    const canvas = document.createElement('canvas');
    const video = this.videoElement;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    this.capturedFrames.push({
      dataUrl,
      timestamp: Date.now(),
      width: canvas.width,
      height: canvas.height
    });

    return dataUrl;
  }

  /**
   * Get a thumbnail of the current stream (for preview).
   * @param {number} width - Thumbnail width
   * @returns {string|null} Base64 data URL of thumbnail
   */
  getThumbnail(width = 180) {
    if (!this.isCapturing || !this.videoElement) return null;

    const video = this.videoElement;
    const aspectRatio = video.videoHeight / video.videoWidth;
    const height = Math.round(width * aspectRatio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', 0.6);
  }

  /**
   * Stop the screen capture and release resources.
   * @returns {Array} All captured frames
   */
  stop() {
    this.isCapturing = false;

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    return this.capturedFrames;
  }

  /**
   * Get the number of captured frames.
   */
  get frameCount() {
    return this.capturedFrames.length;
  }

  /**
   * Get all captured frames.
   */
  get frames() {
    return this.capturedFrames;
  }

  /**
   * Check if screen capture is supported in this browser.
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  }
}
