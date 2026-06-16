/**
 * AI Compliance Processor
 *
 * Thin adapter over AIComplianceAnalyzer so AI and local processors share one
 * interface (analyzeImage / analyzeDocument / evaluateTestCases / describe).
 * Keeps the existing AI behavior unchanged (backward compatible).
 */

import { AIComplianceAnalyzer } from './ai-client.js';

export class AIComplianceProcessor {
  /**
   * @param {Object} config
   * @param {string} config.apiKey
   * @param {string} config.provider - 'openai' | 'anthropic' | 'gemini'
   * @param {string} [config.geminiModel]
   */
  constructor({ apiKey, provider = 'openai', geminiModel } = {}) {
    this.provider = provider;
    this.analyzer = new AIComplianceAnalyzer(apiKey, provider, { geminiModel });
  }

  describe() {
    return {
      mode: 'ai',
      label: `AI analysis (${this.provider})`,
      requiresApiKey: true
    };
  }

  analyzeImage(imageBase64, ocrText = '', customInstructions = '') {
    return this.analyzer.analyzeImage(imageBase64, ocrText, customInstructions);
  }

  analyzeDocument(documentText, customInstructions = '') {
    return this.analyzer.analyzeDocument(documentText, customInstructions);
  }

  evaluateTestCases(testCases, frames = [], docs = []) {
    return this.analyzer.evaluateTestCases(testCases, frames, docs);
  }

  async terminate() {
    // No-op for AI; present for interface symmetry with the local processor.
  }
}
