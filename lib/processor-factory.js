/**
 * Processor Factory
 *
 * Returns the appropriate compliance processor based on the user's chosen
 * processing mode. Both processors expose the same interface, so callers
 * (e.g. the popup analysis flow) don't branch on mode.
 *
 *   processingMode: 'local' -> LocalComplianceProcessor (offline, no API key)
 *   processingMode: 'ai'    -> AIComplianceProcessor (requires API key)
 */

import { AIComplianceProcessor } from './ai-processor.js';
import { LocalComplianceProcessor } from './local-processor.js';

export const DEFAULT_PROCESSING_MODE = 'local';

/**
 * @param {Object} settings
 * @param {string} [settings.processingMode] - 'ai' | 'local'
 * @param {string} [settings.apiKey]
 * @param {string} [settings.aiProvider]
 * @param {string} [settings.geminiModel]
 * @param {string} [settings.standard] - template key for local mode
 * @returns {{ processor: Object, mode: string }}
 */
export function createProcessor(settings = {}) {
  const mode = settings.processingMode || DEFAULT_PROCESSING_MODE;

  if (mode === 'ai') {
    if (!settings.apiKey) {
      throw new Error('AI mode is selected but no API key is configured. Add a key in Settings or switch to Local processing.');
    }
    return {
      mode: 'ai',
      processor: new AIComplianceProcessor({
        apiKey: settings.apiKey,
        provider: settings.aiProvider || 'openai',
        geminiModel: settings.geminiModel
      })
    };
  }

  return {
    mode: 'local',
    processor: new LocalComplianceProcessor({ standard: settings.standard || 'GLI-19' })
  };
}
