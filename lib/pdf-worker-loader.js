/**
 * PDF.js Worker Loader
 * Sets up the PDF.js worker for the extension context.
 * This script is loaded before the main popup module.
 */

// PDF.js will be loaded from the vendor directory
// The worker is configured in pdf-processor.js
window.PDFJS_WORKER_SRC = '../vendor/pdf.worker.min.js';
