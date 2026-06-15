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

  providerLabel(provider) {
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic';
      case 'gemini': return 'Google Gemini';
      default: return provider;
    }
  }

  async testConnection() {
    const apiKey = this.apiKeyInput.value.trim();
    const provider = this.providerSelect.value;
    const providerLabel = this.providerLabel(provider);

    if (!apiKey) {
      this.showStatus('Please enter an API key first.', 'error');
      return;
    }

    // Catch the most common mistake: a key that doesn't match the selected
    // provider (e.g. an OpenAI key while the provider is set to Anthropic),
    // which the API would otherwise reject with a confusing 401.
    const mismatch = this.detectKeyProviderMismatch(apiKey, provider);
    if (mismatch) {
      this.showStatus(mismatch, 'error');
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
      } else if (provider === 'gemini') {
        // Validate against ListModels (GET) rather than generateContent.
        // generateContent consumes the free tier's tight request quota and
        // can return 429 even for a valid key; listing models does not.
        response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models',
          {
            method: 'GET',
            headers: { 'x-goog-api-key': apiKey }
          }
        );
      } else {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            // Required for direct browser/extension-origin calls, otherwise
            // Anthropic rejects the request (often as a misleading 401).
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'test' }]
          })
        });
      }

      if (response.ok || response.status === 200) {
        this.showStatus(`Connection successful! Your ${providerLabel} API key is valid.`, 'success');
      } else if (response.status === 401 || response.status === 403) {
        this.showStatus(
          `${providerLabel} rejected this key (${response.status}). Make sure the "AI Provider" dropdown matches the key you entered.`,
          'error'
        );
      } else if (response.status === 429) {
        this.showStatus(
          `${providerLabel} rate limit reached (429). The key is valid but you've hit the quota — wait a moment before running an analysis.`,
          'error'
        );
      } else {
        this.showStatus(`${providerLabel} connection test returned status ${response.status}. Key may still be valid.`, 'error');
      }
    } catch (error) {
      this.showStatus(`Connection to ${providerLabel} failed: ${error.message}`, 'error');
    } finally {
      this.testBtn.disabled = false;
      this.testBtn.textContent = 'Test Connection';
    }
  }

  /**
   * Returns a warning message if the API key's prefix doesn't match the
   * selected provider, otherwise null.
   *   - Anthropic keys start with "sk-ant-"
   *   - OpenAI keys start with "sk-" (but never "sk-ant-")
   *   - Gemini (Google AI Studio) keys start with "AIza"
   */
  detectKeyProviderMismatch(apiKey, provider) {
    const isAnthropicKey = apiKey.startsWith('sk-ant-');
    const isOpenAIKey = apiKey.startsWith('sk-') && !isAnthropicKey;
    const isGeminiKey = apiKey.startsWith('AIza');

    if (provider === 'openai' && (isAnthropicKey || isGeminiKey)) {
      const looksLike = isAnthropicKey ? 'an Anthropic key (sk-ant-…)' : 'a Google Gemini key (AIza…)';
      return `This looks like ${looksLike} but the provider is set to OpenAI. Switch the provider to match, or use an OpenAI key.`;
    }
    if (provider === 'anthropic' && (isOpenAIKey || isGeminiKey)) {
      const looksLike = isGeminiKey ? 'a Google Gemini key (AIza…)' : 'an OpenAI key';
      return `This looks like ${looksLike} but the provider is set to Anthropic. Switch the provider to match, or use an Anthropic key.`;
    }
    if (provider === 'gemini' && (isAnthropicKey || isOpenAIKey)) {
      const looksLike = isAnthropicKey ? 'an Anthropic key (sk-ant-…)' : 'an OpenAI key (sk-…)';
      return `This looks like ${looksLike} but the provider is set to Google Gemini. Switch the provider to match, or use a Gemini key.`;
    }
    return null;
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
