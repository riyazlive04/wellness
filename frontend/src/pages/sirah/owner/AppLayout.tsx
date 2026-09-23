import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  History,
  Loader2,
  RotateCcw,
  Save,
  Smartphone,
  Undo2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, SirahLoader } from '@/design-system';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { LayoutTree } from '@/modules/workspace/appLayout/LayoutTree';
import { NodeInspector } from '@/modules/workspace/appLayout/NodeInspector';
import {
  appLayoutApi,
  cloneWithNewIds,
  findNode,
  findParent,
  insertNode,
  makeNode,
  moveNode,
  removeNode,
  replaceNode,
  countNodes,
  type AnyNode,
  type ChildSlot,
  type ScreenKey,
  type UiScreen,
  type ValidationError,
} from '@/modules/workspace/api/appLayout';
import { cn } from '@/lib/utils';

const SCREENS: { key: ScreenKey; label: string; blurb: string }[] = [
  { key: 'home', label: 'Today', blurb: 'The dashboard clients land on.' },
  { key: 'more', label: 'More menu', blurb: 'The grouped navigation list.' },
  { key: 'tabs', label: 'Tab bar', blurb: 'Which tabs appear, and in what order.' },
  { key: 'onboarding', label: 'Onboarding', blurb: 'What new clients are asked.' },
];

/**
 * Client app layout editor.
 *
 * Edits a DRAFT. Nothing an author does here reaches a phone until they press
 * Publish, and publishing writes a history row so the previous layout can be
 * restored during an incident rather than reconstructed from memory.
 *
 * Validation runs against the server, not a local copy of the rules. The editor
 * would otherwise need its own implementation of the node catalog, and the two
 * would disagree the first time either changed.
 */
