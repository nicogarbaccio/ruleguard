/**
 * Tests for AIComplianceAnalyzer.fetchWithRetry error handling.
 *
 * These focus on how the client surfaces failures so the popup can show a
 * meaningful message instead of a generic error.
 */

const { loadModule } = require('./helpers/module-loader.js');

/**
 * Build a fake fetch Response.
 */
function mockResponse({ status = 200, body = '', headers = {} } = {}) {
  const ok = status >= 200 && status < 300;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    ok,
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null
    },
    text: async () => text,
    json: async () => (typeof body === 'string' ? JSON.parse(body || '{}') : body)
  };
}

/**
 * Create an analyzer whose `fetch` is the provided mock and whose retry
 * delay is zeroed so tests run fast.
 */
function makeAnalyzer(fetchMock, provider = 'openai') {
  const { AIComplianceAnalyzer } = loadModule('lib/ai-client.js', { fetch: fetchMock });
  const analyzer = new AIComplianceAnalyzer('test-key', provider);
  analyzer.retryDelay = 0;
  return analyzer;
}

const URL = 'https://api.openai.com/v1/chat/completions';
const OPTIONS = { method: 'POST' };

describe('AIComplianceAnalyzer.fetchWithRetry', () => {
  it('returns parsed JSON on a successful response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      mockResponse({ status: 200, body: { choices: [{ message: { content: 'ok' } }] } })
    );
    const analyzer = makeAnalyzer(fetchMock);

    const result = await analyzer.fetchWithRetry(URL, OPTIONS);

    expect(result).toEqual({ choices: [{ message: { content: 'ok' } }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast on 401 without retrying and includes a readable message', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      mockResponse({
        status: 401,
        body: { error: { message: 'Incorrect API key provided' } }
      })
    );
    const analyzer = makeAnalyzer(fetchMock);

    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/HTTP 401/);
    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/Incorrect API key provided/);
    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/API key/i);

    // Called once per invocation above (3), never retried.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 400 bad request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      mockResponse({ status: 400, body: { error: { message: 'image too large' } } })
    );
    const analyzer = makeAnalyzer(fetchMock);

    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx errors up to maxRetries then throws a readable error', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      mockResponse({ status: 503, body: { error: { message: 'service unavailable' } } })
    );
    const analyzer = makeAnalyzer(fetchMock);

    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/HTTP 503/);
    expect(fetchMock).toHaveBeenCalledTimes(analyzer.maxRetries);
  });

  it('throws a clear rate-limit error after exhausting retries on 429 (never returns undefined)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      mockResponse({ status: 429, headers: { 'retry-after': '0' } })
    );
    const analyzer = makeAnalyzer(fetchMock);

    // Previously this path fell out of the loop and resolved to `undefined`,
    // which then blew up downstream. It must reject with a clear message.
    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/429|[Rr]ate limit/);
    expect(fetchMock).toHaveBeenCalledTimes(analyzer.maxRetries);
  });

  it('succeeds if a retryable failure recovers before maxRetries', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 500, body: { error: { message: 'oops' } } }))
      .mockResolvedValueOnce(
        mockResponse({ status: 200, body: { choices: [{ message: { content: 'recovered' } }] } })
      );
    const analyzer = makeAnalyzer(fetchMock);

    const result = await analyzer.fetchWithRetry(URL, OPTIONS);

    expect(result.choices[0].message.content).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries network failures (TypeError) and surfaces a connectivity message', async () => {
    const netError = new TypeError('Failed to fetch');
    const fetchMock = jest.fn().mockRejectedValue(netError);
    const analyzer = makeAnalyzer(fetchMock);

    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/Could not reach the AI provider/);
    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/Failed to fetch/);
    // Network errors are retryable, so each call hits fetch maxRetries times.
    expect(fetchMock).toHaveBeenCalledTimes(analyzer.maxRetries * 2);
  });

  it('parses Anthropic-style error bodies', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      mockResponse({ status: 401, body: { error: { message: 'invalid x-api-key' } } })
    );
    const analyzer = makeAnalyzer(fetchMock, 'anthropic');

    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/invalid x-api-key/);
  });

  it('handles a non-JSON error body without throwing a parse error', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      mockResponse({ status: 500, body: 'Internal Server Error (plain text)' })
    );
    const analyzer = makeAnalyzer(fetchMock);

    await expect(analyzer.fetchWithRetry(URL, OPTIONS)).rejects.toThrow(/Internal Server Error/);
  });
});

