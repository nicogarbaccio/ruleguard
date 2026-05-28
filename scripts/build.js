/**
 * Build Script
 * Copies vendor dependencies into the extension directory for packaging.
 * Run: node scripts/build.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'vendor');
const NODE_MODULES = path.join(ROOT, 'node_modules');

// Ensure vendor directory exists
if (!fs.existsSync(VENDOR_DIR)) {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
}

// Files to copy from node_modules to vendor
const vendorFiles = [
  {
    src: 'pdfjs-dist/build/pdf.min.js',
    dest: 'pdf.min.js'
  },
  {
    src: 'pdfjs-dist/build/pdf.worker.min.js',
    dest: 'pdf.worker.min.js'
  },
  {
    src: 'jspdf/dist/jspdf.umd.min.js',
    dest: 'jspdf.umd.min.js'
  }
];

console.log('Building GLI Compliance Analyzer...\n');

let copied = 0;
let skipped = 0;

for (const file of vendorFiles) {
  const srcPath = path.join(NODE_MODULES, file.src);
  const destPath = path.join(VENDOR_DIR, file.dest);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`  ✓ Copied: ${file.dest}`);
    copied++;
  } else {
    console.log(`  ⚠ Not found: ${file.src} (run npm install first)`);
    skipped++;
  }
}

// Create a minimal Tesseract.js stub if the full library isn't available
// In production, you'd bundle the actual Tesseract.js files
const tesseractStubPath = path.join(VENDOR_DIR, 'tesseract.min.js');
if (!fs.existsSync(tesseractStubPath)) {
  const stub = `
/**
 * Tesseract.js Stub
 * Replace with actual tesseract.min.js from node_modules/tesseract.js/dist/
 * For the extension, you'll need:
 * - tesseract.min.js
 * - tesseract-worker.min.js  
 * - tesseract-core-simd.wasm.js
 * - tessdata/eng.traineddata.gz
 */
export async function createWorker(lang, oem, options) {
  console.warn('Tesseract.js stub loaded. Install full library for OCR support.');
  return {
    recognize: async () => ({ data: { text: '[OCR not available - install Tesseract.js]' } }),
    terminate: async () => {}
  };
}
`;
  fs.writeFileSync(tesseractStubPath, stub.trim());
  console.log('  ℹ Created Tesseract.js stub (replace with real library for OCR)');
}

console.log(`\nBuild complete: ${copied} copied, ${skipped} skipped.`);

if (skipped > 0) {
  console.log('\nRun "npm install" to install dependencies, then re-run this script.');
}