export default function AppLayoutPage() {
  const qc = useQueryClient();
  const { ownerName, initials } = useOwnerIdentity();

  // The practice name comes from the API rather than the localStorage draft
  // that older pages read: this screen is about what CLIENTS see, and showing
  // a stale practice name in the shell while editing their app is a bad look.
  const workspaceQ = useQuery({
    queryKey: ['workspace', 'me'],
    queryFn: workspacesApi.me,
    staleTime: 300_000,
  });
  const practiceName = workspaceQ.data?.display_name || workspaceQ.data?.name || 'Your practice';

  const [screen, setScreen] = useState<ScreenKey>('home');
  const [tree, setTree] = useState<UiScreen | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const catalogQ = useQuery({ queryKey: ['ui-catalog'], queryFn: appLayoutApi.catalog, staleTime: 600_000 });
  const layoutQ = useQuery({
    queryKey: ['ui-layout', screen],
    queryFn: () => appLayoutApi.get(screen),
  });

  // Load the server's tree into the working copy whenever the screen changes or
  // a mutation returns a new one. Local edits are dropped on purpose — every
  // path that refetches here is one that just replaced the draft.
  useEffect(() => {
    if (!layoutQ.data) return;
    setTree(layoutQ.data.tree);
    setSelectedId(layoutQ.data.tree.root.id);
    setDirty(false);
  }, [layoutQ.data]);

  const validateQ = useQuery({
    queryKey: ['ui-validate', screen, tree ? JSON.stringify(tree) : ''],
    queryFn: () => appLayoutApi.validate(screen, tree!),
    enabled: !!tree,
    // The tree is the cache key, so a re-validate only fires on a real edit.
    staleTime: Infinity,
    retry: false,
  });

  // Memoised because errorsByNode depends on it; a fresh [] each render would
  // rebuild that map (and re-render the whole tree) on every keystroke.
  const errors = useMemo<ValidationError[]>(() => validateQ.data?.errors ?? [], [validateQ.data]);
  const valid = validateQ.data?.ok ?? false;

  /** Map each error onto the node it belongs to so the tree can flag it. */
  const errorsByNode = useMemo(() => {
    if (!tree) return {};
    const out: Record<string, string[]> = {};
    for (const err of errors) {
      const id = nodeIdAtPath(tree.root, err.path) ?? tree.root.id;
      (out[id] ??= []).push(err.message);
    }
    return out;
  }, [errors, tree]);

  const update = (next: UiScreen) => {
    setTree(next);
    setDirty(true);
  };

  const mutateRoot = (fn: (root: AnyNode) => AnyNode) => {
    if (!tree) return;
    update({ ...tree, root: fn(tree.root) });
  };

  // ── Mutations ────────────────────────────────────────────────────

  const afterServerChange = (label: string) => (next: { tree: UiScreen }) => {
    toast.success(label);
    setTree(next.tree);
    setDirty(false);
    qc.invalidateQueries({ queryKey: ['ui-layout', screen] });
    qc.invalidateQueries({ queryKey: ['ui-layouts'] });
  };

  const saveMut = useMutation({
    mutationFn: () => appLayoutApi.saveDraft(screen, tree!),
    onSuccess: afterServerChange('Draft saved. Clients still see the published layout.'),
    onError: (e: Error) => toast.error(e.message ?? 'Could not save.'),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      // Publish reads the stored draft, so an unsaved edit would otherwise go
      // live as the PREVIOUS draft — silently publishing the wrong thing.
      if (dirty) await appLayoutApi.saveDraft(screen, tree!);
      return appLayoutApi.publish(screen);
    },
    onSuccess: afterServerChange('Published. Client apps pick this up within a minute.'),
    onError: (e: Error) => toast.error(e.message ?? 'Could not publish.'),
  });

  const discardMut = useMutation({
    mutationFn: () => appLayoutApi.discardDraft(screen),
    onSuccess: afterServerChange('Unpublished changes discarded.'),
    onError: (e: Error) => toast.error(e.message ?? 'Could not discard.'),
  });

  const resetMut = useMutation({
    mutationFn: () => appLayoutApi.resetToDefault(screen),
    onSuccess: afterServerChange('Loaded the standard layout into your draft.'),
    onError: (e: Error) => toast.error(e.message ?? 'Could not reset.'),
  });

  const unpublishMut = useMutation({
    mutationFn: () => appLayoutApi.unpublish(screen),
    onSuccess: afterServerChange('Reverted to the standard layout for all clients.'),
    onError: (e: Error) => toast.error(e.message ?? 'Could not revert.'),
  });

  const historyQ = useQuery({
    queryKey: ['ui-history', screen],
    queryFn: () => appLayoutApi.history(screen),
    enabled: showHistory,
  });

  const restoreMut = useMutation({
    mutationFn: (revision: number) => appLayoutApi.restore(screen, revision),
    onSuccess: (next) => {
      afterServerChange('Revision loaded into your draft. Review it, then publish.')(next);
      setShowHistory(false);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not restore.'),
  });

  const busy =
    saveMut.isPending ||
    publishMut.isPending ||
    discardMut.isPending ||
    resetMut.isPending ||
    unpublishMut.isPending;

  const catalog = catalogQ.data;
  const layout = layoutQ.data;
  const selected = tree && selectedId ? findNode(tree.root, selectedId) : null;

  if (catalogQ.isLoading || layoutQ.isLoading || !catalog || !tree || !layout) {
    return (
      <OwnerLayout practiceName={practiceName} ownerName={ownerName} initials={initials}>
        <div className="flex h-64 items-center justify-center">
          <SirahLoader />
        </div>
      </OwnerLayout>
    );
  }

  const nodeCount = countNodes(tree.root);

  return (
    <OwnerLayout
      practiceName={practiceName}
      ownerName={ownerName}
      initials={initials}
      topbarContext="Client app layout">
      <div className="space-y-6">
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">Client app layout</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Change what your clients see in the mobile app — which blocks appear, in what order,
            and what they are called. Edits are saved as a draft; nothing reaches a phone until
            you publish.
          </p>
        </header>

        {/* ── Screen picker ───────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {SCREENS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                if (dirty && !window.confirm('Discard your unsaved changes on this screen?')) return;
                setScreen(s.key);
              }}
              className={cn(
                'rounded-xl border px-4 py-2 text-left transition-colors',
                screen === s.key
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-foreground/10 hover:bg-foreground/5',
              )}>
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.blurb}</div>
            </button>
          ))}
        </div>

        {/* ── Status + actions ────────────────────────────────── */}
        <Glass className="flex flex-wrap items-center gap-3 p-4">
          <StatusChip layout={layout} dirty={dirty} />

          <span className="text-xs text-muted-foreground">
            {nodeCount} / {catalog.limits.maxNodes} blocks
          </span>

          {validateQ.isFetching ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
            </span>
          ) : valid ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Valid
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.length} problem{errors.length === 1 ? '' : 's'}
            </span>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            <ActionBtn
              icon={Save}
              label="Save draft"
              onClick={() => saveMut.mutate()}
              disabled={busy || !dirty || !valid}
            />
            <ActionBtn
              icon={Upload}
              label="Publish"
              primary
              onClick={() => {
                if (!window.confirm('Publish this layout to every client on your workspace?')) return;
                publishMut.mutate();
              }}
              disabled={busy || !valid || (!dirty && !layout.hasDraft)}
            />
            <ActionBtn
              icon={Undo2}
              label="Discard draft"
              onClick={() => discardMut.mutate()}
              disabled={busy || (!layout.hasDraft && !dirty)}
            />
            <ActionBtn
              icon={RotateCcw}
              label="Load standard"
              onClick={() => resetMut.mutate()}
              disabled={busy}
            />
            <ActionBtn
              icon={History}
              label="History"
              onClick={() => setShowHistory((s) => !s)}
              disabled={busy}
            />
          </div>
        </Glass>

        {layout.isPublished ? (
          <p className="text-xs text-muted-foreground">
            Clients are currently on revision {layout.publishedRevision}
            {layout.publishedAt ? ` (published ${new Date(layout.publishedAt).toLocaleString()})` : ''}.{' '}
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Revert every client to the standard layout?')) return;
                unpublishMut.mutate();
              }}
              className="underline underline-offset-2 hover:text-foreground">
              Revert to the standard layout
            </button>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Clients are on the standard layout. Publish to use your own.
          </p>
        )}

        {/* ── History ─────────────────────────────────────────── */}
        {showHistory ? (
          <Glass className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Published revisions</h2>
            {historyQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !historyQ.data?.length ? (
              <p className="text-sm text-muted-foreground">Nothing published yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {historyQ.data.map((v) => (
                  <li
                    key={v.revision}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-foreground/5">
                    <span className="font-mono text-xs text-muted-foreground">r{v.revision}</span>
                    <span className="text-muted-foreground">
                      {new Date(v.published_at).toLocaleString()}
                    </span>
                    {v.note ? <span className="truncate">{v.note}</span> : null}
                    <button
                      type="button"
                      onClick={() => restoreMut.mutate(v.revision)}
                      className="ml-auto rounded-lg border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/5">
                      Load into draft
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Glass>
        ) : null}

        {/* ── Tree + inspector ────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Glass className="max-h-[70vh] overflow-auto p-3">
            <LayoutTree
              root={tree.root}
              catalog={catalog}
              selectedId={selectedId}
              onSelect={setSelectedId}
              errorsByNode={errorsByNode}
            />
          </Glass>

          <Glass className="max-h-[70vh] overflow-auto p-4">
            {selected ? (
              <NodeInspector
                node={selected}
                screen={screen}
                catalog={catalog}
                errors={errorsByNode[selected.id] ?? []}
                isRoot={selected.id === tree.root.id}
                onChange={(next) => mutateRoot((root) => replaceNode(root, selected.id, next))}
                onDelete={() => {
                  mutateRoot((root) => removeNode(root, selected.id));
                  setSelectedId(tree.root.id);
                }}
                onDuplicate={() => {
                  const found = findParent(tree.root, selected.id);
                  if (!found) return;
                  const copy = cloneWithNewIds(selected);
                  mutateRoot((root) => insertNode(root, found.parent.id, found.slot, copy));
                  setSelectedId(copy.id);
                }}
                onMove={(delta) => mutateRoot((root) => moveNode(root, selected.id, delta))}
                onAddChild={(slot: ChildSlot, type: string) => {
                  const spec = catalog.nodes[type];
                  if (!spec) return;
                  const node = makeNode(type, spec);
                  mutateRoot((root) => insertNode(root, selected.id, slot, node));
                  setSelectedId(node.id);
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select a block to edit it.</p>
            )}
          </Glass>
        </div>

        {/* ── Flat error list ─────────────────────────────────── */}
        {errors.length ? (
          <Glass className="space-y-1.5 p-4">
            <h2 className="text-sm font-semibold text-destructive">Problems to fix before publishing</h2>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      const id = nodeIdAtPath(tree.root, e.path);
                      if (id) setSelectedId(id);
                    }}
                    className="text-left hover:text-foreground">
                    <code className="font-mono">{e.path || 'layout'}</code> — {e.message}
                  </button>
                </li>
              ))}
            </ul>
          </Glass>
        ) : null}
      </div>
    </OwnerLayout>
  );
}