describe('AIComplianceAnalyzer provider response parsing', () => {
  function analyzerFor(provider) {
    const { AIComplianceAnalyzer } = loadModule('lib/ai-client.js', { fetch: jest.fn() });
    return new AIComplianceAnalyzer('test-key', provider);
  }

  it('extracts content from a Gemini response shape', () => {
    const analyzer = analyzerFor('gemini');
    const response = {
      candidates: [{ content: { parts: [{ text: 'hello ' }, { text: 'world' }] } }]
    };
    expect(analyzer.extractContent(response)).toBe('hello world');
  });

  it('extracts content from an OpenAI response shape', () => {
    const analyzer = analyzerFor('openai');
    expect(analyzer.extractContent({ choices: [{ message: { content: 'hi' } }] })).toBe('hi');
  });

  it('extracts content from an Anthropic response shape', () => {
    const analyzer = analyzerFor('anthropic');
    expect(analyzer.extractContent({ content: [{ text: 'hi' }] })).toBe('hi');
  });

  it('parses findings from a Gemini JSON response', () => {
    const analyzer = analyzerFor('gemini');
    const findings = [{ severity: 'info', category: 'X', description: 'd', gliReference: 'r', recommendation: 'r' }];
    const response = {
      candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify({ findings }) + '\n```' }] } }]
    };
    expect(analyzer.parseFindings(response)).toEqual(findings);
  });

  it('builds the Gemini generateContent URL and api-key header', () => {
    const analyzer = analyzerFor('gemini');
    expect(analyzer.geminiUrl()).toContain('generativelanguage.googleapis.com');
    expect(analyzer.geminiUrl()).toContain(':generateContent');
    expect(analyzer.geminiHeaders()['x-goog-api-key']).toBe('test-key');
  });

  it('converts a data URL into a Gemini inline_data part', () => {
    const analyzer = analyzerFor('gemini');
    const part = analyzer.geminiInlineImage('data:image/jpeg;base64,QUJD');
    expect(part).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
  });
});

describe('AIComplianceAnalyzer.getRateLimitWait', () => {
  function analyzerFor(provider = 'gemini') {
    const { AIComplianceAnalyzer } = loadModule('lib/ai-client.js', { fetch: jest.fn() });
    const analyzer = new AIComplianceAnalyzer('test-key', provider);
    analyzer.retryDelay = 1000;
    return analyzer;
  }

  it('honors the Retry-After header when present', async () => {
    const analyzer = analyzerFor();
    const resp = mockResponse({ status: 429, headers: { 'retry-after': '12' } });
    await expect(analyzer.getRateLimitWait(resp, 0)).resolves.toBe(12000);
  });

  it("parses Gemini's retryDelay from the error body", async () => {
    const analyzer = analyzerFor();
    const resp = mockResponse({
      status: 429,
      body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ retryDelay: '37s' }] } }
    });
    // mockResponse has no clone(); getRateLimitWait falls back to the response itself.
    await expect(analyzer.getRateLimitWait(resp, 0)).resolves.toBe(37000);
  });

  it('falls back to at least a 5s backoff when no hint is provided', async () => {
    const analyzer = analyzerFor();
    const resp = mockResponse({ status: 429, body: { error: { message: 'slow down' } } });
    await expect(analyzer.getRateLimitWait(resp, 0)).resolves.toBeGreaterThanOrEqual(5000);
  });
});
