/**
 * PDF Processor
 * Handles PDF text extraction using PDF.js.
 */

export class PDFProcessor {
  constructor() {
    this.pdfjsLib = null;
  }

  /**
   * Lazily load PDF.js library.
   */
  async loadPDFJS() {
    if (this.pdfjsLib) return;

    // PDF.js ships as a UMD bundle that attaches itself to the global
    // scope (window.pdfjsLib). It is loaded via a classic <script> tag in
    // popup.html before this module runs. It cannot be loaded with a
    // dynamic ESM import() because it has no ES exports.
    const globalScope = typeof window !== 'undefined' ? window : globalThis;

    if (globalScope.pdfjsLib) {
      this.pdfjsLib = globalScope.pdfjsLib;
    } else if (typeof pdfjsLib !== 'undefined') {
      this.pdfjsLib = pdfjsLib;
    } else {
      throw new Error('PDF.js library is not available. Ensure vendor/pdf.min.js is loaded.');
    }

    // Set worker source
    if (this.pdfjsLib.GlobalWorkerOptions) {
      const workerSrc = (globalScope.PDFJS_WORKER_SRC) || '../vendor/pdf.worker.min.js';
      this.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    }
  }

  /**
   * Extract all text content from a PDF file.
   * @param {File} file - The PDF file to process
   * @returns {string} Extracted text content
   */
  async extractText(file) {
    await this.loadPDFJS();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    const totalPages = pdf.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map(item => item.str)
        .join(' ');

      fullText += `\n--- Page ${pageNum} ---\n${pageText}`;
    }

    return fullText.trim();
  }

  /**
   * Extract structured content from a PDF (headings, sections, tables).
   * @param {File} file - The PDF file to process
   * @returns {Object} Structured content with sections
   */
  async extractStructured(file) {
    await this.loadPDFJS();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const sections = [];
    let currentSection = { title: 'Introduction', content: '' };

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      for (const item of textContent.items) {
        // Detect headings by font size (heuristic)
        const fontSize = item.transform ? Math.abs(item.transform[0]) : 12;

        if (fontSize > 14 && item.str.trim().length > 0) {
          // Likely a heading - start new section
          if (currentSection.content.trim()) {
            sections.push({ ...currentSection });
          }
          currentSection = { title: item.str.trim(), content: '' };
        } else {
          currentSection.content += item.str + ' ';
        }
      }
    }

    // Push last section
    if (currentSection.content.trim()) {
      sections.push(currentSection);
    }

    return {
      pageCount: pdf.numPages,
      sections,
      fullText: sections.map(s => `${s.title}\n${s.content}`).join('\n\n')
    };
  }

  /**
   * Get metadata from a PDF file.
   * @param {File} file - The PDF file
   * @returns {Object} PDF metadata
   */
  async getMetadata(file) {
    await this.loadPDFJS();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const metadata = await pdf.getMetadata();

    return {
      title: metadata.info?.Title || file.name,
      author: metadata.info?.Author || 'Unknown',
      pages: pdf.numPages,
      creationDate: metadata.info?.CreationDate || null
    };
  }
}
