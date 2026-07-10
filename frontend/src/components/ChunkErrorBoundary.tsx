import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches errors from the lazy-loaded route tree. Critically, this includes
 * *failed dynamic imports* — <Suspense> only handles the pending state, it does
 * NOT catch a rejected import(). Without this boundary a stale/missing chunk
 * (e.g. after a redeploy or a service-worker cache mismatch) unmounts the whole
 * app to a blank white page.
 *
 * Behaviour:
 *   - Chunk-load error → force a one-time hard reload to fetch fresh chunks
 *     (guarded by sessionStorage so we never loop).
 *   - Any other render error → show a visible fallback with a Reload button
 *     instead of a silent blank screen.
 */
const RELOAD_GUARD_KEY = 'chunk-reload-attempted-at';
const RELOAD_WINDOW_MS = 15_000;

function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  if (!e) return false;
  const msg = `${e.name ?? ''} ${e.message ?? ''}`;
  return /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
}

interface State {
  error: Error | null;
}

export class ChunkErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ChunkErrorBoundary]', error, info.componentStack);

    if (isChunkLoadError(error)) {
      // A chunk went missing (redeploy / SW cache). Reload once to get the
      // fresh manifest — but guard against a reload loop if it keeps failing.
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
      } catch {
        /* sessionStorage unavailable — fall through to the manual fallback */
      }
      if (Date.now() - last > RELOAD_WINDOW_MS) {
        try {
          sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
        window.location.reload();
      }
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    return (
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 48,
          textAlign: 'center',
          color: '#1f2937',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 600 }}>
          {chunk ? 'Updating to the latest version…' : 'Something went wrong loading this page'}
        </div>
        <div style={{ fontSize: 14, color: '#6b7280', maxWidth: 460 }}>
          {chunk
            ? 'A new version is available. If this screen stays, click reload.'
            : error.message || 'An unexpected error occurred while rendering this page.'}
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.removeItem(RELOAD_GUARD_KEY);
            } catch {
              /* ignore */
            }
            window.location.reload();
          }}
          style={{
            marginTop: 8,
            borderRadius: 10,
            border: 'none',
            background: '#0b7c88',
            color: '#fff',
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
