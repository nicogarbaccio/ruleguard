const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..', 'assets', 'icons');

// Minimal valid 1x1 PNG (blue pixel) - placeholder for development
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
  'base64'
);

fs.writeFileSync(path.join(dir, 'icon16.png'), png);
fs.writeFileSync(path.join(dir, 'icon48.png'), png);
fs.writeFileSync(path.join(dir, 'icon128.png'), png);
console.log('Created placeholder PNG icons (replace with proper sized icons for production)');
