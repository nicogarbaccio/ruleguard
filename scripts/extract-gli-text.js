/**
 * GLI Text Extractor
 * 
 * Reads GLI PDF files from /gli-source-docs/ and extracts their text content
 * into the gli-context.js file that ships with the extension.
 * 
 * Usage:
 *   1. Place your GLI PDF files in the /gli-source-docs/ folder
 *   2. Run: node scripts/extract-gli-text.js
 *   3. The script updates assets/gli-standards/gli-context.js
 * 
 * Supported files:
 *   - gli-source-docs/GLI-11.pdf → GLI_11_FULL_TEXT
 *   - gli-source-docs/GLI-33.pdf → GLI_33_FULL_TEXT
 *   - gli-source-docs/GLI-*.pdf  → Additional standards
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'gli-source-docs');
const OUTPUT_FILE = path.join(ROOT, 'assets', 'gli-standards', 'gli-context.js');

async function extractTextFromPDF(filePath) {
  // Use pdfjs-dist for extraction
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  
  let fullText = '';
  
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
    
    if (i % 50 === 0) {
      console.log(`  Processed ${i}/${doc.numPages} pages...`);
    }
  }
  
  return fullText.trim();
}

function escapeForTemplate(text) {
  // Escape backticks and ${} for template literal embedding
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

async function main() {
  // Ensure source directory exists
  if (!fs.existsSync(SOURCE_DIR)) {
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
    console.log(`Created ${SOURCE_DIR}/`);
    console.log('');
    console.log('Place your GLI PDF files here:');
    console.log('  gli-source-docs/GLI-11.pdf');
    console.log('  gli-source-docs/GLI-33.pdf');
    console.log('  gli-source-docs/  (any other GLI-*.pdf)');
    console.log('');
    console.log('Then re-run this script.');
    return;
  }

  // Find all PDF files
  const pdfFiles = fs.readdirSync(SOURCE_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort();

  if (pdfFiles.length === 0) {
    console.log('No PDF files found in gli-source-docs/');
    console.log('Place your GLI PDF files there and re-run.');
    return;
  }

  console.log(`Found ${pdfFiles.length} PDF file(s):\n`);

  const documents = [];

  for (const file of pdfFiles) {
    const filePath = path.join(SOURCE_DIR, file);
    console.log(`Extracting: ${file}...`);
    
    try {
      const text = await extractTextFromPDF(filePath);
      const name = file.replace('.pdf', '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      
      documents.push({ name, file, text });
      console.log(`  ✓ ${text.length} characters extracted\n`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}\n`);
    }
  }

  if (documents.length === 0) {
    console.log('No documents were successfully extracted.');
    return;
  }

  // Generate the output file
  let output = `/**
 * GLI Standards Context (Auto-Generated)
 * 
 * Generated from PDF files in /gli-source-docs/
 * Last updated: ${new Date().toISOString()}
 * 
 * DO NOT EDIT MANUALLY — run "node scripts/extract-gli-text.js" to regenerate.
 */

`;

  // Export each document
  for (const doc of documents) {
    output += `/**\n * Source: ${doc.file}\n */\n`;
    output += `export const ${doc.name}_FULL_TEXT = \`\n${escapeForTemplate(doc.text)}\n\`;\n\n`;
  }

  // Combined context
  output += `/**\n * Combined context sent to the AI for analysis.\n */\n`;
  output += `export const GLI_STANDARDS_CONTEXT = \`\n`;
  
  for (const doc of documents) {
    output += `\${${doc.name}_FULL_TEXT}\n\n`;
  }

  output += `
## Common Red Flags for Non-Compliance
1. Missing or hidden RTP disclosure
2. Paytable values that don't match actual game math
3. Bonus terms that are ambiguous or contradictory
4. Missing malfunction clause
5. Artwork that implies higher win frequency than actual
6. Incomplete symbol descriptions
7. Missing bet range information
8. No maximum win disclosure
9. Unclear or missing bonus trigger conditions
10. Poor text readability (small fonts, low contrast)
11. Missing responsible gaming information
12. No game version or identification information

## Severity Classification Guidelines
- CRITICAL: Missing required disclosures, misleading information, mathematical inconsistencies
- WARNING: Ambiguous language, poor readability, incomplete but present information
- INFO: Best practice recommendations, optional improvements, minor clarity issues
\`;\n\n`;

  // References
  output += `/**
 * GLI standard section references for linking findings to specific requirements.
 */
export const GLI_REFERENCES = {
  'rtp-disclosure': 'GLI-11 Section 4.2.1',
  'rtp-prominence': 'GLI-11 Section 4.2.2',
  'rtp-variable': 'GLI-11 Section 4.2.3',
  'paytable-accuracy': 'GLI-11 Section 5.1',
  'paytable-clarity': 'GLI-11 Section 5.2',
  'wild-symbol': 'GLI-11 Section 5.3',
  'scatter-symbol': 'GLI-11 Section 5.4',
  'bonus-trigger': 'GLI-11 Section 6.1',
  'bonus-rules': 'GLI-11 Section 6.2',
  'bonus-prizes': 'GLI-11 Section 6.3',
  'bonus-exit': 'GLI-11 Section 6.4',
  'bonus-retrigger': 'GLI-11 Section 6.5',
  'malfunction': 'GLI-11 Section 1.7',
  'game-rules': 'GLI-11 Section 3.1',
  'bet-ranges': 'GLI-11 Section 4.1',
  'max-win': 'GLI-11 Section 4.3',
  'text-legibility': 'GLI-11 Section 7.1',
  'misleading-content': 'GLI-11 Section 7.2',
  'artwork-compliance': 'GLI-11 Section 7.3',
  'information-access': 'GLI-11 Section 7.4'
};\n`;

  fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`\n✓ Generated: ${OUTPUT_FILE}`);
  console.log(`  ${documents.length} document(s) embedded`);
  console.log(`  Total size: ${(output.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
