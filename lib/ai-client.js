/**
 * AI Compliance Analyzer
 * Handles communication with OpenAI, Anthropic, or Google Gemini APIs for
 * compliance analysis.
 */

import { GLI_STANDARDS_CONTEXT } from '../assets/gli-standards/gli-context.js';

// Default model per provider.
const GEMINI_MODEL = 'gemini-2.0-flash';

// Gemini models selectable in Settings. Flash is fast/cheap and works on the
// free tier; Pro models are more capable but need higher quota (paid tier).
export const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (fast, free tier)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (balanced)' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (most capable, needs paid tier)' }
];

export class AIComplianceAnalyzer {
  /**
   * @param {string} apiKey
   * @param {string} provider - 'openai' | 'anthropic' | 'gemini'
   * @param {Object} [options]
   * @param {string} [options.geminiModel] - Gemini model id to use.
   */
  constructor(apiKey, provider = 'openai', options = {}) {
    this.apiKey = apiKey;
    this.provider = provider;
    this.geminiModel = options.geminiModel || GEMINI_MODEL;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Extract the assistant's text content from a provider response.
   * Centralizes the per-provider response shapes.
   */
  extractContent(response) {
    if (!response) return '';
    if (this.provider === 'anthropic') {
      return response.content?.[0]?.text || '';
    }
    if (this.provider === 'gemini') {
      const parts = response.candidates?.[0]?.content?.parts || [];
      return parts.map(p => p.text || '').join('');
    }
    return response.choices?.[0]?.message?.content || '';
  }

  /**
   * Analyze an image (help screen, paytable, artwork) for compliance issues.
   */
  async analyzeImage(imageBase64, ocrText = '', customInstructions = '') {
    const prompt = this.buildImageAnalysisPrompt(ocrText, customInstructions);

    const response = await this.callVisionAPI(imageBase64, prompt);
    return this.parseFindings(response);
  }

  /**
   * Analyze a text document (game rules, PDF content) for compliance issues.
   */
  async analyzeDocument(documentText, customInstructions = '') {
    const prompt = this.buildDocumentAnalysisPrompt(documentText, customInstructions);

    const response = await this.callTextAPI(prompt);
    return this.parseFindings(response);
  }

  /**
   * Evaluate custom test cases against captured frames and documents.
   * @param {Array} testCases - Array of test case strings
   * @param {Array} frames - Captured frame objects with dataUrl
   * @param {Array} docs - Document objects with content
   * @returns {Array} Results with { testCase, result, reason }
   */
  async evaluateTestCases(testCases, frames = [], docs = []) {
    // Build context summary from docs
    let docContext = '';
    for (const doc of docs) {
      if (doc.type === 'pdf') {
        const truncated = doc.content.length > 5000
          ? doc.content.substring(0, 5000) + '...'
          : doc.content;
        docContext += `\n[Document: ${doc.name}]\n${truncated}\n`;
      }
    }

    const testCaseList = testCases.map((tc, i) => `${i + 1}. ${tc}`).join('\n');

    const prompt = `You are a GLI-19 compliance evaluator. You have been given screen captures and documentation from an interactive gaming system.

${docContext ? `Document Context:\n${docContext}\n` : ''}

Evaluate each of the following test cases based on what you can observe in the provided images and documentation. For each test case, determine:
- "pass" — the requirement is clearly met
- "fail" — the requirement is clearly NOT met or is deficient
- "na" — the requirement does not apply to this game based on what you can see

Test Cases to Evaluate:
${testCaseList}

Return ONLY valid JSON in this exact format:
{
  "results": [
    {
      "testCase": "the test case text",
      "result": "pass|fail|na",
      "reason": "Brief explanation of why this determination was made"
    }
  ]
}`;

    let response;

    // If we have frames, use vision API with the first few frames for context
    if (frames.length > 0) {
      // Send up to 4 frames for context (API limits)
      const framesToSend = frames.slice(0, 4);
      response = await this.callVisionAPIMultiImage(framesToSend.map(f => f.dataUrl), prompt);
    } else {
      response = await this.callTextAPI(prompt);
    }

    // Parse response
    const content = this.extractContent(response);

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      return testCases.map(tc => ({
        testCase: tc,
        result: 'na',
        reason: 'Could not evaluate — AI response was not in expected format'
      }));
    }

    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      return parsed.results || [];
    } catch (e) {
      return testCases.map(tc => ({
        testCase: tc,
        result: 'na',
        reason: 'Could not evaluate — failed to parse AI response'
      }));
    }
  }

  /**
   * Call Vision API with multiple images (for test case evaluation).
   */
  async callVisionAPIMultiImage(imageDataUrls, prompt) {
    if (this.provider === 'anthropic') {
      return this.callAnthropicVisionMulti(imageDataUrls, prompt);
    }
    if (this.provider === 'gemini') {
      return this.callGeminiVisionMulti(imageDataUrls, prompt);
    }
    return this.callOpenAIVisionMulti(imageDataUrls, prompt);
  }

  async callOpenAIVisionMulti(imageDataUrls, prompt) {
    const content = [
      { type: 'text', text: prompt },
      ...imageDataUrls.map(url => ({
        type: 'image_url',
        image_url: {
          url: url.startsWith('data:') ? url : `data:image/png;base64,${url}`,
          detail: 'high'
        }
      }))
    ];

    const body = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content }],
      max_tokens: 4096,
      temperature: 0.1
    };

    return this.fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });
  }

  async callAnthropicVisionMulti(imageDataUrls, prompt) {
    const content = [
      ...imageDataUrls.map(url => {
        const imageContent = url.startsWith('data:') ? url.split(',')[1] : url;
        const mediaType = url.includes('image/jpeg') ? 'image/jpeg' : 'image/png';
        return {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageContent }
        };
      }),
      { type: 'text', text: prompt }
    ];

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content }]
    };

    return this.fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: this.anthropicHeaders(),
      body: JSON.stringify(body)
    });
  }

  /**
   * Build the prompt for image-based compliance analysis.
   */
  buildImageAnalysisPrompt(ocrText, customInstructions = '') {
    return `You are a GLI (Gaming Laboratories International) compliance expert analyzing interactive gaming documentation against GLI-19: Standards for Interactive Gaming Systems v3.0.

GLI-19 Standards Context:
${GLI_STANDARDS_CONTEXT}

${ocrText ? `OCR-Extracted Text from Image:\n${ocrText}\n` : ''}
${customInstructions ? `Additional Instructions from Analyst:\n${customInstructions}\n` : ''}

Analyze the provided image for compliance with GLI-19. Check for:

1. **Game Information & Rules of Play (Section 4.4)**: Are game rules clearly displayed? Are all winning combinations, paytables, and payout information accurate and accessible?
2. **RTP/Payout Percentages (Section 4.7)**: Is the theoretical RTP or payout percentage disclosed? Is it prominent?
3. **Bonus/Feature Requirements (Section 4.8)**: Are bonus features clearly explained with trigger conditions, rules, and outcomes?
4. **Player Interface (Section 4.2)**: Is the interface clear and not misleading? Is all required information visible?
5. **Game Fairness (Section 4.6)**: Does anything suggest unfair or misleading representation of odds?
6. **Progressive Jackpots (Section 4.13)**: If applicable, are progressive rules and conditions documented?
7. **Visual Clarity**: Is text readable? Are font sizes adequate? Is contrast sufficient?

Return your analysis as a JSON array of findings. Each finding should have:
- severity: "critical", "warning", or "info"
- category: Brief category name
- description: Detailed description of the issue
- gliReference: Relevant GLI-19 section reference (e.g., "GLI-19 Section 4.4")
- recommendation: Actionable fix recommendation

If the image is compliant in an area, include an "info" level finding noting compliance.

Return ONLY valid JSON in this format:
{
  "findings": [
    {
      "severity": "critical|warning|info",
      "category": "string",
      "description": "string",
      "gliReference": "string",
      "recommendation": "string"
    }
  ]
}`;
  }

  /**
   * Build the prompt for document-based compliance analysis.
   */
  buildDocumentAnalysisPrompt(documentText, customInstructions = '') {
    // Truncate very long documents to stay within token limits
    const maxChars = 15000;
    const truncatedText = documentText.length > maxChars
      ? documentText.substring(0, maxChars) + '\n\n[Document truncated for analysis...]'
      : documentText;

    return `You are a GLI (Gaming Laboratories International) compliance expert analyzing interactive gaming documentation against GLI-19: Standards for Interactive Gaming Systems v3.0.

GLI-19 Standards Context:
${GLI_STANDARDS_CONTEXT}

${customInstructions ? `Additional Instructions from Analyst:\n${customInstructions}\n` : ''}
Game Rules Document Content:
${truncatedText}

Analyze this game rules document for compliance with GLI-19. Check for:

1. **Game Information & Rules of Play (Section 4.4)**: Are all game mechanics fully described? Are rules complete and unambiguous?
2. **Payout Percentages & Odds (Section 4.7)**: Is the theoretical RTP stated? Is it within acceptable ranges?
3. **Bonus/Feature Requirements (Section 4.8)**: Are all bonus features explained with clear trigger conditions and outcomes?
4. **Paytable Information (Section 4.4)**: Are all symbol values and combinations documented?
5. **Game Session Requirements (Section 4.3)**: Are session rules (timeouts, disconnections) addressed?
6. **Progressive Jackpots (Section 4.13)**: If applicable, are progressive rules documented?
7. **Interrupted Games (Section 4.16)**: Is there a policy for interrupted/disconnected games?
8. **Player Interface (Section 4.2)**: Are bet ranges, autoplay rules, and controls documented?
9. **Game Fairness (Section 4.6)**: Is there anything suggesting unfair representation?
10. **Responsible Gaming**: Are responsible gaming references included?

Return your analysis as a JSON array of findings. Each finding should have:
- severity: "critical", "warning", or "info"
- category: Brief category name
- description: Detailed description of the issue
- gliReference: Relevant GLI-19 section reference
- recommendation: Actionable fix recommendation

Return ONLY valid JSON in this format:
{
  "findings": [
    {
      "severity": "critical|warning|info",
      "category": "string",
      "description": "string",
      "gliReference": "string",
      "recommendation": "string"
    }
  ]
}`;
  }

  /**
   * Call the Vision API (OpenAI or Anthropic) with an image.
   */
  async callVisionAPI(imageBase64, prompt) {
    if (this.provider === 'anthropic') {
      return this.callAnthropicVision(imageBase64, prompt);
    }
    if (this.provider === 'gemini') {
      return this.callGeminiVision(imageBase64, prompt);
    }
    return this.callOpenAIVision(imageBase64, prompt);
  }

  /**
   * Call the Text API for document analysis.
   */
  async callTextAPI(prompt) {
    if (this.provider === 'anthropic') {
      return this.callAnthropicText(prompt);
    }
    if (this.provider === 'gemini') {
      return this.callGeminiText(prompt);
    }
    return this.callOpenAIText(prompt);
  }

  // --- OpenAI Implementation ---

  async callOpenAIVision(imageBase64, prompt) {
    const body = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:')
                  ? imageBase64
                  : `data:image/png;base64,${imageBase64}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0.1
    };

    return this.fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });
  }

  async callOpenAIText(prompt) {
    const body = {
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 4096,
      temperature: 0.1
    };

    return this.fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });
  }

  // --- Anthropic Implementation ---

  /**
   * Standard headers for Anthropic API calls.
   *
   * `anthropic-dangerous-direct-browser-access` is REQUIRED when calling the
   * Anthropic API directly from a browser/extension origin. Without it,
   * Anthropic rejects the request — often as a 401 authentication_error even
   * when the key is valid.
   */
  anthropicHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
  }

  async callAnthropicVision(imageBase64, prompt) {
    const imageContent = imageBase64.startsWith('data:')
      ? imageBase64.split(',')[1]
      : imageBase64;

    const mediaType = imageBase64.includes('image/jpeg') ? 'image/jpeg' : 'image/png';

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageContent
              }
            },
            { type: 'text', text: prompt }
          ]
        }
      ]
    };

    return this.fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: this.anthropicHeaders(),
      body: JSON.stringify(body)
    });
  }

  async callAnthropicText(prompt) {
    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt }
      ]
    };

    return this.fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: this.anthropicHeaders(),
      body: JSON.stringify(body)
    });
  }

  // --- Gemini Implementation ---

  /**
   * Build the generateContent endpoint URL for the configured model.
   * The API key is passed via the x-goog-api-key header rather than the URL.
   */
  geminiUrl(model = this.geminiModel) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  }

  geminiHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey
    };
  }

  /**
   * Convert a data URL or raw base64 string into a Gemini inline_data part.
   */
  geminiInlineImage(dataUrl) {
    let mimeType = 'image/png';
    let data = dataUrl;

    if (dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        data = match[2];
      } else {
        data = dataUrl.split(',')[1] || dataUrl;
      }
    }

    return { inline_data: { mime_type: mimeType, data } };
  }

  async callGeminiVision(imageBase64, prompt) {
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            this.geminiInlineImage(imageBase64)
          ]
        }
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
    };

    return this.fetchWithRetry(this.geminiUrl(), {
      method: 'POST',
      headers: this.geminiHeaders(),
      body: JSON.stringify(body)
    });
  }

  async callGeminiVisionMulti(imageDataUrls, prompt) {
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            ...imageDataUrls.map(url => this.geminiInlineImage(url))
          ]
        }
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
    };

    return this.fetchWithRetry(this.geminiUrl(), {
      method: 'POST',
      headers: this.geminiHeaders(),
      body: JSON.stringify(body)
    });
  }

  async callGeminiText(prompt) {
    const body = {
      contents: [
        { role: 'user', parts: [{ text: prompt }] }
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
    };

    return this.fetchWithRetry(this.geminiUrl(), {
      method: 'POST',
      headers: this.geminiHeaders(),
      body: JSON.stringify(body)
    });
  }

  // --- Response Parsing ---

  parseFindings(response) {
    if (!response) {
      throw new Error('The AI provider returned an empty response. Please try the analysis again.');
    }

    const content = this.extractContent(response);

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || 
                      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      console.warn('Could not parse AI response as JSON:', content);
      return [{
        severity: 'info',
        category: 'Analysis Note',
        description: 'AI analysis completed but response format was unexpected. Raw response available in logs.',
        gliReference: 'N/A',
        recommendation: 'Re-run analysis or check API configuration.'
      }];
    }

    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      return parsed.findings || parsed;
    } catch (error) {
      console.warn('JSON parse error:', error, 'Content:', jsonMatch[1]);
      return [{
        severity: 'info',
        category: 'Parse Error',
        description: 'Could not parse AI response. The analysis may need to be re-run.',
        gliReference: 'N/A',
        recommendation: 'Try re-running the analysis with a clearer image or document.'
      }];
    }
  }

  // --- Network Utilities ---

  async fetchWithRetry(url, options) {
    let lastError;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        if (response.status === 429) {
          // Rate limited. Providers (esp. Gemini's free tier) often tell us
          // how long to wait — honor that, otherwise back off exponentially.
          const waitTime = await this.getRateLimitWait(response, attempt);
          lastError = new Error(
            `Rate limited by the AI provider (HTTP 429). ${this.provider === 'gemini'
              ? 'The Gemini free tier has tight per-minute/day quotas. '
              : ''}Please wait a moment and try again.`
          );
          // Don't sleep past the final attempt — fall through to throw a clear error.
          if (attempt < this.maxRetries - 1) {
            await this.sleep(waitTime);
            continue;
          }
          throw lastError;
        }

        if (!response.ok) {
          // 4xx errors (bad key, bad request, unsupported image) won't
          // succeed on retry — fail fast with a readable message.
          throw await this.buildApiError(response);
        }

        return await response.json();
      } catch (error) {
        lastError = error;

        // Only retry transient errors (network failures, 429, 5xx).
        if (!this.isRetryable(error) || attempt >= this.maxRetries - 1) {
          break;
        }
        await this.sleep(this.retryDelay * (attempt + 1));
      }
    }

    throw this.normalizeError(lastError);
  }

  /**
   * Determine how long to wait before retrying a 429.
   * Checks the standard Retry-After header, then Gemini's RetryInfo in the
   * error body (e.g. "retryDelay": "37s"), then falls back to an exponential
   * backoff with a sensible minimum for per-minute quota windows.
   */
  async getRateLimitWait(response, attempt) {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!Number.isNaN(seconds)) return seconds * 1000;
    }

    // Try to read a provider-supplied retry delay from the body.
    try {
      const clone = typeof response.clone === 'function' ? response.clone() : response;
      const text = await clone.text();
      const match = text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
      if (match) {
        return Math.ceil(parseFloat(match[1]) * 1000);
      }
    } catch {
      // ignore — fall through to backoff
    }

    // Exponential backoff, but at least a few seconds since free-tier limits
    // are typically per-minute.
    return Math.max(this.retryDelay * Math.pow(2, attempt), 5000);
  }

  /**
   * Build a readable Error from a failed API response, parsing the
   * provider's JSON error body when possible.
   */
  async buildApiError(response) {
    const status = response.status;
    let detail = '';

    try {
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        // OpenAI/Anthropic/Gemini all nest the message under error.message.
        detail = json?.error?.message || json?.message || text;
      } catch {
        detail = text;
      }
    } catch {
      detail = '';
    }

    let hint = '';
    if (status === 401 || status === 403) {
      hint = 'Check that your API key is correct and has access to the selected model in Settings.';
    } else if (status === 400) {
      hint = 'The request was rejected — the image or document may be too large or in an unsupported format.';
    } else if (status === 404) {
      hint = 'The model or endpoint was not found. Verify the selected AI provider in Settings.';
    } else if (status >= 500) {
      hint = 'The AI provider is having issues. Try again shortly.';
    }

    const parts = [`AI provider error (HTTP ${status})`];
    if (detail) parts.push(detail.trim());
    if (hint) parts.push(hint);

    const error = new Error(parts.join(' — '));
    error.status = status;
    error.retryable = status >= 500;
    return error;
  }

  /**
   * Whether an error is worth retrying.
   */
  isRetryable(error) {
    if (!error) return false;
    if (error.retryable === true) return true;
    if (error.retryable === false) return false;
    // fetch() throws TypeError on network/CORS failures — retry those.
    // Use name rather than instanceof so it holds across realms (e.g.
    // iframes/extension contexts) and is testable.
    if (error.name === 'TypeError') return true;
    return false;
  }

  /**
   * Turn low-level errors into messages an analyst can act on.
   */
  normalizeError(error) {
    if (!error) {
      return new Error('AI request failed with no response. Check your network connection and try again.');
    }
    if (error.name === 'TypeError') {
      return new Error(
        `Could not reach the AI provider (${error.message}). Check your internet connection and that the host is allowed in the extension permissions.`
      );
    }
    return error;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
