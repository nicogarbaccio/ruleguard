/**
 * Tests for LocalComplianceProcessor (offline, no API).
 *
 * The vm-based module loader strips ES imports, so we inject the processor's
 * dependencies (ComplianceChecker, STANDARD_TEMPLATES) as context globals.
 */

const { loadModule } = require('./helpers/module-loader.js');

// Minimal ComplianceChecker stub: returns no rule findings so tests isolate
// the local processor's own logic (categorization, requirement extraction,
// template coverage).
class StubChecker {
  runRuleChecks() { return []; }
}

const STANDARD_TEMPLATES = {
  'GLI-19': {
    name: 'GLI-19',
    requiredTopics: [
      {
        category: 'RTP Disclosure',
        label: 'RTP disclosure',
        keywords: ['rtp', 'return to player'],
        severity: 'critical',
        reference: 'GLI-19 Section 4.7',
        recommendation: 'State the RTP.'
      },
      {
        category: 'Responsible Gaming',
        label: 'Responsible gaming',
        keywords: ['responsible gaming', 'self-exclusion'],
        severity: 'info',
        reference: 'GLI-19',
        recommendation: 'Add responsible gaming info.'
      }
    ]
  }
};

function makeProcessor() {
  const { LocalComplianceProcessor } = loadModule('lib/local-processor.js', {
    ComplianceChecker: StubChecker,
    STANDARD_TEMPLATES
  });
  return new LocalComplianceProcessor({ standard: 'GLI-19' });
}

describe('LocalComplianceProcessor', () => {
  describe('describe()', () => {
    it('reports local mode with no API key required', () => {
      const p = makeProcessor();
      const d = p.describe();
      expect(d.mode).toBe('local');
      expect(d.requiresApiKey).toBe(false);
    });
  });

  describe('categorizeRequirement', () => {
    it('classifies display requirements as ui_display', () => {
      const p = makeProcessor();
      expect(p.categorizeRequirement('The game must display the current balance')).toBe('ui_display');
    });

    it('classifies wording requirements as text_content', () => {
      const p = makeProcessor();
      expect(p.categorizeRequirement('The disclosure message shall state the odds')).toBe('text_content');
    });

    it('classifies behavior requirements as functional', () => {
      const p = makeProcessor();
      expect(p.categorizeRequirement('The system shall prevent play when disconnected')).toBe('functional');
    });

    it('classifies logging requirements as data', () => {
      const p = makeProcessor();
      expect(p.categorizeRequirement('All transactions must be logged and retained')).toBe('data');
    });

    it('falls back to general', () => {
      const p = makeProcessor();
      expect(p.categorizeRequirement('Miscellaneous notes about the cabinet')).toBe('general');
    });
  });

  describe('extractRequirements', () => {
    it('detects numbered sections and mandatory flag', () => {
      const p = makeProcessor();
      const text = '4.1.2 The game must display the RTP.\n5.3.1 The operator may offer bonuses.';
      const reqs = p.extractRequirements(text);
      expect(reqs.length).toBe(2);
      expect(reqs[0].section).toBe('4.1.2');
      expect(reqs[0].mandatory).toBe(true);
      expect(reqs[0].type).toBe('ui_display');
      expect(reqs[1].section).toBe('5.3.1');
      expect(reqs[1].mandatory).toBe(false);
    });

    it('returns empty for text with no sections', () => {
      const p = makeProcessor();
      expect(p.extractRequirements('No numbered sections here.')).toEqual([]);
    });
  });

  describe('analyzeText / checkRequiredSections', () => {
    it('flags missing required topics', async () => {
      const p = makeProcessor();
      const findings = p.analyzeText('This document mentions nothing relevant.');
      const categories = findings.map(f => f.category);
      expect(categories).toContain('RTP Disclosure');
      expect(categories).toContain('Responsible Gaming');
    });

    it('does not flag a topic that is present', async () => {
      const p = makeProcessor();
      const findings = p.analyzeText('The theoretical RTP is 96.5%. Return to player disclosed.');
      const categories = findings.map(f => f.category);
      expect(categories).not.toContain('RTP Disclosure');
    });

    it('warns when no text was extracted', () => {
      const p = makeProcessor();
      const findings = p.analyzeText('   ', { source: 'image' });
      expect(findings).toHaveLength(1);
      expect(findings[0].category).toBe('No Text Extracted');
    });
  });

  describe('analyzeImage OCR failure handling', () => {
    it('returns an OCR Unavailable finding when the engine cannot load', async () => {
      const p = makeProcessor();
      // No global Tesseract and no document in the vm context, so loadTesseract
      // throws — analyzeImage should convert that into a clear finding.
      const findings = await p.analyzeImage('data:image/png;base64,QUJD');
      expect(findings).toHaveLength(1);
      expect(findings[0].category).toBe('OCR Unavailable');
      expect(findings[0].severity).toBe('warning');
    });

    it('uses provided ocrText without invoking OCR', async () => {
      const p = makeProcessor();
      const findings = await p.analyzeImage('data:image/png;base64,QUJD', 'The RTP is 96.5%. Return to player disclosed.');
      const categories = findings.map(f => f.category);
      expect(categories).not.toContain('OCR Unavailable');
      expect(categories).not.toContain('RTP Disclosure');
    });
  });

  describe('evaluateTestCases', () => {
    it('passes a test case whose keywords appear in the docs', async () => {
      const p = makeProcessor();
      const docs = [{ type: 'pdf', content: 'The paytable shows the maximum win and bonus rules.' }];
      const results = await p.evaluateTestCases(['Paytable shows maximum win'], [], docs);
      expect(results[0].result).toBe('pass');
    });

    it('fails a test case with no matching keywords', async () => {
      const p = makeProcessor();
      const docs = [{ type: 'pdf', content: 'Completely unrelated content about colors.' }];
      const results = await p.evaluateTestCases(['Progressive jackpot meter increments'], [], docs);
      expect(results[0].result).toBe('fail');
    });
  });
});
