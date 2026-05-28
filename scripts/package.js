/**
 * Package Script
 * Creates a distributable .zip of the Chrome extension.
 * Run: node scripts/package.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const PACKAGE_NAME = 'gli-compliance-analyzer';

// Files and directories to include in the package
const includes = [
  'manifest.json',
  'popup/',
  'background/',
  'content/',
  'lib/',
  'utils/',
  'assets/',
  'vendor/',
  'options/'
];

// Files to exclude
const excludes = [
  '*.map',
  '.gitkeep',
  '*.test.js'
];

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
const zipName = `${PACKAGE_NAME}-v${version}.zip`;
const zipPath = path.join(DIST_DIR, zipName);

// Remove old zip if exists
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Create zip using system zip command
const includeArgs = includes.join(' ');
const excludeArgs = excludes.map(e => `-x '${e}'`).join(' ');

try {
  execSync(`zip -r "${zipPath}" ${includeArgs} ${excludeArgs}`, {
    cwd: ROOT,
    stdio: 'pipe'
  });
  
  const stats = fs.statSync(zipPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  
  console.log(`\n✓ Extension packaged successfully!`);
  console.log(`  File: ${zipPath}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`  Version: ${version}`);
} catch (error) {
  console.error('Failed to create package:', error.message);
  process.exit(1);
}
