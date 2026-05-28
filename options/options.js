/**
 * GLI Compliance Analyzer - Options Page Controller
 * Manages API key configuration and extension settings.
 */

class OptionsController {
  constructor() {
    this.form = document.getElementById('settings-form');
    this.apiKeyInput = document.getElementById('api-key');
    this.providerSelect = document.getElementById('ai-provider');
    this.maxImageSize = document.getElementById('max-image-size');
    this.compressionQuality = document.getElementById('compression-quality');
    this.qualityValue = document.getElementById('quality-value');
    this.toggleKeyBtn = document.getElementById('toggle-key');
    this.testBtn = document.getElementById('test-connection');
    this.statusMessage = document.getElementById('status-message');

    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadSettings();
  }

  bindEvents() {
    this.form.addEventListener('submit', (e) => this.saveSettings(e));
    this.toggleKeyBtn.addEventListener('click', () => this.toggleKeyVisibility());
    this.testBtn.addEventListener('click', () => this.testConnection());
    this.compressionQuality.addEventListener('input', () => {
      this.qualityValue.textContent = `${Math.round(this.compressionQuality.value * 100)}%`;
    });
  }

  async loadSettings() {
    const settings = await chrome.storage.local.get([
      'apiKey',
      'aiProvider',
      'maxImageSize',
      'compressionQuality'
    ]);

    if (settings.apiKey) this.apiKeyInput.value = settings.apiKey;
    if (settings.aiProvider) this.providerSelect.value = settings.aiProvider;
    if (settings.maxImageSize) this.maxImageSize.value = settings.maxImageSize;
    if (settings.compressionQuality) {
      this.compressionQuality.value = settings.compressionQuality;
      this.qualityValue.textContent = `${Math.round(settings.compressionQuality * 100)}%`;
    }
  }

  async saveSettings(event) {
    event.preventDefault();

    const settings = {
      apiKey: this.apiKeyInput.value.trim(),
      aiProvider: this.providerSelect.value,
      maxImageSize: parseInt(this.maxImageSize.value, 10),
      compressionQuality: parseFloat(this.compressionQuality.value)
    };

    // Validate
    if (!settings.apiKey) {
      this.showStatus('Please enter an API key.', 'error');
      return;
    }

    try {
      await chrome.storage.local.set(settings);
      this.showStatus('Settings saved successfully!', 'success');
    } catch (error) {
      this.showStatus(`Failed to save settings: ${error.message}`, 'error');
    }
  }

  toggleKeyVisibility() {
    const isPassword = this.apiKeyInput.type === 'password';
    this.apiKeyInput.type = isPassword ? 'text' : 'password';
    this.toggleKeyBtn.textContent = isPassword ? '🙈' : '👁️';
  }

  async testConnection() {
    const apiKey = this.apiKeyInput.value.trim();
    const provider = this.providerSelect.value;

    if (!apiKey) {
      this.showStatus('Please enter an API key first.', 'error');
      return;
    }

    this.testBtn.disabled = true;
    this.testBtn.textContent = 'Testing...';

    try {
      let response;

      if (provider === 'openai') {
        response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
      } else {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'test' }]
          })
        });
      }

      if (response.ok || response.status === 200) {
        this.showStatus('Connection successful! API key is valid.', 'success');
      } else if (response.status === 401) {
        this.showStatus('Invalid API key. Please check and try again.', 'error');
      } else {
        this.showStatus(`Connection test returned status ${response.status}. Key may still be valid.`, 'error');
      }
    } catch (error) {
      this.showStatus(`Connection failed: ${error.message}`, 'error');
    } finally {
      this.testBtn.disabled = false;
      this.testBtn.textContent = 'Test Connection';
    }
  }

  showStatus(message, type) {
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message ${type}`;
    this.statusMessage.classList.remove('hidden');

    setTimeout(() => {
      this.statusMessage.classList.add('hidden');
    }, 5000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});
