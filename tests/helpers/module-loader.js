/**
 * Module loader helper for tests.
 * Converts ES module exports to CommonJS for Jest compatibility.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Load an ES module file and extract its exports.
 * Handles simple cases of `export class` and `export function`.
 */
function loadModule(filePath, contextOverrides = {}) {
  const absolutePath = path.resolve(__dirname, '..', '..', filePath);
  let code = fs.readFileSync(absolutePath, 'utf8');

  // Remove import statements (we'll handle dependencies manually)
  code = code.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
  code = code.replace(/^import\s+['"].*?['"];?\s*$/gm, '');

  // Convert export statements to module.exports assignments
  code = code.replace(/^export\s+(class|function|const|let|var)\s+/gm, '$1 ');

  // Wrap in a function to capture exports
  const exports = {};
  const wrappedCode = `
    ${code}
    
    // Collect all declared classes and functions
    if (typeof ComplianceChecker !== 'undefined') exports.ComplianceChecker = ComplianceChecker;
    if (typeof ReportGenerator !== 'undefined') exports.ReportGenerator = ReportGenerator;
    if (typeof ImageProcessor !== 'undefined') exports.ImageProcessor = ImageProcessor;
    if (typeof AIComplianceAnalyzer !== 'undefined') exports.AIComplianceAnalyzer = AIComplianceAnalyzer;
  `;

  const context = {
    exports,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL: typeof URL !== 'undefined' ? URL : class URL {},
    fetch: typeof fetch !== 'undefined' ? fetch : async () => {},
    document: { createElement: () => ({ textContent: '', innerHTML: '', getContext: () => ({}) }) },
    Image: class Image { set src(v) { if (this.onload) this.onload(); } },
    require,
    // Source uses `error instanceof TypeError` / name checks — expose the
    // realm's TypeError so behavior matches the host environment.
    TypeError,
    Error,
    // Allow tests to inject/override globals such as a mock `fetch`.
    ...contextOverrides
  };

  vm.createContext(context);
  vm.runInContext(wrappedCode, context);

  return exports;
}

module.exports = { loadModule };
