-- Knowledge base: full-text retrieval, replacing vector search.
--
-- The assistant no longer calls an external model for anything, so questions
-- can no longer be embedded at query time. Retrieval moves to Postgres text
-- search, which runs entirely inside the database.
--
-- The embedding column is deliberately left in place. It is nullable, nothing
-- reads it now, and dropping it would discard the vectors already computed for
-- the indexed corpus -- pointless to throw away when re-embedding later would
-- cost money and time.

-- Weighted document vector: a heading match is a stronger signal than a match
-- buried in body text, so headings carry weight A and content weight B.
ALTER TABLE public.kb_chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(heading, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS kb_chunks_tsv_idx
  ON public.kb_chunks USING gin (tsv);

-- Trigram on the heading as well as the existing one on content: questions are
-- often near-restatements of a section title, and trigram similarity catches
-- those even when stemming does not (plurals, hyphenation, product names).
CREATE INDEX IF NOT EXISTS kb_chunks_heading_trgm_idx
  ON public.kb_chunks USING gin (heading gin_trgm_ops);

COMMENT ON COLUMN public.kb_chunks.tsv IS
  'Weighted full-text vector (heading A, content B). Retrieval runs on this; the assistant makes no external calls.';

COMMENT ON COLUMN public.kb_chunks.embedding IS
  'Legacy 768-dim vector from the previous retrieval design. Unused - retrieval is now full-text. Retained so the corpus need not be re-embedded if vector search ever returns.';
