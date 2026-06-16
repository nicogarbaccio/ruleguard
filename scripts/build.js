/**
 * Build Script
 * Copies vendor dependencies into the extension directory for packaging,
 * including the full Tesseract.js stack so local (offline) OCR works with no
 * external/CDN calls at runtime.
 *
 * Run: node scripts/build.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'vendor');
const TESSDATA_DIR = path.join(VENDOR_DIR, 'tessdata');
const CORE_DIR = path.join(VENDOR_DIR, 'tesseract-core');
const NODE_MODULES = path.join(ROOT, 'node_modules');

for (const dir of [VENDOR_DIR, TESSDATA_DIR, CORE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Plain file copies from node_modules to vendor.
const vendorFiles = [
  { src: 'pdfjs-dist/build/pdf.min.js', dest: 'pdf.min.js' },
  { src: 'pdfjs-dist/build/pdf.worker.min.js', dest: 'pdf.worker.min.js' },
  { src: 'jspdf/dist/jspdf.umd.min.js', dest: 'jspdf.umd.min.js' },
  // Tesseract.js main library + web worker.
  { src: 'tesseract.js/dist/tesseract.min.js', dest: 'tesseract.min.js' },
  { src: 'tesseract.js/dist/worker.min.js', dest: 'tesseract-worker.min.js' }
];

// Tesseract core (WASM) files go into vendor/tesseract-core/.
const coreFiles = [
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm'
];

console.log('Building GLI Compliance Analyzer...\n');

let copied = 0;
let skipped = 0;

function copy(srcRel, destAbs, label) {
  const srcPath = path.join(NODE_MODULES, srcRel);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destAbs);
    console.log(`  ✓ Copied: ${label}`);
    copied++;
  } else {
    console.log(`  ⚠ Not found: ${srcRel} (run npm install first)`);
    skipped++;
  }
}

for (const file of vendorFiles) {
  copy(file.src, path.join(VENDOR_DIR, file.dest), file.dest);
}

for (const name of coreFiles) {
  copy(path.join('tesseract.js-core', name), path.join(CORE_DIR, name), `tesseract-core/${name}`);
}

// English training data — required for fully offline OCR. Tesseract would
// otherwise fetch this from a CDN at runtime, which breaks the offline goal.
const TRAINEDDATA = path.join(TESSDATA_DIR, 'eng.traineddata.gz');
const TRAINEDDATA_URL =
  'https://github.com/naptha/tessdata/raw/gh-pages/4.0.0_fast/eng.traineddata.gz';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location); // follow redirect
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} fetching ${u}`));
          return;
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
      }).on('error', reject);
    };
    request(url);
  });
}

async function main() {
  if (fs.existsSync(TRAINEDDATA)) {
    console.log('  ✓ eng.traineddata.gz already present');
  } else {
    process.stdout.write('  … downloading eng.traineddata.gz (one-time, for offline OCR)... ');
    try {
      await download(TRAINEDDATA_URL, TRAINEDDATA);
      console.log('done');
      copied++;
    } catch (e) {
      console.log(`failed (${e.message})`);
      console.log('    Local OCR will not work until vendor/tessdata/eng.traineddata.gz exists.');
      skipped++;
    }
  }

  console.log(`\nBuild complete: ${copied} copied, ${skipped} skipped.`);
  if (skipped > 0) {
    console.log('\nRun "npm install" to install dependencies, then re-run this script.');
  }
}

main();
