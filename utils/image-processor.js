/**
 * Image Processor
 * Handles image loading, preprocessing, and OCR text extraction.
 */

export class ImageProcessor {
  constructor() {
    this.tesseractWorker = null;
    this.maxImageSize = 2048; // Max dimension for API submission
    this.compressionQuality = 0.85;
  }

  /**
   * Process an image file for AI analysis.
   * Resizes and compresses the image, returns base64 data URL.
   * @param {File} file - Image file to process
   * @returns {string} Base64 data URL of the processed image
   */
  async processImage(file) {
    const img = await this.loadImage(file);
    const canvas = this.resizeImage(img);
    return canvas.toDataURL('image/jpeg', this.compressionQuality);
  }

  /**
   * Extract text from an image using Tesseract.js OCR.
   * @param {File} file - Image file to extract text from
   * @returns {string} Extracted text
   */
  async extractText(file) {
    try {
      const worker = await this.getOCRWorker();
      const imageUrl = URL.createObjectURL(file);

      const { data } = await worker.recognize(imageUrl);
      URL.revokeObjectURL(imageUrl);

      return data.text || '';
    } catch (error) {
      console.warn('OCR extraction failed:', error);
      return '';
    }
  }

  /**
   * Get or create the Tesseract.js worker.
   */
  async getOCRWorker() {
    if (this.tesseractWorker) return this.tesseractWorker;

    // Dynamically import Tesseract.js
    const Tesseract = await import('../vendor/tesseract.min.js');

    this.tesseractWorker = await Tesseract.createWorker('eng', 1, {
      workerPath: '../vendor/tesseract-worker.min.js',
      corePath: '../vendor/tesseract-core-simd.wasm.js',
      langPath: '../vendor/tessdata',
      cacheMethod: 'none' // Don't cache in extension context
    });

    return this.tesseractWorker;
  }

  /**
   * Load an image file into an HTMLImageElement.
   * @param {File} file - Image file
   * @returns {HTMLImageElement}
   */
  loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load image: ${file.name}`));
      };

      img.src = url;
    });
  }

  /**
   * Resize an image to fit within maxImageSize while maintaining aspect ratio.
   * @param {HTMLImageElement} img - Source image
   * @returns {HTMLCanvasElement} Resized canvas
   */
  resizeImage(img) {
    let { width, height } = img;

    // Scale down if needed
    if (width > this.maxImageSize || height > this.maxImageSize) {
      const ratio = Math.min(this.maxImageSize / width, this.maxImageSize / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    return canvas;
  }

  /**
   * Preprocess image for better OCR accuracy.
   * Applies grayscale conversion and contrast enhancement.
   * @param {HTMLImageElement} img - Source image
   * @returns {HTMLCanvasElement} Preprocessed canvas
   */
  preprocessForOCR(img) {
    const canvas = this.resizeImage(img);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Convert to grayscale and enhance contrast
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

      // Simple threshold for better OCR
      const enhanced = gray > 128 ? 255 : 0;

      data[i] = enhanced;
      data[i + 1] = enhanced;
      data[i + 2] = enhanced;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  /**
   * Terminate the OCR worker to free resources.
   */
  async terminate() {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }
}
