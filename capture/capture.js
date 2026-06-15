/**
 * RuleGuard — Standalone Capture Window controller.
 *
 * Runs in a persistent extension window (chrome.windows.create) instead of
 * the action popup. The action popup is destroyed by Chrome whenever it loses
 * focus, which killed the capture session the moment the user clicked the game
 * they were trying to capture. A dedicated window survives focus changes, so
 * the user can freely interact with the game while capturing.
 */

import { ScreenCapture } from '../lib/screen-capture.js';
import { Storage } from '../lib/storage.js';

class CaptureController {
  constructor() {
    this.storage = new Storage();
    this.screenCapture = new ScreenCapture();
    this.previewInterval = null;
    this.streamWatch = null;
    this.saved = false;

    const params = new URLSearchParams(location.search);
    this.gameId = params.get('gameId');
    this.gameName = params.get('gameName') || 'this game';

    this.bindElements();
    this.bindEvents();
    this.gameLabel.textContent = this.gameName;
  }

  bindElements() {
    this.idle = document.getElementById('idle');
    this.active = document.getElementById('active');
    this.startBtn = document.getElementById('start-btn');
    this.captureBtn = document.getElementById('capture-btn');
    this.stopBtn = document.getElementById('stop-btn');
    this.frameCountEl = document.getElementById('frame-count');
    this.previewCanvas = document.getElementById('preview-canvas');
    this.gameLabel = document.getElementById('game-label');
    this.errorEl = document.getElementById('error');
    this.errorText = document.getElementById('error-text');
  }

  bindEvents() {
    this.startBtn.addEventListener('click', () => this.start());
    this.captureBtn.addEventListener('click', () => this.captureFrame());
    this.stopBtn.addEventListener('click', () => this.stopAndClose());

    // Persist frames if the window is closed mid-session.
    window.addEventListener('beforeunload', () => {
      if (this.screenCapture.isCapturing || this.screenCapture.frameCount > 0) {
        // Best-effort synchronous-ish save; IndexedDB writes may not finish
        // on unload, so the primary save path is Stop & Save.
        this.persistFrames();
      }
    });
  }

  async start() {
    if (!this.gameId) {
      this.showError('No active game was provided. Close this window and try again from the popup.');
      return;
    }

    if (!ScreenCapture.isSupported()) {
      this.showError('Screen capture is not supported in this browser.');
      return;
    }

    const started = await this.screenCapture.start();
    if (!started) {
      this.showError('Screen sharing was cancelled or denied. Click Start Sharing to try again.');
      return;
    }

    this.hideError();
    this.idle.classList.add('hidden');
    this.active.classList.remove('hidden');
    this.frameCountEl.textContent = '0';

    this.previewInterval = setInterval(() => this.updatePreview(), 500);

    // Detect when the user stops sharing via the browser's own UI.
    this.streamWatch = setInterval(() => {
      if (!this.screenCapture.isCapturing) {
        clearInterval(this.streamWatch);
        this.stopAndClose();
      }
    }, 500);
  }

  captureFrame() {
    const dataUrl = this.screenCapture.captureFrame();
    if (dataUrl) {
      this.frameCountEl.textContent = this.screenCapture.frameCount;
      this.updatePreview();
    }
  }

  updatePreview() {
    if (!this.screenCapture.isCapturing) return;

    const thumbnail = this.screenCapture.getThumbnail(320);
    if (!thumbnail) return;

    const ctx = this.previewCanvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      this.previewCanvas.height = Math.round(320 * (img.height / img.width));
      ctx.drawImage(img, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
    };
    img.src = thumbnail;
  }

  async persistFrames() {
    if (this.saved) return 0;
    const frames = this.screenCapture.frames;
    if (!frames.length) return 0;

    this.saved = true;
    return this.storage.appendFrames(this.gameId, frames);
  }

  async stopAndClose() {
    clearInterval(this.previewInterval);
    clearInterval(this.streamWatch);

    const hadFrames = this.screenCapture.frameCount > 0;
    await this.persistFrames();
    this.screenCapture.stop();

    if (hadFrames) {
      // Let the popup (if open) know to refresh its capture list.
      chrome.runtime.sendMessage({ type: 'FRAMES_SAVED', gameId: this.gameId }, () => {
        // Ignore "no receiver" errors when the popup is closed.
        void chrome.runtime.lastError;
      });
    }

    window.close();
  }

  showError(message) {
    this.errorText.textContent = message;
    this.errorEl.classList.remove('hidden');
  }

  hideError() {
    this.errorEl.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => new CaptureController());
