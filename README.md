# GLI Compliance Analyzer

A Chrome extension that analyzes slot game help screens, game rules, and artwork against GLI (Gaming Laboratories International) standards to identify compliance issues and red flags.

## Features

- **Image Analysis**: Upload help screen images for AI-powered compliance review
- **PDF Processing**: Parse game rules PDFs and check against GLI standards
- **OCR Text Extraction**: Automatically extract text from images using Tesseract.js
- **AI-Powered Analysis**: Uses OpenAI GPT-4o, Anthropic Claude, or Google Gemini for intelligent compliance checking
- **Rule-Based Checks**: Built-in detection for common compliance issues (missing RTP, malfunction clause, etc.)
- **Structured Reports**: Generate compliance reports with severity-coded findings
- **Export Options**: Export reports as JSON or PDF

## Quick Start

### Prerequisites

- Node.js 18+
- Chrome browser
- OpenAI or Anthropic API key

### Installation

```bash
# Install dependencies
npm install

# Build vendor files
node scripts/build.js

# Generate placeholder icons (replace with real icons for production)
node scripts/create-placeholder-icons.js
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `ruleguard` project directory
5. Click the extension icon and go to Settings to add your API key

## Project Structure

```
ruleguard/
├── manifest.json          # Chrome Extension Manifest V3
├── popup/                 # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── background/            # Service worker
│   └── service-worker.js
├── content/               # Content script (optional page interaction)
│   └── content-script.js
├── lib/                   # Core libraries
│   ├── ai-client.js       # OpenAI/Anthropic API integration
│   ├── pdf-processor.js   # PDF.js text extraction
│   └── pdf-worker-loader.js
├── utils/                 # Utility modules
│   ├── image-processor.js # Image handling & OCR
│   ├── compliance-checker.js # Rule engine & scoring
│   └── report-generator.js   # Report creation & export
├── assets/
│   ├── icons/             # Extension icons
│   └── gli-standards/     # Embedded GLI reference context
├── options/               # Settings page
│   ├── options.html
│   ├── options.css
│   └── options.js
├── vendor/                # Bundled third-party libraries (built)
├── tests/                 # Jest test suite
└── scripts/               # Build & packaging scripts
```

## GLI Compliance Checks

The analyzer checks for:

### Critical Issues
- Missing RTP (Return to Player) disclosure
- Missing malfunction clause
- Unclear or missing bonus terms and conditions
- Inconsistent paytable information
- Misleading artwork or promotional content

### Warnings
- Ambiguous payout descriptions
- Missing maximum win information
- Missing bet range documentation
- Unclear feature trigger conditions
- Poor readability (font size, contrast)

### Informational
- Missing volatility/variance information
- Best practice recommendations
- Suggested improvements for clarity

## Configuration

### API Provider Settings

Open the extension settings (gear icon) to configure:

- **AI Provider**: Choose between OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), or Google Gemini (2.0 Flash, free tier)
- **API Key**: Your provider API key (stored locally, never shared)
- **Image Settings**: Max dimension and compression quality

## Development

```bash
# Run tests
npm test

# Build vendor dependencies
node scripts/build.js

# Package for distribution
node scripts/package.js
```

## Testing

```bash
npm test
```

Tests cover:
- Compliance scoring algorithm
- Rule-based detection patterns
- Report generation and structure
- Finding deduplication

## Security

- API keys are stored in Chrome's local storage (never transmitted except to the configured AI provider)
- All processing happens client-side (images/PDFs are not uploaded to any server except the AI API)
- Content Security Policy restricts script execution
- Input validation on all user-provided files

## License

Private — Internal use only.
