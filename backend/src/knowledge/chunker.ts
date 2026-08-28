/**
 * Splitting a document into retrievable pieces.
 *
 * Chunking decides retrieval quality more than any model choice does. A chunk
 * that answers a question on its own is useful; half an answer that trails off
 * mid-sentence is worse than nothing, because it retrieves confidently and
 * then gives the model an incomplete premise to reason from.
 *
 * So the strategy is structural first, mechanical only as a fallback:
 *
 *   1. Markdown headings mark author-intended boundaries. A section under one
 *      `##` is almost always a complete thought, so it becomes one chunk and
 *      keeps its heading - which also gives citations something to name.
 *   2. Only a section too long to embed well is split further, on paragraph
 *      breaks, with overlap so a sentence spanning the seam survives in both.
 *   3. A document with no headings at all falls back to paragraph packing.
 */

export interface Chunk {
  index: number;
  heading: string | null;
  content: string;
  tokenEstimate: number;
}

/** Chars, not tokens - roughly 1500 chars ≈ 375 tokens, well inside the model's limit. */
const TARGET_CHARS = 1500;
const MAX_CHARS = 2400;
const OVERLAP_CHARS = 200;
/** Below this a chunk is too thin to answer anything; it gets merged forward. */
const MIN_CHARS = 120;

/** Rough token count. Only used for reporting, never for slicing. */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/** Split long text on paragraph boundaries, packing up to TARGET_CHARS with overlap. */
function packParagraphs(text: string): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = '';

  for (const p of paras) {
    // A single paragraph longer than the hard cap is split on sentence ends.
    if (p.length > MAX_CHARS) {
      if (buf) { out.push(buf); buf = ''; }
      const sentences = p.split(/(?<=[.!?])\s+/);
      let s = '';
      for (const sentence of sentences) {
        if (s && (s + ' ' + sentence).length > TARGET_CHARS) { out.push(s); s = sentence; }
        else s = s ? s + ' ' + sentence : sentence;
      }
      if (s) out.push(s);
      continue;
    }

    if (buf && (buf + '\n\n' + p).length > TARGET_CHARS) {
      out.push(buf);
      // Carry the tail forward so a thought spanning the boundary is not lost.
      const tail = buf.slice(-OVERLAP_CHARS);
      const cut = tail.indexOf(' ');
      buf = (cut > -1 ? tail.slice(cut + 1) : tail) + '\n\n' + p;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Split a document into chunks.
 *
 * `title` is prepended to every chunk's stored content. Retrieval sees one
 * chunk with no surrounding document, so without it a passage about "the
 * review queue" carries no clue which product it belongs to.
 */
export function chunkDocument(title: string, text: string): Chunk[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  const chunks: Chunk[] = [];
  const push = (heading: string | null, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    // Too small to stand alone - append to the previous chunk instead of
    // creating a fragment that will retrieve and say nothing.
    if (trimmed.length < MIN_CHARS && chunks.length) {
      const prev = chunks[chunks.length - 1];
      prev.content += '\n\n' + trimmed;
      prev.tokenEstimate = estimateTokens(prev.content);
      return;
    }
    const prefix = heading ? `${title} — ${heading}\n\n` : `${title}\n\n`;
    const content = prefix + trimmed;
    chunks.push({
      index: chunks.length,
      heading,
      content,
      tokenEstimate: estimateTokens(content),
    });
  };

  // Split on level-2 headings, keeping each heading with its body.
  const parts = clean.split(/\n(?=##\s+)/);
  const hasHeadings = parts.length > 1 || /^##\s+/.test(clean);

  if (!hasHeadings) {
    for (const body of packParagraphs(clean)) push(null, body);
    return chunks;
  }

  for (const part of parts) {
    const m = part.match(/^##\s+(.+)$/m);
    const heading = m ? m[1].trim() : null;
    const body = m ? part.slice(part.indexOf('\n', part.indexOf(m[0])) + 1) : part;

    if (body.trim().length <= MAX_CHARS) {
      push(heading, body);
    } else {
      // Long section: split it, but every piece keeps the heading so citations
      // still name where it came from.
      for (const piece of packParagraphs(body)) push(heading, piece);
    }
  }

  return chunks;
}
