-- =============================================================================
-- Knowledge base — retrieval-augmented answers for the role-scoped assistants
--
-- Two tables:
--   kb_documents  one row per uploaded source (a PDF, a markdown file, …)
--   kb_chunks     the retrievable pieces, each with its embedding
--
-- WHY 768 DIMENSIONS
--   gemini-embedding-001 returns 3072 by default, but pgvector's index types
--   cap at 2000 — a 3072-wide column can be stored but never indexed, so every
--   query degrades to a sequential scan over the whole corpus. The model
--   supports Matryoshka truncation, so we request 768 at embed time: indexable,
--   a quarter of the storage, and enough separation for a corpus this size.
--   The ingestion service MUST request the same 768, or vectors written by one
--   path will be uncomparable with another.
--
-- WHY SCOPE IS ON THE CHUNK, NOT JUST THE DOCUMENT
--   Retrieval ranks chunks, so the filter has to sit where the ranking happens.
--   Carrying scope + workspace_id on the chunk lets the WHERE clause run before
--   the similarity ordering rather than after it — the difference between
--   tenant isolation and a leak that only shows up under load.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ── documents ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kb_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'platform'  — visible to super admins only (policies, compliance, product)
  -- 'workspace' — visible to staff of workspace_id
  scope          text NOT NULL CHECK (scope IN ('platform', 'workspace')),
  workspace_id   uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,

  title          text NOT NULL,
  source_name    text,
  mime_type      text,
  byte_size      integer,

  -- 'pending' → 'indexing' → 'ready' | 'failed'. Kept so a half-ingested
  -- document is visibly incomplete instead of silently returning partial
  -- answers.
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'indexing', 'ready', 'failed')),
  error_message  text,
  chunk_count    integer NOT NULL DEFAULT 0,

  uploaded_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- A workspace document must name its workspace; a platform document must not.
  CONSTRAINT kb_documents_scope_workspace_ck CHECK (
    (scope = 'workspace' AND workspace_id IS NOT NULL) OR
    (scope = 'platform'  AND workspace_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS kb_documents_scope_idx
  ON public.kb_documents (scope, workspace_id, created_at DESC);

-- ── chunks ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES public.kb_documents(id) ON DELETE CASCADE,

  -- Denormalised from the parent so the scope filter can run inside the same
  -- query that does the vector ordering.
  scope         text NOT NULL CHECK (scope IN ('platform', 'workspace')),
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,

  chunk_index   integer NOT NULL,
  -- The section heading this chunk came from, shown in citations so a
  -- nutritionist can find the passage in the original document.
  heading       text,
  content       text NOT NULL,
  token_estimate integer,

  embedding     vector(768),

  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

-- HNSW rather than IVFFlat: it needs no training pass, so recall does not
-- collapse on a corpus that starts near-empty and grows one upload at a time.
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx
  ON public.kb_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS kb_chunks_scope_idx
  ON public.kb_chunks (scope, workspace_id);

-- Keyword recall alongside vectors: embeddings miss exact terms like a product
-- name or "GST", which trigram matching catches.
CREATE INDEX IF NOT EXISTS kb_chunks_content_trgm_idx
  ON public.kb_chunks USING gin (content gin_trgm_ops);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- The backend uses the service connection and bypasses RLS; these policies keep
-- direct/authenticated access correct if anything ever reads the tables without
-- going through the API.

ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_chunks    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read their documents" ON public.kb_documents;
CREATE POLICY "Workspace members read their documents"
  ON public.kb_documents FOR SELECT
  USING (
    scope = 'workspace' AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = kb_documents.workspace_id
         AND wm.user_id = auth.uid()
         AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Workspace members read their chunks" ON public.kb_chunks;
CREATE POLICY "Workspace members read their chunks"
  ON public.kb_chunks FOR SELECT
  USING (
    scope = 'workspace' AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = kb_chunks.workspace_id
         AND wm.user_id = auth.uid()
         AND wm.status = 'active'
    )
  );

COMMENT ON TABLE public.kb_documents IS
  'Knowledge-base sources for assistant retrieval. scope=platform is super-admin only; scope=workspace is scoped to that practice.';
COMMENT ON COLUMN public.kb_chunks.embedding IS
  '768-dim gemini-embedding-001 vector (Matryoshka-truncated). 768 because pgvector indexes cap at 2000 dims and the model defaults to 3072.';
