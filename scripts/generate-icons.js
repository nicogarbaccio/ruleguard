/**
 * Icon Generator
 * Creates PNG icons from an SVG template for the Chrome extension.
 * Run: node scripts/generate-icons.js
 * 
 * Note: This creates simple placeholder icons. Replace with proper branding.
 */

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.resolve(__dirname, '..', 'assets', 'icons');

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

// Create a simple SVG icon
function createSVGIcon(size) {
  const padding = Math.round(size * 0.1);
  const shieldSize = size - padding * 2;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#2563eb"/>
  <g transform="translate(${padding}, ${padding})">
    <path d="${getShieldPath(shieldSize)}" fill="white" opacity="0.95"/>
    <path d="${getCheckPath(shieldSize)}" fill="#2563eb" stroke="#2563eb" stroke-width="${Math.max(1, size / 16)}"/>
  </g>
</svg>`;
}

function getShieldPath(size) {
  const cx = size / 2;
  const top = size * 0.05;
  const bottom = size * 0.9;
  const mid = size * 0.55;
  const width = size * 0.4;
  
  return `M${cx},${top} L${cx + width},${size * 0.2} L${cx + width},${mid} C${cx + width},${bottom * 0.85} ${cx},${bottom} ${cx},${bottom} C${cx},${bottom} ${cx - width},${bottom * 0.85} ${cx - width},${mid} L${cx - width},${size * 0.2} Z`;
}

function getCheckPath(size) {
  const cx = size / 2;
  const cy = size * 0.5;
  const s = size * 0.15;
  
  return `M${cx - s},${cy} L${cx - s * 0.3},${cy + s * 0.7} L${cx + s},${cy - s * 0.5}`;
}

// Generate icons at required sizes
const sizes = [16, 48, 128];

for (const size of sizes) {
  const svg = createSVGIcon(size);
  const svgPath = path.join(ICONS_DIR, `icon${size}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`Created: icon${size}.svg`);
}

// Create a simple 1x1 PNG as placeholder (Chrome needs actual PNGs)
// In production, convert SVGs to PNGs using a tool like sharp or canvas
function createMinimalPNG(size) {
  // Minimal valid PNG with blue background
  // This is a placeholder - use proper PNG conversion in production
  const header = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A  // PNG signature
  ]);
  
  // For now, just note that proper icons are needed
  return null;
}

console.log('\nNote: SVG icons created. For Chrome extension, convert to PNG using:');
console.log('  - Online: https://convertio.co/svg-png/');
console.log('  - CLI: npx svg2png-many assets/icons/');
console.log('  - Or use any image editor to export at 16x16, 48x48, and 128x128');
