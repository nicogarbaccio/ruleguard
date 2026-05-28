/**
 * Tests for ComplianceChecker
 */

const { loadModule } = require('./helpers/module-loader.js');
const { ComplianceChecker } = loadModule('utils/compliance-checker.js');

describe('ComplianceChecker', () => {
  let checker;

  beforeEach(() => {
    checker = new ComplianceChecker();
  });

  describe('calculateScore', () => {
    it('returns 100 for no issues', () => {
      const result = checker.evaluate([]);
      expect(result.overallScore).toBe(100);
    });

    it('penalizes critical issues heavily', () => {
      const findings = [
        { severity: 'critical', category: 'RTP', description: 'Missing RTP', gliReference: 'GLI-11 4.2.1', recommendation: 'Add RTP' }
      ];
      const result = checker.evaluate(findings);
      expect(result.overallScore).toBe(85); // 100 - 15
    });

    it('penalizes warnings moderately', () => {
      const findings = [
        { severity: 'warning', category: 'Bet Ranges', description: 'Missing', gliReference: 'GLI-11 4.1', recommendation: 'Add' }
      ];
      const result = checker.evaluate(findings);
      expect(result.overallScore).toBe(95); // 100 - 5
    });

    it('penalizes info minimally', () => {
      const findings = [
        { severity: 'info', category: 'Volatility', description: 'Missing', gliReference: 'GLI-11', recommendation: 'Add' }
      ];
      const result = checker.evaluate(findings);
      expect(result.overallScore).toBe(99); // 100 - 1
    });

    it('caps critical penalty at 60', () => {
      const findings = Array(10).fill(null).map((_, i) => ({
        severity: 'critical',
        category: `Issue ${i}`,
        description: `Critical issue ${i}`,
        gliReference: 'GLI-11',
        recommendation: 'Fix'
      }));
      const result = checker.evaluate(findings);
      expect(result.overallScore).toBe(40); // 100 - 60 (capped)
    });

    it('never goes below 0', () => {
      const findings = [
        ...Array(10).fill(null).map((_, i) => ({
          severity: 'critical', category: `C${i}`, description: `d${i}`, gliReference: 'r', recommendation: 'r'
        })),
        ...Array(10).fill(null).map((_, i) => ({
          severity: 'warning', category: `W${i}`, description: `d${i}`, gliReference: 'r', recommendation: 'r'
        })),
        ...Array(20).fill(null).map((_, i) => ({
          severity: 'info', category: `I${i}`, description: `d${i}`, gliReference: 'r', recommendation: 'r'
        }))
      ];
      const result = checker.evaluate(findings);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deduplicateFindings', () => {
    it('removes duplicate findings', () => {
      const findings = [
        { severity: 'critical', category: 'RTP', description: 'Missing RTP disclosure in help screen', gliReference: 'GLI-11', recommendation: 'Add' },
        { severity: 'critical', category: 'RTP', description: 'Missing RTP disclosure in help screen', gliReference: 'GLI-11', recommendation: 'Add' }
      ];
      const result = checker.evaluate(findings);
      expect(result.totalIssues).toBe(1);
    });

    it('keeps findings with different categories', () => {
      const findings = [
        { severity: 'critical', category: 'RTP', description: 'Missing', gliReference: 'GLI-11', recommendation: 'Add' },
        { severity: 'critical', category: 'Malfunction', description: 'Missing', gliReference: 'GLI-11', recommendation: 'Add' }
      ];
      const result = checker.evaluate(findings);
      expect(result.totalIssues).toBe(2);
    });
  });

  describe('runRuleChecks', () => {
    it('detects missing RTP disclosure', () => {
      const text = 'This is a game with bonus features and wild symbols.';
      const findings = checker.runRuleChecks(text);
      const rtpFinding = findings.find(f => f.category === 'RTP Disclosure');
      expect(rtpFinding).toBeDefined();
      expect(rtpFinding.severity).toBe('critical');
    });

    it('passes when RTP is present', () => {
      const text = 'This game has an RTP: 96.5% and features wild symbols.';
      const findings = checker.runRuleChecks(text);
      const rtpFinding = findings.find(f => f.category === 'RTP Disclosure');
      expect(rtpFinding).toBeUndefined();
    });

    it('detects missing malfunction clause', () => {
      const text = 'Game rules: spin the reels to win prizes.';
      const findings = checker.runRuleChecks(text);
      const disconnectFinding = findings.find(f => f.category === 'Interrupted Games');
      expect(disconnectFinding).toBeDefined();
      expect(disconnectFinding.severity).toBe('critical');
    });

    it('passes when malfunction clause is present', () => {
      const text = 'If disconnected during play, the game will resume. RTP: 96.5%';
      const findings = checker.runRuleChecks(text);
      const disconnectFinding = findings.find(f => f.category === 'Interrupted Games');
      expect(disconnectFinding).toBeUndefined();
    });

    it('detects missing max win information', () => {
      const text = 'Play this exciting slot game with bonus features.';
      const findings = checker.runRuleChecks(text);
      const maxWinFinding = findings.find(f => f.category === 'Maximum Win');
      expect(maxWinFinding).toBeDefined();
      expect(maxWinFinding.severity).toBe('warning');
    });

    it('passes when max win is stated', () => {
      const text = 'Maximum win is 5000x your bet. RTP: 96.5%. Malfunction voids all pays.';
      const findings = checker.runRuleChecks(text);
      const maxWinFinding = findings.find(f => f.category === 'Maximum Win');
      expect(maxWinFinding).toBeUndefined();
    });

    it('detects missing bet range information', () => {
      const text = 'Spin the reels and win big prizes!';
      const findings = checker.runRuleChecks(text);
      const betFinding = findings.find(f => f.category === 'Bet Ranges');
      expect(betFinding).toBeDefined();
    });

    it('detects missing volatility information', () => {
      const text = 'This game has an RTP of 96.5%.';
      const findings = checker.runRuleChecks(text);
      const volFinding = findings.find(f => f.category === 'Volatility Information');
      expect(volFinding).toBeDefined();
      expect(volFinding.severity).toBe('info');
    });
  });

  describe('getPassedChecks', () => {
    it('returns all categories when no critical/warning findings', () => {
      const findings = [
        { severity: 'info', category: 'Suggestion', description: 'test', gliReference: 'r', recommendation: 'r' }
      ];
      const result = checker.evaluate(findings);
      expect(result.passedChecks.length).toBeGreaterThan(0);
      expect(result.passedChecks).toContain('RTP Disclosure');
    });

    it('excludes categories with critical findings', () => {
      const findings = [
        { severity: 'critical', category: 'RTP Disclosure', description: 'Missing', gliReference: 'r', recommendation: 'r' }
      ];
      const result = checker.evaluate(findings);
      expect(result.passedChecks).not.toContain('RTP Disclosure');
    });
  });
});
