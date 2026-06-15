/**
 * RuleGuard - Popup UI Controller
 * Game-first flow: select/create a game, capture screens, analyze compliance.
 */

import { AIComplianceAnalyzer } from '../lib/ai-client.js';
import { ComplianceChecker } from '../utils/compliance-checker.js';
import { ReportGenerator } from '../utils/report-generator.js';
import { ScreenCapture } from '../lib/screen-capture.js';
import { Storage } from '../lib/storage.js';

class PopupController {
  constructor() {
    this.storage = new Storage();
    this.activeGame = null;
    this.analysisResults = null;

    this.init();
  }

  async init() {
    this.bindElements();
    this.bindEvents();
    await this.loadInitialView();
  }

  bindElements() {
    // Views
    this.viewGameList = document.getElementById('view-game-list');
    this.viewActiveGame = document.getElementById('view-active-game');

    // Game list
    this.gamesList = document.getElementById('games-list');
    this.newGameInput = document.getElementById('new-game-input');
    this.createGameBtn = document.getElementById('create-game-btn');

    // Active game
    this.activeGameName = document.getElementById('active-game-name');
    this.backToListBtn = document.getElementById('back-to-list-btn');
    this.deleteGameBtn = document.getElementById('delete-game-btn');

    // Captures
    this.capturesGrid = document.getElementById('captures-grid');
    this.noCapturesEl = document.getElementById('no-captures');
    this.startCaptureBtn = document.getElementById('start-capture-btn');
    this.captureIdle = document.getElementById('capture-idle');

    // Documents
    this.docsList = document.getElementById('docs-list');
    this.noDocsEl = document.getElementById('no-docs');
    this.docUploadInput = document.getElementById('doc-upload-input');

    // Instructions
    this.customInstructions = document.getElementById('custom-instructions');

    // Test Cases
    this.testCasesSection = document.getElementById('test-cases-section');
    this.testCasesList = document.getElementById('test-cases-list');
    this.noTestCasesEl = document.getElementById('no-test-cases');
    this.newTestCaseInput = document.getElementById('new-test-case-input');
    this.addTestCaseBtn = document.getElementById('add-test-case-btn');
    this.testCaseResults = document.getElementById('test-case-results');

    // Analysis
    this.analysisSection = document.getElementById('analysis-section');
    this.analyzeBtn = document.getElementById('analyze-btn');
    this.progressContainer = document.getElementById('progress-container');
    this.progressFill = document.getElementById('progress-fill');
    this.progressText = document.getElementById('progress-text');

    // Results
    this.resultsSection = document.getElementById('results-section');
    this.scoreValue = document.getElementById('score-value');
    this.scoreRing = document.getElementById('score-ring');
    this.criticalCount = document.getElementById('critical-count');
    this.warningCount = document.getElementById('warning-count');
    this.infoCount = document.getElementById('info-count');
    this.findingsList = document.getElementById('findings-list');
    this.exportJsonBtn = document.getElementById('export-json-btn');
    this.exportPdfBtn = document.getElementById('export-pdf-btn');

    // Global
    this.settingsBtn = document.getElementById('settings-btn');
    this.errorContainer = document.getElementById('error-container');
    this.errorMessage = document.getElementById('error-message');
    this.errorDismiss = document.getElementById('error-dismiss');
  }