// ────────────────────────────────────────────────────────────────────

function StatusChip({
  layout,
  dirty,
}: {
  layout: { origin: string; hasDraft: boolean; isPublished: boolean };
  dirty: boolean;
}) {
  const [label, tone] = dirty
    ? ['Unsaved changes', 'bg-amber-500/15 text-amber-600 dark:text-amber-400']
    : layout.hasDraft
      ? ['Draft saved, not published', 'bg-amber-500/15 text-amber-600 dark:text-amber-400']
      : layout.isPublished
        ? ['Published', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400']
        : ['Standard layout', 'bg-foreground/10 text-muted-foreground'];

  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', tone)}>{label}</span>;
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  primary,
}: {
  icon: typeof Save;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        primary
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-foreground/15 hover:bg-foreground/5',
      )}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/**
 * Resolve a validator path like `root.children[2].then[0].label` to a node id.
 *
 * The server reports errors by position because it has no notion of which node
 * the editor is showing; the editor needs an id to highlight. Walking the same
 * path back down the tree is the cheap way across that gap — and it degrades
 * safely, returning null when the path no longer resolves.
 */
function nodeIdAtPath(root: AnyNode, path: string): string | null {
  if (!path || path === 'root') return root.id;

  const steps = path.split('.').slice(1);
  let node: AnyNode = root;

  for (const step of steps) {
    const match = step.match(/^([a-zA-Z]+)\[(\d+)\]$/);
    if (!match) break; // a plain prop name — the error belongs to `node`

    const [, slot, idxRaw] = match;
    const kids = node[slot];
    if (!Array.isArray(kids)) break;

    const kid = (kids as AnyNode[])[Number(idxRaw)];
    if (!kid) break;
    node = kid;
  }

  return node.id;
}
