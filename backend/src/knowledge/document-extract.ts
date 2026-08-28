import { BadRequestException } from '@nestjs/common';

/**
 * Getting plain text out of an uploaded file.
 *
 * Everything downstream — chunking, embedding, retrieval — works on text, so
 * this is the only place that knows about file formats.
 *
 * The important case is the one that looks like success: a PDF made of scanned
 * page images extracts almost nothing, and without a check it would index a
 * handful of stray characters, report "ready", and then answer every question
 * about that document with silence. Extraction that yields too little for the
 * file's size is treated as a failure with an explanation, not as an empty
 * document.
 */

export type ExtractKind = 'text' | 'pdf' | 'docx';

export interface Extracted {
  text: string;
  kind: ExtractKind;
  /** Pages, when the format has them. Null otherwise. */
  pages: number | null;
}

const TEXT_MIMES = new Set([
  'text/plain', 'text/markdown', 'text/x-markdown', 'text/csv',
  'application/json', 'application/x-ndjson',
]);
const PDF_MIMES = new Set(['application/pdf']);
const DOCX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** A PDF yielding fewer than this many characters per page is almost certainly scanned. */
const MIN_CHARS_PER_PAGE = 40;

export function detectKind(mimeType: string | undefined, filename: string | undefined): ExtractKind | null {
  const mime = (mimeType ?? '').toLowerCase().split(';')[0].trim();
  const name = (filename ?? '').toLowerCase();

  if (PDF_MIMES.has(mime) || name.endsWith('.pdf')) return 'pdf';
  if (DOCX_MIMES.has(mime) || name.endsWith('.docx')) return 'docx';
  if (TEXT_MIMES.has(mime) || /\.(md|markdown|txt|csv|json|ndjson)$/.test(name)) return 'text';

  // Browsers sometimes send application/octet-stream for a known extension, so
  // the extension check above runs first and this is a genuine unknown.
  return null;
}

export async function extractText(
  buffer: Buffer,
  mimeType: string | undefined,
  filename: string | undefined,
): Promise<Extracted> {
  const kind = detectKind(mimeType, filename);
  if (!kind) {
    throw new BadRequestException(
      `"${filename ?? 'that file'}" is not a supported type. Upload a PDF, Word document (.docx), Markdown, text, CSV or JSON file.`,
    );
  }

  if (kind === 'text') {
    const text = buffer.toString('utf8');
    if (!text.trim()) throw new BadRequestException('That file is empty.');
    return { text, kind, pages: null };
  }

  if (kind === 'pdf') {
    // Imported lazily: pdf-parse pulls in a sizable pdf.js runtime, and a
    // deployment that never uploads a PDF should not pay for it at boot.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const res = await parser.getText();
      const text = (res.text ?? '').trim();
      const pages = Number(res.total ?? 0) || null;

      if (!text) {
        throw new BadRequestException(
          'No text could be read from that PDF. If it is a scan or photographs of pages, the text has to be recognised (OCR) before it can be indexed.',
        );
      }
      if (pages && text.length < pages * MIN_CHARS_PER_PAGE) {
        throw new BadRequestException(
          `Only ${text.length} characters were readable across ${pages} pages, which usually means the PDF is scanned images rather than text. It needs OCR before it can be indexed.`,
        );
      }
      return { text, kind, pages };
    } finally {
      await parser.destroy?.().catch(() => {});
    }
  }

  // docx
  const mammoth = await import('mammoth');
  const res = await mammoth.extractRawText({ buffer });
  const text = (res.value ?? '').trim();
  if (!text) {
    throw new BadRequestException('No text could be read from that Word document.');
  }
  return { text, kind, pages: null };
}
