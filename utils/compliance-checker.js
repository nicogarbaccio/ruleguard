/**
 * Compliance Checker
 * Evaluates AI findings against GLI standards and assigns severity scores.
 * Also performs rule-based checks independent of AI analysis.
 */

export class ComplianceChecker {
  constructor() {
    this.rules = this.loadRules();
  }

  /**
   * Evaluate findings and produce a scored compliance result.
   * @param {Array} findings - Array of finding objects from AI analysis
   * @returns {Object} Evaluated compliance results with score
   */
  evaluate(findings) {
    // Deduplicate findings
    const deduped = this.deduplicateFindings(findings);

    // Categorize by severity
    const critical = deduped.filter(f => f.severity === 'critical');
    const warnings = deduped.filter(f => f.severity === 'warning');
    const info = deduped.filter(f => f.severity === 'info');

    // Calculate compliance score
    const score = this.calculateScore(critical.length, warnings.length, info.length);

    return {
      overallScore: score,
      totalIssues: critical.length + warnings.length + info.length,
      criticalIssues: critical.length,
      warnings: warnings.length,
      info: info.length,
      findings: deduped,
      passedChecks: this.getPassedChecks(deduped)
    };
  }

  /**
   * Calculate overall compliance score.
   * Critical issues have heavy penalties, warnings moderate, info minimal.
   */
  calculateScore(criticalCount, warningCount, infoCount) {
    let score = 100;

    // Critical: -15 points each (max penalty 60)
    score -= Math.min(criticalCount * 15, 60);

    // Warning: -5 points each (max penalty 25)
    score -= Math.min(warningCount * 5, 25);

    // Info: -1 point each (max penalty 10)
    score -= Math.min(infoCount * 1, 10);

    return Math.max(0, Math.round(score));
  }

  /**
   * Remove duplicate or near-duplicate findings.
   */
  deduplicateFindings(findings) {
    const seen = new Set();
    return findings.filter(finding => {
      const key = `${finding.severity}:${finding.category}:${finding.description?.substring(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Determine which standard checks passed (no issues found).
   */
  getPassedChecks(findings) {
    const allCategories = [
      'RTP Disclosure',
      'Paytable Accuracy',
      'Bonus Terms',
      'Game Rules Completeness',
      'Regulatory Information',
      'Visual Clarity',
      'Misleading Content',
      'Volatility Information',
      'Maximum Win',
      'Bet Ranges',
      'Malfunction Clause',
      'Responsible Gaming'
    ];

    const failedCategories = new Set(
      findings
        .filter(f => f.severity === 'critical' || f.severity === 'warning')
        .map(f => f.category)
    );

    return allCategories.filter(cat => !failedCategories.has(cat));
  }

  /**
   * Load built-in compliance rules for rule-based checking.
   */
  loadRules() {
    return [
      {
        id: 'rtp-disclosure',
        category: 'RTP Disclosure',
        severity: 'critical',
        check: (text) => {
          const rtpPatterns = [
            /rtp[\s:]*\d+\.?\d*\s*%/i,
            /return\s+to\s+player[\s:]*\d+\.?\d*\s*%/i,
            /theoretical\s+return[\s:]*\d+\.?\d*\s*%/i,
            /payout\s+percentage[\s:]*\d+\.?\d*\s*%/i
          ];
          return !rtpPatterns.some(p => p.test(text));
        },
        description: 'No RTP (Return to Player) percentage found in documentation',
        gliReference: 'GLI-19 Section 4.7',
        recommendation: 'Add a clear RTP disclosure (e.g., "Theoretical RTP: 96.5%")'
      },
      {
        id: 'interrupted-games',
        category: 'Interrupted Games',
        severity: 'critical',
        check: (text) => {
          const patterns = [
            /disconnect/i,
            /interrupted?\s+game/i,
            /connection\s+(lost|failure|drop)/i,
            /session\s+(timeout|expir)/i
          ];
          return !patterns.some(p => p.test(text));
        },
        description: 'No interrupted game / disconnection policy found',
        gliReference: 'GLI-19 Section 4.16',
        recommendation: 'Document what happens when a game is interrupted or player disconnects mid-play'
      },
      {
        id: 'max-win',
        category: 'Maximum Win',
        severity: 'warning',
        check: (text) => {
          const patterns = [
            /max(imum)?\s+win/i,
            /highest\s+pay/i,
            /top\s+award/i,
            /max(imum)?\s+payout/i
          ];
          return !patterns.some(p => p.test(text));
        },
        description: 'Maximum win amount not clearly stated',
        gliReference: 'GLI-19 Section 4.4',
        recommendation: 'Clearly state the maximum possible win amount'
      },
      {
        id: 'bet-ranges',
        category: 'Bet Ranges',
        severity: 'warning',
        check: (text) => {
          const patterns = [
            /min(imum)?\s+bet/i,
            /max(imum)?\s+bet/i,
            /bet\s+range/i,
            /stake\s+range/i,
            /wager.*range/i
          ];
          return !patterns.some(p => p.test(text));
        },
        description: 'Bet range information (minimum/maximum) not found',
        gliReference: 'GLI-19 Section 4.2',
        recommendation: 'Document minimum and maximum bet amounts'
      },
      {
        id: 'game-rules',
        category: 'Game Rules Completeness',
        severity: 'warning',
        check: (text) => {
          const patterns = [
            /rules?\s+of\s+play/i,
            /how\s+to\s+play/i,
            /game\s+rules/i,
            /gameplay/i
          ];
          return !patterns.some(p => p.test(text));
        },
        description: 'No clear game rules or "how to play" section found',
        gliReference: 'GLI-19 Section 4.4',
        recommendation: 'Include a clear rules of play section explaining all game mechanics'
      },
      {
        id: 'volatility',
        category: 'Volatility Information',
        severity: 'info',
        check: (text) => {
          const patterns = [
            /volatility/i,
            /variance/i,
            /hit\s+frequency/i,
            /risk\s+level/i
          ];
          return !patterns.some(p => p.test(text));
        },
        description: 'No volatility/variance information provided',
        gliReference: 'GLI-19 Section 4.7 (Best Practice)',
        recommendation: 'Consider adding volatility rating (Low/Medium/High) for player information'
      }
    ];
  }

  /**
   * Run rule-based checks against extracted text.
   * @param {string} text - Extracted text from documents
   * @returns {Array} Array of findings from rule-based checks
   */
  runRuleChecks(text) {
    const findings = [];

    for (const rule of this.rules) {
      if (rule.check(text)) {
        findings.push({
          severity: rule.severity,
          category: rule.category,
          description: rule.description,
          gliReference: rule.gliReference,
          recommendation: rule.recommendation
        });
      }
    }

    return findings;
  }
}
