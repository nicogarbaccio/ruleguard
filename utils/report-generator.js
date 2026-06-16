/**
 * Report Generator
 * Creates structured compliance reports in various formats.
 */

export class ReportGenerator {
  /**
   * Create a full compliance report from analysis results.
   * @param {Object} complianceResults - Results from ComplianceChecker.evaluate()
   * @returns {Object} Complete report object
   */
  static createReport(complianceResults) {
    return {
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        tool: 'GLI Compliance Analyzer',
        generatedAt: Date.now()
      },
      summary: {
        overallScore: complianceResults.overallScore,
        totalIssues: complianceResults.totalIssues,
        criticalIssues: complianceResults.criticalIssues,
        warnings: complianceResults.warnings,
        info: complianceResults.info,
        passedChecks: complianceResults.passedChecks || []
      },
      findings: complianceResults.findings.map((finding, index) => ({
        id: `finding-${index + 1}`,
        ...finding
      })),
      recommendations: ReportGenerator.generateRecommendations(complianceResults)
    };
  }

  /**
   * Generate high-level recommendations based on findings.
   */
  static generateRecommendations(results) {
    const recommendations = [];

    if (results.criticalIssues > 0) {
      recommendations.push(
        'Address all critical issues before submission for certification.'
      );
    }

    if (results.findings.some(f => f.category === 'RTP Disclosure')) {
      recommendations.push(
        'Ensure RTP percentage is prominently displayed on help screens and game rules.'
      );
    }

    if (results.findings.some(f => f.category === 'Bonus Terms')) {
      recommendations.push(
        'Review and clarify all bonus feature terms and trigger conditions.'
      );
    }

    if (results.findings.some(f => f.category === 'Visual Clarity')) {
      recommendations.push(
        'Improve text readability — ensure minimum font sizes and adequate contrast ratios.'
      );
    }

    if (results.warnings > 3) {
      recommendations.push(
        'Multiple warnings detected. Consider a comprehensive documentation review.'
      );
    }

    if (results.overallScore >= 80) {
      recommendations.push(
        'Overall compliance is good. Address remaining issues for full certification readiness.'
      );
    }

    return recommendations;
  }

  /**
   * Resolve the jsPDF constructor.
   *
   * jspdf.umd.min.js is a UMD bundle that attaches a `jspdf` namespace to the
   * global scope when loaded via a classic <script> tag. It has no ES named
   * exports, so a dynamic import() does not yield `{ jsPDF }`.
   *
   * We resolve it robustly: prefer an already-loaded global, otherwise inject
   * the bundled script ourselves (so PDF export does not depend on popup.html
   * having loaded it first, or on import() semantics).
   */
  static async loadJsPDF() {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;

    const fromGlobal = () =>
      globalScope.jspdf?.jsPDF ||
      (typeof globalScope.jsPDF === 'function' ? globalScope.jsPDF : null);

    if (fromGlobal()) return fromGlobal();

    // Inject the bundled UMD script (extension-local URL).
    try {
      await ReportGenerator.injectScript('../vendor/jspdf.umd.min.js');
    } catch (e) {
      // Try a runtime-resolved URL as a fallback (works from any page depth).
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
          await ReportGenerator.injectScript(chrome.runtime.getURL('vendor/jspdf.umd.min.js'));
        }
      } catch {
        /* fall through */
      }
    }

    if (fromGlobal()) return fromGlobal();

    throw new Error(
      'jsPDF could not be loaded. Re-run "node scripts/build.js" so vendor/jspdf.umd.min.js exists, then reload the extension.'
    );
  }

  /**
   * Inject a classic <script> and resolve when it loads.
   */
  static injectScript(src) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('No document available to inject script.'));
        return;
      }
      // Avoid injecting the same script twice.
      const existing = document.querySelector(`script[data-rg-src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.dataset.rgSrc = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(el);
    });
  }

  /**
   * Export report as a downloadable PDF.
   * Uses jsPDF for PDF generation.
   * @param {Object} report - The report object
   * @returns {Blob} PDF blob
   */
  static async exportPDF(report) {
    const jsPDF = await ReportGenerator.loadJsPDF();
    const doc = new jsPDF();

    const margin = 20;
    let y = margin;

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('GLI Compliance Report', margin, y);
    y += 12;

    // Metadata
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date(report.metadata.timestamp).toLocaleString()}`, margin, y);
    y += 6;
    doc.text(`Tool: ${report.metadata.tool} v${report.metadata.version}`, margin, y);
    y += 12;

    // Score
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(`Overall Compliance Score: ${report.summary.overallScore}/100`, margin, y);
    y += 10;

    // Summary
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Critical Issues: ${report.summary.criticalIssues}`, margin, y);
    y += 6;
    doc.text(`Warnings: ${report.summary.warnings}`, margin, y);
    y += 6;
    doc.text(`Informational: ${report.summary.info}`, margin, y);
    y += 12;

    // Issues Summary — critical + warnings with rule + what to check.
    const issues = (report.findings || []).filter(
      f => f.severity === 'critical' || f.severity === 'warning'
    );
    if (issues.length > 0) {
      const order = { critical: 0, warning: 1 };
      issues.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('Issues to Review', margin, y);
      y += 8;

      for (const issue of issues) {
        if (y > 255) { doc.addPage(); y = margin; }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const sevColor = issue.severity === 'critical' ? [220, 38, 38] : [234, 88, 12];
        doc.setTextColor(...sevColor);
        doc.text(`[${issue.severity.toUpperCase()}] ${issue.category}`, margin, y);
        y += 5;

        const ref = (issue.gliReference && issue.gliReference !== 'N/A')
          ? issue.gliReference
          : 'No specific reference';
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60);

        const ruleLines = doc.splitTextToSize(`Rule: ${ref}`, 170);
        doc.text(ruleLines, margin, y);
        y += ruleLines.length * 4 + 1;

        const probLines = doc.splitTextToSize(`Issue: ${issue.description}`, 170);
        doc.text(probLines, margin, y);
        y += probLines.length * 4 + 1;

        const checkText = issue.recommendation || 'Manually review this area against the referenced standard.';
        const checkLines = doc.splitTextToSize(`What to check: ${checkText}`, 170);
        doc.setTextColor(22, 163, 74);
        doc.text(checkLines, margin, y);
        y += checkLines.length * 4 + 5;

        if (y > 270) { doc.addPage(); y = margin; }
      }
      y += 2;
    }

    // Findings
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Findings', margin, y);
    y += 8;

    for (const finding of report.findings) {
      if (y > 260) {
        doc.addPage();
        y = margin;
      }

      // Severity indicator
      const severityColors = {
        critical: [220, 38, 38],
        warning: [234, 88, 12],
        info: [37, 99, 235]
      };
      const color = severityColors[finding.severity] || [0, 0, 0];
      doc.setFillColor(...color);
      doc.circle(margin + 2, y - 1, 2, 'F');

      // Finding title
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text(`${finding.category} [${finding.severity.toUpperCase()}]`, margin + 8, y);
      y += 5;

      // Description
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60);
      const descLines = doc.splitTextToSize(finding.description, 170);
      doc.text(descLines, margin + 8, y);
      y += descLines.length * 4 + 2;

      // GLI Reference
      doc.setTextColor(100);
      doc.text(`Reference: ${finding.gliReference}`, margin + 8, y);
      y += 5;

      // Recommendation
      if (finding.recommendation) {
        doc.setTextColor(22, 163, 74);
        const recLines = doc.splitTextToSize(`→ ${finding.recommendation}`, 165);
        doc.text(recLines, margin + 8, y);
        y += recLines.length * 4 + 4;
      }

      y += 4;
    }

    // Recommendations section
    if (report.recommendations.length > 0) {
      if (y > 240) {
        doc.addPage();
        y = margin;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('Recommendations', margin, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      for (const rec of report.recommendations) {
        if (y > 270) {
          doc.addPage();
          y = margin;
        }
        doc.text(`• ${rec}`, margin + 4, y);
        y += 6;
      }
    }

    return doc.output('blob');
  }

  /**
   * Export report as HTML string.
   * @param {Object} report - The report object
   * @returns {string} HTML string
   */
  static exportHTML(report) {
    const severityBadge = (severity) => {
      const colors = { critical: '#dc2626', warning: '#ea580c', info: '#2563eb' };
      return `<span style="background:${colors[severity]};color:white;padding:2px 8px;border-radius:4px;font-size:11px;">${severity.toUpperCase()}</span>`;
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>GLI Compliance Report</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1f2937; }
    h1 { color: #111827; }
    .score { font-size: 48px; font-weight: bold; color: ${report.summary.overallScore >= 80 ? '#16a34a' : report.summary.overallScore >= 60 ? '#ea580c' : '#dc2626'}; }
    .finding { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .finding-critical { border-left: 4px solid #dc2626; }
    .finding-warning { border-left: 4px solid #ea580c; }
    .finding-info { border-left: 4px solid #2563eb; }
    .recommendation { background: #f0fdf4; padding: 8px 12px; border-radius: 4px; color: #16a34a; margin-top: 8px; }
    .meta { color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <h1>GLI Compliance Report</h1>
  <p class="meta">Generated: ${new Date(report.metadata.timestamp).toLocaleString()} | ${report.metadata.tool} v${report.metadata.version}</p>
  
  <h2>Score: <span class="score">${report.summary.overallScore}</span>/100</h2>
  <p>Critical: ${report.summary.criticalIssues} | Warnings: ${report.summary.warnings} | Info: ${report.summary.info}</p>
  
  <h2>Findings</h2>
  ${report.findings.map(f => `
    <div class="finding finding-${f.severity}">
      <div>${severityBadge(f.severity)} <strong>${f.category}</strong></div>
      <p>${f.description}</p>
      <p class="meta">Reference: ${f.gliReference}</p>
      ${f.recommendation ? `<div class="recommendation">💡 ${f.recommendation}</div>` : ''}
    </div>
  `).join('')}
  
  <h2>Recommendations</h2>
  <ul>${report.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
</body>
</html>`;
  }
}
