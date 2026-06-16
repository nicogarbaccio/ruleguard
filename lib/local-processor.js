/**
 * Local Compliance Processor
 *
 * Fully offline analysis with NO API keys and NO external calls:
 *   - PDF text is extracted with PDF.js (done at upload time; passed in here)
 *   - Image text is extracted with Tesseract.js OCR (local WASM)
 *   - Requirements are detected and categorized with regex pattern matching
 *   - Findings are produced by the rule engine in ComplianceChecker
 *
 * It implements the same method surface as AIComplianceAnalyzer
 * (analyzeImage / analyzeDocument / evaluateTestCases) so it can be swapped in
 * via the processor factory without changing the analysis flow.
 */

import { ComplianceChecker } from '../utils/compliance-checker.js';
import { STANDARD_TEMPLATES } from '../assets/gli-standards/standard-templates.js';

export class LocalComplianceProcessor {
  /**
   * @param {Object} [options]
   * @param {string} [options.standard] - Template key, e.g. 'GLI-19' or 'GLI-11'.
   */
  constructor(options = {}) {
    this.standard = options.standard || 'GLI-19';
    this.checker = new ComplianceChecker();
    this.template = STANDARD_TEMPLATES[this.standard] || STANDARD_TEMPLATES['GLI-19'];
    this.ocrWorker = null;
    this._ocrLib = null;
  }

  /** Describe this processor for the UI. */
  describe() {
    return {
      mode: 'local',
      label: `Local processing (${this.standard})`,
      requiresApiKey: false
    };
  }

  // --- Public interface (mirrors AIComplianceAnalyzer) ---

  /**
   * Analyze an image by OCR-ing it to text, then pattern matching.
   * @param {string} imageBase64 - data URL or base64 image
   * @param {string} [ocrText] - optional pre-extracted text (skips OCR)
   * @returns {Array} findings
   */
  async analyzeImage(imageBase64, ocrText = '', _customInstructions = '') {
    let text = ocrText;
    if (!text) {
      text = await this.ocrImage(imageBase64);
    }
    return this.analyzeText(text, { source: 'image' });
  }

  /**
   * Analyze a text document (already-extracted PDF text or rules text).
   * @param {string} documentText
   * @returns {Array} findings
   */
  async analyzeDocument(documentText, _customInstructions = '') {
    return this.analyzeText(documentText || '', { source: 'document' });
  }

  /**
   * Evaluate custom test cases by keyword-matching against the combined
   * extracted text of all frames and documents.
   * @returns {Array} { testCase, result, reason }
   */
  async evaluateTestCases(testCases, frames = [], docs = []) {
    const corpus = await this.buildCorpus(frames, docs);
    const normalized = corpus.toLowerCase();

    return testCases.map((tc) => {
      const keywords = this.extractKeywords(tc);
      if (keywords.length === 0) {
        return {
          testCase: tc,
          result: 'na',
          reason: 'Local mode could not derive keywords to check for this test case.'
        };
      }

      const matched = keywords.filter(k => normalized.includes(k));
      const ratio = matched.length / keywords.length;

      if (ratio >= 0.6) {
        return {
          testCase: tc,
          result: 'pass',
          reason: `Found supporting terms in the documentation: ${matched.join(', ')}.`
        };
      }
      if (matched.length === 0) {
        return {
          testCase: tc,
          result: 'fail',
          reason: `None of the expected terms (${keywords.join(', ')}) were found in the documentation.`
        };
      }
      return {
        testCase: tc,
        result: 'na',
        reason: `Only partial supporting terms found (${matched.join(', ')}). Manual review recommended — local mode cannot judge visual/behavioral requirements.`
      };
    });
  }

  // --- Core local analysis ---

  /**
   * Run rule-based checks + requirement detection on a block of text.
   * @param {string} text
   * @param {Object} [meta]
   * @returns {Array} findings
   */
  analyzeText(text, meta = {}) {
    if (!text || !text.trim()) {
      return [{
        severity: 'warning',
        category: 'No Text Extracted',
        description: meta.source === 'image'
          ? 'OCR could not extract readable text from this image. It may be low-resolution or contain stylized graphics.'
          : 'No readable text was found in this document.',
        gliReference: 'N/A',
        recommendation: 'Upload a higher-quality image/PDF, or use AI mode for visual analysis.'
      }];
    }

    // Rule engine findings (RTP, interrupted games, max win, etc.)
    const findings = this.checker.runRuleChecks(text);

    // Template-specific required-section coverage.
    findings.push(...this.checkRequiredSections(text));

    return findings;
  }

