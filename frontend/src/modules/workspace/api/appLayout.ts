import { api } from '@/lib/api';

/**
 * Client app layout (server-driven UI) — authoring API.
 *
 * The editor is driven entirely by the server's catalog rather than a local
 * copy of the node catalog: `catalog()` returns the node specs, route allowlist
 * and limits, and the editor builds its palette and property forms from that.
 * A node type added on the backend therefore appears in the editor with no
 * frontend deploy, and the editor can never offer a prop the validator rejects.
 */

export type ScreenKey = 'home' | 'more' | 'tabs' | 'onboarding';

/**
 * A node as the editor handles it: generic.
 *
 * The editor deliberately does NOT model the discriminated union the app uses.
 * It manipulates trees by id and edits props by spec, so a structural type is
 * both sufficient and the thing that keeps it from drifting from the backend.
 */
export interface AnyNode {
  id: string;
  type: string;
  [prop: string]: unknown;
}

export interface UiDataBinding {
  key: string;
  source: string;
  params?: Record<string, string | number | boolean>;
}

export interface UiScreen {
  version: number;
  screen: ScreenKey;
  revision: number;
  data?: UiDataBinding[];
  root: AnyNode;
}

export interface EditorLayout {
  screen: ScreenKey;
  tree: UiScreen;
  origin: 'draft' | 'published' | 'default';
  hasDraft: boolean;
  isPublished: boolean;
  publishedRevision: number;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface LayoutVersion {
  revision: number;
  note: string | null;
  published_at: string;
  published_by: string | null;
}

// ── Catalog ──────────────────────────────────────────────────────────

export type PropKind =
  | 'template'
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'icon'
  | 'action'
  | 'condition'
  | 'nodes'
  | 'options'
  | 'json';

export interface PropSpec {
  kind: PropKind;
  required?: boolean;
  values?: string[];
  min?: number;
  max?: number;
  label?: string;
  hint?: string;
  default?: unknown;
}

export interface NodeSpec {
  label: string;
  hint: string;
  group: 'structure' | 'content' | 'interactive' | 'logic' | 'screen';
  screens?: ScreenKey[];
  parents?: string[];
  props: Record<string, PropSpec>;
}

export interface Catalog {
  schemaVersion: number;
  screens: ScreenKey[];
  nodes: Record<string, NodeSpec>;
  routes: string[];
  tabRoutes: string[];
  dataSources: string[];
  nativeComponents: string[];
  onboardingFieldKeys: string[];
  activityLevels: string[];
  limits: {
    maxNodes: number;
    maxDepth: number;
    maxStringLength: number;
    maxRepeat: number;
    maxScreenBytes: number;
  };
}

const BASE = '/api/v1/workspaces/me/ui-layouts';

export const appLayoutApi = {
  catalog: () => api.get<Catalog>(`${BASE}/catalog`),
  list: () => api.get<EditorLayout[]>(BASE),
  get: (screen: ScreenKey) => api.get<EditorLayout>(`${BASE}/${screen}`),

  /** Dry run — returns per-node errors without storing anything. */
  validate: (screen: ScreenKey, tree: UiScreen) =>
    api.post<{ ok: boolean; errors: ValidationError[] }>(`${BASE}/${screen}/validate`, {
      body: { tree },
    }),

  saveDraft: (screen: ScreenKey, tree: UiScreen) =>
    api.post<EditorLayout>(`${BASE}/${screen}/draft`, { body: { tree } }),

  discardDraft: (screen: ScreenKey) => api.delete<EditorLayout>(`${BASE}/${screen}/draft`),

  /** Load the built-in stock layout into the draft. */
  resetToDefault: (screen: ScreenKey) => api.post<EditorLayout>(`${BASE}/${screen}/default`),

  /** The only call that reaches real devices. */
  publish: (screen: ScreenKey, note?: string) =>
    api.post<EditorLayout>(`${BASE}/${screen}/publish`, { body: { note } }),

  /** Stop serving a custom layout; clients fall back to the stock screen. */
  unpublish: (screen: ScreenKey) => api.delete<EditorLayout>(`${BASE}/${screen}/publish`),

  history: (screen: ScreenKey) => api.get<LayoutVersion[]>(`${BASE}/${screen}/history`),

  restore: (screen: ScreenKey, revision: number) =>
    api.post<EditorLayout>(`${BASE}/${screen}/restore`, { body: { revision } }),
};

// ── Tree helpers ─────────────────────────────────────────────────────
//
// All of these are pure and return NEW trees. The editor keeps the working
// tree in React state and diffs it against the server on save, so mutating in
// place would silently break undo and the dirty check.

/** Slots that hold child nodes, in the order the editor shows them. */
export const CHILD_SLOTS = ['children', 'then', 'else', 'empty'] as const;
export type ChildSlot = (typeof CHILD_SLOTS)[number];

export function childSlotsOf(node: AnyNode, spec?: NodeSpec): ChildSlot[] {
  if (!spec) return CHILD_SLOTS.filter((s) => Array.isArray(node[s]));
  return CHILD_SLOTS.filter((s) => spec.props[s]?.kind === 'nodes');
}

export function findNode(root: AnyNode, id: string): AnyNode | null {
  if (root.id === id) return root;
  for (const slot of CHILD_SLOTS) {
    const kids = root[slot];
    if (!Array.isArray(kids)) continue;
    for (const kid of kids as AnyNode[]) {
      const hit = findNode(kid, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** The node holding `id`, plus which slot and index it sits at. */
export function findParent(
  root: AnyNode,
  id: string,
): { parent: AnyNode; slot: ChildSlot; index: number } | null {
  for (const slot of CHILD_SLOTS) {
    const kids = root[slot];
    if (!Array.isArray(kids)) continue;
    const list = kids as AnyNode[];
    const index = list.findIndex((k) => k.id === id);
    if (index !== -1) return { parent: root, slot, index };
    for (const kid of list) {
      const hit = findParent(kid, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Replace one node by id, returning a new tree. */
export function replaceNode(root: AnyNode, id: string, next: AnyNode): AnyNode {
  if (root.id === id) return next;
  const out: AnyNode = { ...root };
  for (const slot of CHILD_SLOTS) {
    const kids = root[slot];
    if (!Array.isArray(kids)) continue;
    out[slot] = (kids as AnyNode[]).map((k) => replaceNode(k, id, next));
  }
  return out;
}

export function removeNode(root: AnyNode, id: string): AnyNode {
  const out: AnyNode = { ...root };
  for (const slot of CHILD_SLOTS) {
    const kids = root[slot];
    if (!Array.isArray(kids)) continue;
    out[slot] = (kids as AnyNode[]).filter((k) => k.id !== id).map((k) => removeNode(k, id));
  }
  return out;
}

/** Move a node within its own slot. Returns the tree unchanged at the ends. */
export function moveNode(root: AnyNode, id: string, delta: number): AnyNode {
  const found = findParent(root, id);
  if (!found) return root;

  const { parent, slot, index } = found;
  const list = [...(parent[slot] as AnyNode[])];
  const target = index + delta;
  if (target < 0 || target >= list.length) return root;

  [list[index], list[target]] = [list[target], list[index]];
  return replaceNode(root, parent.id, { ...parent, [slot]: list });
}

export function insertNode(
  root: AnyNode,
  parentId: string,
  slot: ChildSlot,
  node: AnyNode,
): AnyNode {
  const parent = findNode(root, parentId);
  if (!parent) return root;
  const list = Array.isArray(parent[slot]) ? [...(parent[slot] as AnyNode[])] : [];
  list.push(node);
  return replaceNode(root, parentId, { ...parent, [slot]: list });
}

/** Fresh ids throughout — duplicating with the originals would break the tree. */
export function cloneWithNewIds(node: AnyNode): AnyNode {
  const out: AnyNode = { ...node, id: newId(node.type) };
  for (const slot of CHILD_SLOTS) {
    const kids = node[slot];
    if (!Array.isArray(kids)) continue;
    out[slot] = (kids as AnyNode[]).map(cloneWithNewIds);
  }
  return out;
}

export function newId(type: string): string {
  return `${type}-${Math.random().toString(36).slice(2, 9)}`;
}

/** A node pre-filled from its spec's declared defaults. */
export function makeNode(type: string, spec: NodeSpec): AnyNode {
  const node: AnyNode = { id: newId(type), type };
  for (const [name, prop] of Object.entries(spec.props)) {
    if (prop.kind === 'nodes') {
      node[name] = [];
      continue;
    }
    if (prop.default !== undefined) {
      node[name] = prop.default;
      continue;
    }
    // Required props need SOMETHING or the first validate call fails on a node
    // the author has not touched yet, which reads as the editor being broken.
    if (prop.required) {
      node[name] =
        prop.kind === 'number' ? (prop.min ?? 0)
        : prop.kind === 'boolean' ? false
        : prop.kind === 'enum' ? (prop.values?.[0] ?? '')
        : prop.kind === 'icon' ? 'ellipse-outline'
        : prop.kind === 'options' ? []
        : prop.kind === 'action' ? { kind: 'none' }
        : prop.kind === 'condition' ? { op: 'truthy', left: '' }
        : name === 'label' || name === 'title' ? spec.label
        : '';
    }
  }
  return node;
}

export function countNodes(node: AnyNode): number {
  let total = 1;
  for (const slot of CHILD_SLOTS) {
    const kids = node[slot];
    if (Array.isArray(kids)) total += (kids as AnyNode[]).reduce((n, k) => n + countNodes(k), 0);
  }
  return total;
}
