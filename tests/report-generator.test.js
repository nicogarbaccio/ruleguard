/**
 * Tests for ReportGenerator
 */

const { loadModule } = require('./helpers/module-loader.js');
const { ReportGenerator } = loadModule('utils/report-generator.js');

describe('ReportGenerator', () => {
  const mockComplianceResults = {
    overallScore: 75,
    totalIssues: 4,
    criticalIssues: 1,
    warnings: 2,
    info: 1,
    findings: [
      {
        severity: 'critical',
        category: 'RTP Disclosure',
        description: 'No RTP percentage found on help screen',
        gliReference: 'GLI-11 Section 4.2.1',
        recommendation: 'Add prominent RTP disclosure'
      },
      {
        severity: 'warning',
        category: 'Bonus Terms',
        description: 'Bonus trigger conditions are ambiguous',
        gliReference: 'GLI-11 Section 6.1',
        recommendation: 'Clarify trigger conditions'
      },
      {
        severity: 'warning',
        category: 'Visual Clarity',
        description: 'Small font size on paytable',
        gliReference: 'GLI-11 Section 7.1',
        recommendation: 'Increase font size to minimum 12px'
      },
      {
        severity: 'info',
        category: 'Volatility Information',
        description: 'No volatility rating provided',
        gliReference: 'GLI-11 Best Practices',
        recommendation: 'Add volatility indicator'
      }
    ],
    passedChecks: ['Paytable Accuracy', 'Regulatory Information']
  };

  describe('createReport', () => {
    it('creates a report with correct structure', () => {
      const report = ReportGenerator.createReport(mockComplianceResults);

      expect(report).toHaveProperty('metadata');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('findings');
      expect(report).toHaveProperty('recommendations');
    });

    it('includes metadata with timestamp', () => {
      const report = ReportGenerator.createReport(mockComplianceResults);

      expect(report.metadata.timestamp).toBeDefined();
      expect(report.metadata.tool).toBe('GLI Compliance Analyzer');
      expect(report.metadata.version).toBe('1.0.0');
    });

    it('preserves summary scores', () => {
      const report = ReportGenerator.createReport(mockComplianceResults);

      expect(report.summary.overallScore).toBe(75);
      expect(report.summary.criticalIssues).toBe(1);
      expect(report.summary.warnings).toBe(2);
      expect(report.summary.info).toBe(1);
    });

    it('assigns IDs to findings', () => {
      const report = ReportGenerator.createReport(mockComplianceResults);

      report.findings.forEach((finding, index) => {
        expect(finding.id).toBe(`finding-${index + 1}`);
      });
    });

    it('generates recommendations for critical issues', () => {
      const report = ReportGenerator.createReport(mockComplianceResults);

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('critical'))).toBe(true);
    });
  });

  describe('generateRecommendations', () => {
    it('recommends addressing critical issues', () => {
      const recs = ReportGenerator.generateRecommendations(mockComplianceResults);
      expect(recs.some(r => r.toLowerCase().includes('critical'))).toBe(true);
    });

    it('recommends RTP fix when RTP issues exist', () => {
      const recs = ReportGenerator.generateRecommendations(mockComplianceResults);
      expect(recs.some(r => r.toLowerCase().includes('rtp'))).toBe(true);
    });

    it('recommends visual clarity improvements', () => {
      const recs = ReportGenerator.generateRecommendations(mockComplianceResults);
      expect(recs.some(r => r.toLowerCase().includes('readability') || r.toLowerCase().includes('text'))).toBe(true);
    });
  });

  describe('exportHTML', () => {
    it('generates valid HTML', () => {
      const report = ReportGenerator.createReport(mockComplianceResults);
      const html = ReportGenerator.exportHTML(report);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('GLI Compliance Report');
      expect(html).toContain('75');
      expect(html).toContain('RTP Disclosure');
    });

    it('includes severity badges', () => {
      const report = ReportGenerator.createReport(mockComplianceResults);
      const html = ReportGenerator.exportHTML(report);

      expect(html).toContain('CRITICAL');
      expect(html).toContain('WARNING');
      expect(html).toContain('INFO');
    });
  });
});
