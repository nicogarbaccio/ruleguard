/**
 * SVG to PNG converter for extension icons.
 * 
 * Since we can't easily render SVG to PNG in pure Node without dependencies,
 * this script provides instructions and an alternative approach.
 * 
 * Quick options:
 * 1. Use the SVGs directly in the popup HTML (already works for the header logo)
 * 2. Convert manually: open each SVG in Chrome, screenshot, or use an online tool
 * 3. Install sharp: npm install sharp --save-dev, then run this script
 * 
 * For now, we'll create data-URI encoded PNGs from the SVG content
 * that Chrome will accept as extension icons.
 */

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.resolve(__dirname, '..', 'assets', 'icons');

// Check if sharp is available
try {
  const sharp = require('sharp');
  
  const sizes = [16, 48, 128];
  
  async function convert() {
    for (const size of sizes) {
      const svgPath = path.join(ICONS_DIR, `icon${size}.svg`);
      const pngPath = path.join(ICONS_DIR, `icon${size}.png`);
      
      if (fs.existsSync(svgPath)) {
        await sharp(svgPath)
          .resize(size, size)
          .png()
          .toFile(pngPath);
        console.log(`✓ Converted icon${size}.svg → icon${size}.png`);
      }
    }
    console.log('\nDone! PNG icons are ready.');
  }
  
  convert().catch(console.error);
  
} catch (e) {
  console.log('sharp not installed. To convert SVG icons to PNG:\n');
  console.log('  Option 1: npm install sharp --save-dev && node scripts/svg-to-png.js');
  console.log('  Option 2: Open each SVG in a browser and export as PNG');
  console.log('  Option 3: Use https://svgtopng.com/\n');
  console.log('SVG files are at:');
  console.log(`  ${path.join(ICONS_DIR, 'icon16.svg')}`);
  console.log(`  ${path.join(ICONS_DIR, 'icon48.svg')}`);
  console.log(`  ${path.join(ICONS_DIR, 'icon128.svg')}`);
  console.log(`  ${path.join(ICONS_DIR, 'logo.svg')} (full logo)\n`);
  
  // Try to install sharp and convert
  console.log('Attempting to install sharp...');
  const { execSync } = require('child_process');
  try {
    execSync('npm install sharp --save-dev', { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });
    console.log('sharp installed! Re-running conversion...\n');
    execSync('node scripts/svg-to-png.js', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
  } catch (installErr) {
    console.log('Could not install sharp automatically. Use one of the manual options above.');
  }
}