  bindEvents() {
    // Game list
    this.createGameBtn.addEventListener('click', () => this.createGame());
    this.newGameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.createGame();
    });

    // Active game
    this.backToListBtn.addEventListener('click', () => this.showGameList());
    this.deleteGameBtn.addEventListener('click', () => this.deleteActiveGame());

    // Capture
    this.startCaptureBtn.addEventListener('click', () => this.startScreenCapture());

    // Documents
    this.docUploadInput.addEventListener('change', (e) => this.handleDocUpload(e));

    // Instructions — auto-save on change
    this.customInstructions.addEventListener('input', () => this.saveInstructions());

    // Test Cases
    this.addTestCaseBtn.addEventListener('click', () => this.addTestCase());
    this.newTestCaseInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addTestCase();
    });

    // Analysis
    this.analyzeBtn.addEventListener('click', () => this.runAnalysis());

    // Export
    this.exportJsonBtn.addEventListener('click', () => this.exportJSON());
    this.exportPdfBtn.addEventListener('click', () => this.exportPDF());

    // Global
    this.settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    this.errorDismiss.addEventListener('click', () => this.hideError());

    // Refresh captures when the standalone capture window saves frames
    // (only fires if this popup happens to still be open, e.g. on a second
    // monitor). On a normal reopen, openGame() reloads frames anyway.
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'FRAMES_SAVED' &&
          this.activeGame &&
          message.gameId === this.activeGame.id) {
        this.renderCaptures();
      }
    });
  }

  // --- Initial Load ---

  async loadInitialView() {
    const activeGameId = await this.storage.getActiveGameId();

    if (activeGameId) {
      const game = await this.storage.getGame(activeGameId);
      if (game) {
        await this.openGame(game);
        return;
      }
    }

    await this.showGameList();
  }

  // --- Game List View ---

  async showGameList() {
    this.activeGame = null;
    this.viewGameList.classList.remove('hidden');
    this.viewActiveGame.classList.add('hidden');
    await this.storage.setActiveGameId(null);
    await this.renderGameList();
  }

  async renderGameList() {
    const games = await this.storage.listGames();
    this.gamesList.innerHTML = '';

    if (games.length === 0) {
      this.gamesList.innerHTML = '<div class="empty-state"><p>No games yet. Create one to get started.</p></div>';
      return;
    }

    for (const game of games) {
      const report = await this.storage.getReport(game.id);
      const score = report?.report?.summary?.overallScore;

      const item = document.createElement('div');
      item.className = 'game-item';
      item.addEventListener('click', () => this.openGame(game));

      let scoreHtml = '';
      if (score !== undefined) {
        const scoreClass = score >= 80 ? 'good' : score >= 60 ? 'ok' : 'bad';
        scoreHtml = `<span class="game-item-score ${scoreClass}">${score}</span>`;
      }

      const frameText = game.frameCount ? `${game.frameCount} frames` : 'No captures';
      const dateText = this.formatDate(game.updatedAt);

      item.innerHTML = `
        <div class="game-item-icon">🎰</div>
        <div class="game-item-info">
          <div class="game-item-name">${this.escapeHtml(game.name)}</div>
          <div class="game-item-meta">${frameText} · ${dateText}</div>
        </div>
        ${scoreHtml}
        <span class="game-item-chevron">›</span>
      `;

      this.gamesList.appendChild(item);
    }
  }

  async createGame() {
    const name = this.newGameInput.value.trim();
    if (!name) {
      this.newGameInput.focus();
      return;
    }

    const game = await this.storage.createGame(name);
    this.newGameInput.value = '';
    await this.openGame(game);
  }

  // --- Active Game View ---

  async openGame(game) {
    this.activeGame = game;
    await this.storage.setActiveGameId(game.id);

    this.viewGameList.classList.add('hidden');
    this.viewActiveGame.classList.remove('hidden');
    this.activeGameName.textContent = game.name;

    // Load captures
    await this.renderCaptures();

    // Load documents
    await this.renderDocuments();

    // Load instructions
    this.customInstructions.value = game.instructions || '';

    // Load test cases
    this.renderTestCases();

    // Load existing report
    const reportRecord = await this.storage.getReport(game.id);
    if (reportRecord) {
      this.analysisResults = reportRecord.report;
      this.analysisSection.classList.remove('hidden');
      this.testCasesSection.classList.remove('hidden');
      this.displayResults(reportRecord.report);
    } else {
      this.resultsSection.classList.add('hidden');
      this.analysisResults = null;
    }

    this.updateAnalyzeButton();
  }

  async renderCaptures() {
    const frames = await this.storage.getFrames(this.activeGame.id);
    this.capturesGrid.innerHTML = '';

    if (frames.length === 0) {
      this.noCapturesEl.classList.remove('hidden');
      this.testCasesSection.classList.add('hidden');
      this.analysisSection.classList.add('hidden');
    } else {
      this.noCapturesEl.classList.add('hidden');
      this.testCasesSection.classList.remove('hidden');
      this.analysisSection.classList.remove('hidden');
      for (const frame of frames) {
        const thumb = document.createElement('div');
        thumb.className = 'capture-thumb';
        thumb.innerHTML = `<img src="${frame.dataUrl}" alt="Capture">`;
        this.capturesGrid.appendChild(thumb);
      }
    }

    this.updateAnalyzeButton();
  }

  // --- Documents ---

  async renderDocuments() {
    const docs = await this.storage.getDocuments(this.activeGame.id);
    this.docsList.innerHTML = '';

    if (docs.length === 0) {
      this.noDocsEl.classList.remove('hidden');
    } else {
      this.noDocsEl.classList.add('hidden');
      this.testCasesSection.classList.remove('hidden');
      this.analysisSection.classList.remove('hidden');
      for (const doc of docs) {
        const item = document.createElement('div');
        item.className = 'doc-item';

        const icon = doc.type === 'pdf' ? '📄' : '🖼️';
        const size = this.formatFileSize(doc.size);

        item.innerHTML = `
          <span class="doc-item-icon">${icon}</span>
          <span class="doc-item-name">${this.escapeHtml(doc.name)}</span>
          <span class="doc-item-size">${size}</span>
          <button class="doc-item-remove" title="Remove">×</button>
        `;

        item.querySelector('.doc-item-remove').addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.storage.deleteDocument(doc.id);
          await this.renderDocuments();
        });

        this.docsList.appendChild(item);
      }
    }

    this.updateAnalyzeButton();
  }

  async handleDocUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const failures = [];

    for (const file of files) {
      let content = '';
      let type = 'image';

      if (file.type === 'application/pdf') {
        type = 'pdf';
        // Extract text from PDF
        try {
          const { PDFProcessor } = await import('../lib/pdf-processor.js');
          const processor = new PDFProcessor();
          content = await processor.extractText(file);
          if (!content || !content.trim()) {
            throw new Error('No text could be extracted (the PDF may be scanned/image-only).');
          }
        } catch (e) {
          // Do NOT silently store binary as "pdf" text — that produces a
          // confusing failure later when it's sent to the text API.
          console.error(`PDF extraction failed for "${file.name}":`, e);
          failures.push(`${file.name}: ${e.message || 'PDF text extraction failed.'}`);
          continue;
        }
      } else if (file.type.startsWith('image/')) {
        // Image — store as base64
        try {
          content = await this.fileToBase64(file);
        } catch (e) {
          console.error(`Failed to read image "${file.name}":`, e);
          failures.push(`${file.name}: could not read image file.`);
          continue;
        }
      } else {
        failures.push(`${file.name}: unsupported file type (${file.type || 'unknown'}). Upload a PDF or image.`);
        continue;
      }

      await this.storage.saveDocument(this.activeGame.id, {
        name: file.name,
        type,
        size: file.size,
        content
      });
    }

    // Reset input so same file can be re-uploaded
    event.target.value = '';
    await this.renderDocuments();

    if (failures.length > 0) {
      this.showError(`Some files couldn't be added:\n${failures.join('\n')}`);
    }
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // --- Instructions ---

  async saveInstructions() {
    if (!this.activeGame) return;
    const instructions = this.customInstructions.value;
    await this.storage.updateGame(this.activeGame.id, { instructions });
    this.activeGame.instructions = instructions;
  }

  // --- Test Cases ---

  renderTestCases() {
    const testCases = this.activeGame.testCases || [];
    this.testCasesList.innerHTML = '';

    if (testCases.length === 0) {
      this.noTestCasesEl.classList.remove('hidden');
    } else {
      this.noTestCasesEl.classList.add('hidden');
      testCases.forEach((tc, index) => {
        const item = document.createElement('div');
        item.className = 'test-case-item';
        item.innerHTML = `
          <span class="test-case-item-text">${this.escapeHtml(tc)}</span>
          <button class="test-case-item-remove" title="Remove">×</button>
        `;
        item.querySelector('.test-case-item-remove').addEventListener('click', () => {
          this.removeTestCase(index);
        });
        this.testCasesList.appendChild(item);
      });
    }
  }

  async addTestCase() {
    const text = this.newTestCaseInput.value.trim();
    if (!text) {
      this.newTestCaseInput.focus();
      return;
    }

    const testCases = this.activeGame.testCases || [];
    testCases.push(text);
    await this.storage.updateGame(this.activeGame.id, { testCases });
    this.activeGame.testCases = testCases;

    this.newTestCaseInput.value = '';
    this.renderTestCases();
  }

  async removeTestCase(index) {
    const testCases = this.activeGame.testCases || [];
    testCases.splice(index, 1);
    await this.storage.updateGame(this.activeGame.id, { testCases });
    this.activeGame.testCases = testCases;
    this.renderTestCases();
  }

  async deleteActiveGame() {
    if (!this.activeGame) return;
    const confirmed = confirm(`Delete "${this.activeGame.name}" and all its data?`);
    if (!confirmed) return;

    await this.storage.deleteGame(this.activeGame.id);
    await this.showGameList();
  }

  updateAnalyzeButton() {
    const hasFrames = this.capturesGrid.children.length > 0;
    const hasDocs = this.docsList.children.length > 0;
    this.analyzeBtn.disabled = !(hasFrames || hasDocs);
  }

  // --- Screen Capture ---

  /**
   * Open the capture flow in a dedicated extension window.
   *
   * The action popup is torn down by Chrome the instant it loses focus, which
   * previously killed the capture session as soon as the user clicked the game
   * they were capturing. A standalone window survives focus changes.
   */
  async startScreenCapture() {
    if (!this.activeGame) return;

    if (!ScreenCapture.isSupported()) {
      this.showError('Screen capture is not supported in this browser.');
      return;
    }

    const params = new URLSearchParams({
      gameId: this.activeGame.id,
      gameName: this.activeGame.name
    });
    const url = chrome.runtime.getURL(`capture/capture.html?${params.toString()}`);

    try {
      await chrome.windows.create({
        url,
        type: 'popup',
        width: 460,
        height: 560
      });
      // The popup will likely close now that focus moved to the new window.
      // Frames are persisted by the capture window and picked up via the
      // FRAMES_SAVED message / on next popup open.
    } catch (e) {
      this.showError(`Could not open the capture window: ${e.message}`);
    }
  }

  // --- Analysis ---

  async runAnalysis() {
    const { apiKey, aiProvider, geminiModel } = await chrome.storage.local.get(['apiKey', 'aiProvider', 'geminiModel']);

    if (!apiKey) {
      this.showError('Please configure your API key in settings.');
      return;
    }

    const frames = await this.storage.getFrames(this.activeGame.id);
    const docs = await this.storage.getDocuments(this.activeGame.id);

    if (frames.length === 0 && docs.length === 0) {
      this.showError('No captures or documents to analyze.');
      return;
    }

    const instructions = this.customInstructions.value.trim();

    try {
      this.showProgress();
      this.resultsSection.classList.add('hidden');

      const analyzer = new AIComplianceAnalyzer(apiKey, aiProvider || 'openai', { geminiModel });
      const complianceChecker = new ComplianceChecker();
      let allFindings = [];

      const totalSteps = frames.length + docs.length;
      let currentStep = 0;

      // Analyze captured frames
      for (let i = 0; i < frames.length; i++) {
        currentStep++;
        this.updateProgress(
          10 + (currentStep / totalSteps) * 70,
          `Analyzing frame ${i + 1} of ${frames.length}...`
        );
        const findings = await analyzer.analyzeImage(frames[i].dataUrl, '', instructions);
        allFindings.push(...findings);
      }

      // Analyze documents
      for (let i = 0; i < docs.length; i++) {
        currentStep++;
        this.updateProgress(
          10 + (currentStep / totalSteps) * 70,
          `Analyzing document: ${docs[i].name}...`
        );

        if (docs[i].type === 'pdf') {
          // PDF — analyze extracted text
          const findings = await analyzer.analyzeDocument(docs[i].content, instructions);
          allFindings.push(...findings);
        } else {
          // Image — analyze visually
          const findings = await analyzer.analyzeImage(docs[i].content, '', instructions);
          allFindings.push(...findings);
        }
      }

      this.updateProgress(85, 'Running compliance checks...');
      const complianceResults = complianceChecker.evaluate(allFindings);

      // Evaluate test cases
      let testCaseResults = [];
      const testCases = this.activeGame.testCases || [];
      if (testCases.length > 0) {
        this.updateProgress(88, 'Evaluating test cases...');
        testCaseResults = await analyzer.evaluateTestCases(testCases, frames, docs);
      }

      this.updateProgress(95, 'Generating report...');
      const report = ReportGenerator.createReport(complianceResults);
      report.testCaseResults = testCaseResults;

      // Save report
      await this.storage.saveReport(this.activeGame.id, report);
      this.analysisResults = report;

      this.updateProgress(100, 'Done!');
      setTimeout(() => {
        this.hideProgress();
        this.displayResults(report);
      }, 400);

    } catch (error) {
      this.hideProgress();
      this.showError(`Analysis failed: ${error.message}`);
    }
  }

  // --- Results Display ---

  displayResults(report) {
    this.resultsSection.classList.remove('hidden');

    const score = report.summary.overallScore;
    this.scoreValue.textContent = score;

    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (score / 100) * circumference;
    this.scoreRing.style.strokeDashoffset = offset;

    if (score >= 80) {
      this.scoreRing.style.stroke = 'var(--success)';
    } else if (score >= 60) {
      this.scoreRing.style.stroke = 'var(--warning)';
    } else {
      this.scoreRing.style.stroke = 'var(--critical)';
    }

    this.criticalCount.textContent = `${report.summary.criticalIssues} Critical`;
    this.warningCount.textContent = `${report.summary.warnings} Warnings`;
    this.infoCount.textContent = `${report.summary.info} Info`;

    this.findingsList.innerHTML = '';
    report.findings.forEach((finding) => {
      const item = this.createFindingElement(finding);
      this.findingsList.appendChild(item);
    });

    // Test case results
    this.testCaseResults.innerHTML = '';
    if (report.testCaseResults && report.testCaseResults.length > 0) {
      for (const tc of report.testCaseResults) {
        const el = document.createElement('div');
        el.className = 'tc-result';

        const badgeClass = tc.result === 'pass' ? 'pass' : tc.result === 'fail' ? 'fail' : 'na';
        const badgeText = tc.result === 'pass' ? 'Pass' : tc.result === 'fail' ? 'Fail' : 'N/A';

        el.innerHTML = `
          <div class="tc-result-header">
            <span class="tc-result-badge ${badgeClass}">${badgeText}</span>
            <span class="tc-result-name">${this.escapeHtml(tc.testCase)}</span>
          </div>
          <p class="tc-result-reason">${this.escapeHtml(tc.reason)}</p>
        `;
        this.testCaseResults.appendChild(el);
      }
    }
  }

  createFindingElement(finding) {
    const item = document.createElement('div');
    item.className = 'finding-item';
    item.innerHTML = `
      <div class="finding-header">
        <div class="finding-severity ${finding.severity}"></div>
        <span class="finding-title">${this.escapeHtml(finding.category)}</span>
        <span class="finding-chevron">▶</span>
      </div>
      <div class="finding-body">
        <p class="finding-description">${this.escapeHtml(finding.description)}</p>
        <div class="finding-meta">
          <span class="finding-meta-item"><strong>Reference:</strong> ${this.escapeHtml(finding.gliReference)}</span>
        </div>
        ${finding.recommendation ? `<div class="finding-recommendation">💡 ${this.escapeHtml(finding.recommendation)}</div>` : ''}
      </div>
    `;

    item.querySelector('.finding-header').addEventListener('click', () => {
      item.classList.toggle('expanded');
    });

    return item;
  }

  // --- Export ---

  exportJSON() {
    if (!this.analysisResults) return;
    const blob = new Blob([JSON.stringify(this.analysisResults, null, 2)], { type: 'application/json' });
    this.downloadBlob(blob, `${this.activeGame.name}-compliance-report.json`);
  }

  async exportPDF() {
    if (!this.analysisResults) return;
    try {
      const pdfBlob = await ReportGenerator.exportPDF(this.analysisResults);
      this.downloadBlob(pdfBlob, `${this.activeGame.name}-compliance-report.pdf`);
    } catch (error) {
      this.showError('PDF export failed. Try JSON export instead.');
    }
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Progress ---

  showProgress() {
    this.progressContainer.classList.remove('hidden');
    this.analyzeBtn.disabled = true;
  }

  hideProgress() {
    this.progressContainer.classList.add('hidden');
    this.updateAnalyzeButton();
  }

  updateProgress(percent, text) {
    this.progressFill.style.width = `${percent}%`;
    this.progressText.textContent = text;
  }

  // --- Error ---

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorContainer.classList.remove('hidden');
  }

  hideError() {
    this.errorContainer.classList.add('hidden');
  }

  // --- Utilities ---

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