  /**
   * Detect numbered requirements (e.g. "4.1.2 ...") and categorize them.
   * Exposed for reporting/inspection and tests.
   * @param {string} text
   * @returns {Array} { section, text, type, mandatory }
   */
  extractRequirements(text) {
    if (!text) return [];
    const requirements = [];
    // Match a section number like 4.1, 4.1.2, 5.3.1 followed by text.
    const sectionRegex = /\b(\d+\.\d+(?:\.\d+)*)\s+([^\n\r]{3,300})/g;
    let match;
    while ((match = sectionRegex.exec(text)) !== null) {
      const section = match[1];
      const body = match[2].trim();
      requirements.push({
        section,
        text: body,
        type: this.categorizeRequirement(body),
        mandatory: /\b(must|shall|required|mandatory)\b/i.test(body)
      });
    }
    return requirements;
  }

  /**
   * Categorize a requirement by keyword pattern matching.
   * @param {string} text
   * @returns {string} one of ui_display | text_content | functional | data | general
   */
  categorizeRequirement(text) {
    const t = text.toLowerCase();
    if (/\b(display|show|visible|appear|on[\s-]?screen|indicat|present)\b/.test(t)) {
      return 'ui_display';
    }
    if (/\b(text|message|label|wording|statement|disclosure|notice)\b/.test(t)) {
      return 'text_content';
    }
    if (/\b(store|stored|log|logged|record|retain|persist|audit)\b/.test(t)) {
      return 'data';
    }
    if (/\b(calculate|generate|process|trigger|function|behavior|operate|prevent|allow|enforce)\b/.test(t)) {
      return 'functional';
    }
    return 'general';
  }

  /**
   * Check that template-required topics are present in the text.
   * @param {string} text
   * @returns {Array} findings
   */
  checkRequiredSections(text) {
    const findings = [];
    const lower = text.toLowerCase();

    for (const req of this.template.requiredTopics || []) {
      const present = req.keywords.some(k => lower.includes(k.toLowerCase()));
      if (!present) {
        findings.push({
          severity: req.severity || 'warning',
          category: req.category,
          description: `${req.label} not detected in the documentation (local keyword scan).`,
          gliReference: req.reference,
          recommendation: req.recommendation
        });
      }
    }
    return findings;
  }

  // --- OCR (Tesseract.js, local WASM) ---

  /**
   * OCR an image (data URL or base64) to text using a local Tesseract worker.
   * @param {string} imageSource
   * @returns {string} extracted text
   */
  async ocrImage(imageSource) {
    try {
      const worker = await this.getOCRWorker();
      const src = imageSource.startsWith('data:')
        ? imageSource
        : `data:image/png;base64,${imageSource}`;
      const { data } = await worker.recognize(src);
      return (data && data.text) ? data.text : '';
    } catch (error) {
      console.warn('Local OCR failed:', error);
      return '';
    }
  }

  /**
   * Lazily create the Tesseract worker, configured for offline use with
   * locally bundled worker/core/lang assets (no CDN fetches).
   */
  async getOCRWorker() {
    if (this.ocrWorker) return this.ocrWorker;

    if (!this._ocrLib) {
      this._ocrLib = await import('../vendor/tesseract.min.js');
    }
    const Tesseract = this._ocrLib.default || this._ocrLib;

    this.ocrWorker = await Tesseract.createWorker('eng', 1, {
      workerPath: chrome.runtime.getURL('vendor/tesseract-worker.min.js'),
      corePath: chrome.runtime.getURL('vendor/tesseract-core'),
      langPath: chrome.runtime.getURL('vendor/tessdata'),
      gzip: true,
      cacheMethod: 'none'
    });

    return this.ocrWorker;
  }

  async terminate() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
    }
  }

  // --- Helpers ---

  /** Build a combined text corpus from frames (OCR) and docs (text/OCR). */
  async buildCorpus(frames, docs) {
    const parts = [];

    for (const doc of docs) {
      if (doc.type === 'pdf') {
        parts.push(doc.content || '');
      } else {
        parts.push(await this.ocrImage(doc.content || ''));
      }
    }

    for (const frame of frames) {
      parts.push(await this.ocrImage(frame.dataUrl || ''));
    }

    return parts.join('\n\n');
  }

  /** Pull meaningful keywords from a test case sentence. */
  extractKeywords(testCase) {
    const stop = new Set([
      'the', 'a', 'an', 'is', 'are', 'be', 'to', 'of', 'and', 'or', 'in', 'on',
      'for', 'with', 'that', 'this', 'must', 'shall', 'should', 'will', 'can',
      'does', 'do', 'it', 'as', 'at', 'by', 'has', 'have', 'when', 'if', 'all',
      'any', 'each', 'game', 'player', 'there', 'their', 'they', 'from', 'not'
    ]);
    return [...new Set(
      (testCase.toLowerCase().match(/[a-z][a-z0-9%]{2,}/g) || [])
        .filter(w => !stop.has(w))
    )];
  }
}
