/**
 * Server-driven UI — validation and feature pruning.
 *
 * Nothing reaches a device without passing through here. The validator is the
 * only thing standing between "a workspace admin can rearrange their app" and
 * "a workspace admin can make every client's app crash on launch", so it fails
 * closed: an unknown node type, an unknown prop, an off-allowlist route or a
 * tree past its size ceiling is a rejection, never a silent strip.
 *
 * It runs at WRITE time (the editor gets precise, path-addressed errors) and
 * again at READ time on anything loaded from the database. The second pass is
 * not paranoia about the first: rows outlive code, and a tree written against
 * schema v1 is still sitting in Postgres after v2 tightens a rule.
 */
import {
  ACTION_KINDS,
  CONDITION_OPS,
  HABIT_METRICS,
  isAllowedRoute,
  isDataSource,
  isFeature,
  isIconName,
  LIMITS,
  NODE_SPECS,
  ONBOARDING_FIELD_KEYS,
  ONBOARDING_ONLY_ACTIONS,
  REQUIRED_TABS,
  type NodeSpec,
  type PropSpec,
} from './sdui.registry';
import {
  SCHEMA_VERSION,
  type ScreenKey,
  type UiCondition,
  type UiNode,
  type UiNodeType,
  type DataSourceKey,
  type UiScreen,
} from './sdui.types';

export interface ValidationError {
  /** JSON-ish path to the offending value, e.g. `root.children[2].props.label`. */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  /** Present only when ok — ids filled in, unknown-but-optional props dropped. */
  value?: UiScreen;
}

interface Ctx {
  screen: ScreenKey;
  errors: ValidationError[];
  nodes: number;
  /** Scope keys currently in play — declared data keys plus any `repeat` aliases. */
  scopes: Set<string>;
  seenIds: Set<string>;
  seenFieldKeys: Set<string>;
  tabRoutes: string[];
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

let idCounter = 0;
/** Deterministic enough for a single validation pass; ids only need uniqueness. */
function makeId(type: string): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${type}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

// ────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────

export function validateScreen(input: unknown, screen: ScreenKey): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ path: '', message: 'Layout must be an object.' }] };
  }

  const bytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
  if (bytes > LIMITS.maxScreenBytes) {
    return {
      ok: false,
      errors: [
        {
          path: '',
          message: `Layout is ${Math.round(bytes / 1024)}KB; the limit is ${LIMITS.maxScreenBytes / 1024}KB.`,
        },
      ],
    };
  }

  const version = typeof input.version === 'number' ? input.version : SCHEMA_VERSION;
  if (version > SCHEMA_VERSION) {
    errors.push({
      path: 'version',
      message: `Layout targets schema v${version} but this server speaks v${SCHEMA_VERSION}.`,
    });
  }

  // ── Data bindings ────────────────────────────────────────────────
  const scopes = new Set<string>();
  const data: UiScreen['data'] = [];
  if (input.data !== undefined) {
    if (!Array.isArray(input.data)) {
      errors.push({ path: 'data', message: '`data` must be an array.' });
    } else {
      input.data.forEach((raw, i) => {
        const p = `data[${i}]`;
        if (!isPlainObject(raw)) {
          errors.push({ path: p, message: 'Each data binding must be an object.' });
          return;
        }
        const key = raw.key;
        const source = raw.source;
        if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(key)) {
          errors.push({ path: `${p}.key`, message: 'Key must be a short identifier.' });
          return;
        }
        if (typeof source !== 'string' || !isDataSource(source)) {
          errors.push({ path: `${p}.source`, message: `Unknown data source "${String(source)}".` });
          return;
        }
        if (scopes.has(key)) {
          errors.push({ path: `${p}.key`, message: `Duplicate data key "${key}".` });
          return;
        }
        scopes.add(key);
        const params: Record<string, string | number | boolean> = {};
        if (isPlainObject(raw.params)) {
          for (const [k, v] of Object.entries(raw.params)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
              params[k] = v;
            } else {
              errors.push({ path: `${p}.params.${k}`, message: 'Params must be scalars.' });
            }
          }
        }
        data.push({ key, source: source as DataSourceKey, params });
      });
    }
  }

  // ── Tree ─────────────────────────────────────────────────────────
  const ctx: Ctx = {
    screen,
    errors,
    nodes: 0,
    scopes,
    seenIds: new Set(),
    seenFieldKeys: new Set(),
    tabRoutes: [],
  };

  const root = walkNode(input.root, 'root', 1, ctx, null);

  // ── Screen-level invariants ──────────────────────────────────────
  if (screen === 'tabs') {
    const missing = REQUIRED_TABS.filter((r) => !ctx.tabRoutes.includes(r));
    if (missing.length) {
      errors.push({
        path: 'root',
        message: `The tab bar must keep: ${missing.join(', ')}. Removing it would leave no way back to the home screen.`,
      });
    }
    if (ctx.tabRoutes.length < 2) {
      errors.push({ path: 'root', message: 'The tab bar needs at least two tabs.' });
    }
    if (ctx.tabRoutes.length > 6) {
      errors.push({ path: 'root', message: 'More than six tabs will not fit on a phone.' });
    }
  }

  if (screen === 'onboarding' && !ctx.seenFieldKeys.size) {
    errors.push({ path: 'root', message: 'Onboarding must collect at least one field.' });
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      version: SCHEMA_VERSION,
      screen,
      revision: typeof input.revision === 'number' ? input.revision : 1,
      data,
      root: root as UiNode,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Nodes
// ────────────────────────────────────────────────────────────────────────

function walkNode(
  raw: unknown,
  path: string,
  depth: number,
  ctx: Ctx,
  parentType: UiNodeType | null,
): UiNode | null {
  if (depth > LIMITS.maxDepth) {
    ctx.errors.push({ path, message: `Nesting is deeper than ${LIMITS.maxDepth} levels.` });
    return null;
  }
  if (++ctx.nodes > LIMITS.maxNodes) {
    ctx.errors.push({ path, message: `Layout exceeds ${LIMITS.maxNodes} nodes.` });
    return null;
  }
  if (!isPlainObject(raw)) {
    ctx.errors.push({ path, message: 'Expected a node object.' });
    return null;
  }

  const type = raw.type;
  if (typeof type !== 'string' || !(type in NODE_SPECS)) {
    ctx.errors.push({ path: `${path}.type`, message: `Unknown node type "${String(type)}".` });
    return null;
  }
  const nodeType = type as UiNodeType;
  const spec: NodeSpec = NODE_SPECS[nodeType];

  if (spec.screens && !spec.screens.includes(ctx.screen)) {
    ctx.errors.push({
      path: `${path}.type`,
      message: `"${nodeType}" is not allowed on the ${ctx.screen} screen.`,
    });
    return null;
  }
  if (spec.parents && parentType && !spec.parents.includes(parentType)) {
    ctx.errors.push({
      path: `${path}.type`,
      message: `"${nodeType}" cannot sit directly inside "${parentType}".`,
    });
    return null;
  }

  // ── id ───────────────────────────────────────────────────────────
  let id: string;
  if (typeof raw.id === 'string' && raw.id.trim()) {
    id = raw.id.trim().slice(0, 64);
    if (ctx.seenIds.has(id)) {
      ctx.errors.push({ path: `${path}.id`, message: `Duplicate node id "${id}".` });
      return null;
    }
  } else {
    id = makeId(nodeType);
  }
  ctx.seenIds.add(id);

  const out: Record<string, unknown> = { id, type: nodeType };

  // ── when ─────────────────────────────────────────────────────────
  if (raw.when !== undefined) {
    const c = walkCondition(raw.when, `${path}.when`, ctx, 1);
    if (c) out.when = c;
  }

  // ── Reject props the spec does not declare ───────────────────────
  const known = new Set(['id', 'type', 'when', ...Object.keys(spec.props)]);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      ctx.errors.push({ path: `${path}.${key}`, message: `"${nodeType}" has no prop "${key}".` });
    }
  }

  // ── `repeat` publishes a scope name to its children ──────────────
  let scopeAdded: string | null = null;
  if (nodeType === 'repeat') {
    const alias = typeof raw.as === 'string' && raw.as.trim() ? raw.as.trim() : 'item';
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(alias)) {
      ctx.errors.push({ path: `${path}.as`, message: 'Loop variable must be a short identifier.' });
    } else if (!ctx.scopes.has(alias)) {
      ctx.scopes.add(alias);
      scopeAdded = alias;
    }
  }

  // ── Props ────────────────────────────────────────────────────────
  for (const [propName, propSpec] of Object.entries(spec.props)) {
    const value = raw[propName];
    if (value === undefined || value === null) {
      if (propSpec.required) {
        ctx.errors.push({ path: `${path}.${propName}`, message: `"${propName}" is required.` });
      }
      continue;
    }
    const checked = walkProp(value, `${path}.${propName}`, propSpec, depth, ctx, nodeType);
    if (checked !== undefined) out[propName] = checked;
  }

  // ── Per-type extra rules ─────────────────────────────────────────
  applyNodeRules(nodeType, out, path, ctx);

  if (scopeAdded) ctx.scopes.delete(scopeAdded);

  return out as unknown as UiNode;
}

function walkProp(
  value: unknown,
  path: string,
  spec: PropSpec,
  depth: number,
  ctx: Ctx,
  nodeType: UiNodeType,
): unknown {
  switch (spec.kind) {
    case 'template':
    case 'string': {
      if (typeof value !== 'string') {
        ctx.errors.push({ path, message: 'Expected text.' });
        return undefined;
      }
      if (value.length > LIMITS.maxStringLength) {
        ctx.errors.push({ path, message: `Longer than ${LIMITS.maxStringLength} characters.` });
        return undefined;
      }
      if (spec.kind === 'template') checkTemplate(value, path, ctx);
      return value;
    }

    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        ctx.errors.push({ path, message: 'Expected a number.' });
        return undefined;
      }
      if (spec.min !== undefined && value < spec.min) {
        ctx.errors.push({ path, message: `Must be at least ${spec.min}.` });
        return undefined;
      }
      if (spec.max !== undefined && value > spec.max) {
        ctx.errors.push({ path, message: `Must be at most ${spec.max}.` });
        return undefined;
      }
      return value;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        ctx.errors.push({ path, message: 'Expected true or false.' });
        return undefined;
      }
      return value;
    }

    case 'enum': {
      if (typeof value !== 'string' || !spec.values?.includes(value)) {
        ctx.errors.push({
          path,
          message: `Must be one of: ${(spec.values ?? []).join(', ')}.`,
        });
        return undefined;
      }
      return value;
    }

    case 'icon': {
      if (typeof value !== 'string' || !isIconName(value)) {
        ctx.errors.push({ path, message: 'Expected an Ionicons name like "heart-outline".' });
        return undefined;
      }
      return value;
    }

    case 'action':
      return walkAction(value, path, ctx);

    case 'condition':
      return walkCondition(value, path, ctx, 1);

    case 'nodes': {
      if (!Array.isArray(value)) {
        ctx.errors.push({ path, message: 'Expected a list of nodes.' });
        return undefined;
      }
      const kids: UiNode[] = [];
      value.forEach((child, i) => {
        const node = walkNode(child, `${path}[${i}]`, depth + 1, ctx, nodeType);
        if (node) kids.push(node);
      });
      return kids;
    }

    case 'options': {
      if (!Array.isArray(value)) {
        ctx.errors.push({ path, message: 'Expected a list of options.' });
        return undefined;
      }
      if (value.length > 40) {
        ctx.errors.push({ path, message: 'At most 40 options.' });
        return undefined;
      }
      const opts: { value: string; label: string }[] = [];
      value.forEach((o, i) => {
        if (!isPlainObject(o) || typeof o.value !== 'string' || typeof o.label !== 'string') {
          ctx.errors.push({ path: `${path}[${i}]`, message: 'Each option needs a value and a label.' });
          return;
        }
        opts.push({ value: o.value.slice(0, 80), label: o.label.slice(0, 80) });
      });
      return opts;
    }

    case 'json': {
      // Only `native` props land here. Bounded depth and size; scalars only at
      // the leaves so nothing executable can be smuggled through as a prop bag.
      const safe = sanitizeJson(value, path, ctx, 0);
      return safe;
    }

    default:
      return undefined;
  }
}

function sanitizeJson(value: unknown, path: string, ctx: Ctx, depth: number): unknown {
  if (depth > 4) {
    ctx.errors.push({ path, message: 'Props are nested too deeply.' });
    return undefined;
  }
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    if (s.length > LIMITS.maxStringLength) {
      ctx.errors.push({ path, message: 'Value is too long.' });
      return undefined;
    }
    return s;
  }
  if (t === 'number' || t === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.length > 60) {
      ctx.errors.push({ path, message: 'Too many entries.' });
      return undefined;
    }
    return value.map((v, i) => sanitizeJson(v, `${path}[${i}]`, ctx, depth + 1));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value);
    if (keys.length > 40) {
      ctx.errors.push({ path, message: 'Too many keys.' });
      return undefined;
    }
    for (const k of keys) {
      // `__proto__` / `constructor` never travel to a client renderer.
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        ctx.errors.push({ path: `${path}.${k}`, message: 'Reserved key.' });
        continue;
      }
      out[k] = sanitizeJson(value[k], `${path}.${k}`, ctx, depth + 1);
    }
    return out;
  }
  ctx.errors.push({ path, message: 'Unsupported value.' });
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────
// Templates
// ────────────────────────────────────────────────────────────────────────

const HOLE = /\{\{([^}]*)\}\}/g;

/**
 * A `{{hole}}` must name a scope the screen actually declared. Catching this at
 * authoring time is the difference between "the editor told me the binding was
 * wrong" and "every client saw an empty card and nobody knew why".
 */
function checkTemplate(value: string, path: string, ctx: Ctx): void {
  HOLE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HOLE.exec(value)) !== null) {
    const body = m[1].trim();
    if (!body) {
      ctx.errors.push({ path, message: 'Empty {{ }} binding.' });
      continue;
    }
    const expr = body.split('|')[0].split('??')[0].trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+|\[\d+\])*$/.test(expr)) {
      ctx.errors.push({ path, message: `"${expr}" is not a valid binding path.` });
      continue;
    }
    const rootKey = expr.split(/[.[]/)[0];
    if (!ctx.scopes.has(rootKey)) {
      ctx.errors.push({
        path,
        message: `"${rootKey}" is not a data source on this screen. Declared: ${[...ctx.scopes].join(', ') || 'none'}.`,
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────────
// Conditions & actions
// ────────────────────────────────────────────────────────────────────────

function walkCondition(raw: unknown, path: string, ctx: Ctx, depth: number): UiCondition | undefined {
  if (depth > 6) {
    ctx.errors.push({ path, message: 'Condition is nested too deeply.' });
    return undefined;
  }
  if (!isPlainObject(raw)) {
    ctx.errors.push({ path, message: 'Expected a condition object.' });
    return undefined;
  }
  const op = raw.op;
  if (typeof op !== 'string' || !CONDITION_OPS.includes(op)) {
    ctx.errors.push({ path: `${path}.op`, message: `Unknown operator "${String(op)}".` });
    return undefined;
  }

  if (op === 'and' || op === 'or') {
    if (!Array.isArray(raw.of) || !raw.of.length) {
      ctx.errors.push({ path: `${path}.of`, message: `"${op}" needs a list of conditions.` });
      return undefined;
    }
    const of = raw.of
      .map((c, i) => walkCondition(c, `${path}.of[${i}]`, ctx, depth + 1))
      .filter(Boolean) as UiCondition[];
    return { op, of };
  }

  if (op === 'not') {
    const inner = walkCondition(raw.of, `${path}.of`, ctx, depth + 1);
    return inner ? { op, of: inner } : undefined;
  }

  if (op === 'feature') {
    if (typeof raw.feature !== 'string' || !isFeature(raw.feature)) {
      ctx.errors.push({ path: `${path}.feature`, message: `Unknown feature "${String(raw.feature)}".` });
      return undefined;
    }
    return { op, feature: raw.feature };
  }

  if (typeof raw.left !== 'string') {
    ctx.errors.push({ path: `${path}.left`, message: 'Expected a binding on the left.' });
    return undefined;
  }
  checkTemplate(raw.left, `${path}.left`, ctx);

  if (op === 'truthy' || op === 'empty') return { op, left: raw.left };

  const right = raw.right;
  if (typeof right !== 'string' && typeof right !== 'number' && typeof right !== 'boolean') {
    ctx.errors.push({ path: `${path}.right`, message: 'Comparison value must be a scalar.' });
    return undefined;
  }
  return { op, left: raw.left, right } as UiCondition;
}

function walkAction(raw: unknown, path: string, ctx: Ctx): unknown {
  if (!isPlainObject(raw)) {
    ctx.errors.push({ path, message: 'Expected an action object.' });
    return undefined;
  }
  const kind = raw.kind;
  if (typeof kind !== 'string' || !ACTION_KINDS.includes(kind)) {
    ctx.errors.push({ path: `${path}.kind`, message: `Unknown action "${String(kind)}".` });
    return undefined;
  }

  if (ONBOARDING_ONLY_ACTIONS.includes(kind) && ctx.screen !== 'onboarding') {
    ctx.errors.push({ path: `${path}.kind`, message: `"${kind}" only works during onboarding.` });
    return undefined;
  }

  switch (kind) {
    case 'none':
    case 'back':
    case 'refresh':
    case 'signOut':
    case 'submitOnboarding':
      return { kind };

    case 'navigate': {
      if (typeof raw.href !== 'string' || !raw.href) {
        ctx.errors.push({ path: `${path}.href`, message: 'Destination is required.' });
        return undefined;
      }
      if (!isAllowedRoute(raw.href)) {
        ctx.errors.push({
          path: `${path}.href`,
          message: `"${raw.href}" is not a screen this app can open.`,
        });
        return undefined;
      }
      checkTemplate(raw.href, `${path}.href`, ctx);
      return { kind, href: raw.href };
    }

    case 'openUrl': {
      if (typeof raw.url !== 'string') {
        ctx.errors.push({ path: `${path}.url`, message: 'URL is required.' });
        return undefined;
      }
      // https only. An http link is a downgrade, and a custom scheme is a way
      // to bounce a user into another app without them ever choosing to.
      if (!/^https:\/\/[^\s]+$/i.test(raw.url.replace(/\{\{[^}]*\}\}/g, 'x'))) {
        ctx.errors.push({ path: `${path}.url`, message: 'Only https:// links are allowed.' });
        return undefined;
      }
      checkTemplate(raw.url, `${path}.url`, ctx);
      return { kind, url: raw.url };
    }

    case 'logHabit': {
      if (typeof raw.metric !== 'string' || !HABIT_METRICS.includes(raw.metric)) {
        ctx.errors.push({ path: `${path}.metric`, message: 'Unknown habit metric.' });
        return undefined;
      }
      const out: Record<string, unknown> = { kind, metric: raw.metric };
      if (raw.delta !== undefined) {
        if (typeof raw.delta !== 'number' || !Number.isFinite(raw.delta)) {
          ctx.errors.push({ path: `${path}.delta`, message: 'Delta must be a number.' });
          return undefined;
        }
        out.delta = raw.delta;
      }
      if (raw.value !== undefined) {
        if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) {
          ctx.errors.push({ path: `${path}.value`, message: 'Value must be a number.' });
          return undefined;
        }
        out.value = raw.value;
      }
      if (out.delta === undefined && out.value === undefined) {
        ctx.errors.push({ path, message: 'Give either a delta or a value.' });
        return undefined;
      }
      return out;
    }

    case 'logMood': {
      if (typeof raw.value !== 'number' || raw.value < 1 || raw.value > 5) {
        ctx.errors.push({ path: `${path}.value`, message: 'Mood must be 1–5.' });
        return undefined;
      }
      return { kind, value: raw.value };
    }

    case 'step': {
      if (typeof raw.by !== 'number' || !Number.isInteger(raw.by) || Math.abs(raw.by) > 10) {
        ctx.errors.push({ path: `${path}.by`, message: 'Step must be a small whole number.' });
        return undefined;
      }
      return { kind, by: raw.by };
    }

    default:
      return undefined;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Per-type rules that the prop table can't express
// ────────────────────────────────────────────────────────────────────────

function applyNodeRules(
  type: UiNodeType,
  node: Record<string, unknown>,
  path: string,
  ctx: Ctx,
): void {
  if (type === 'tab') {
    const route = node.route as string | undefined;
    if (route) {
      if (ctx.tabRoutes.includes(route)) {
        ctx.errors.push({ path: `${path}.route`, message: `Tab "${route}" is listed twice.` });
      } else {
        ctx.tabRoutes.push(route);
      }
    }
  }

  if (type === 'field') {
    const key = node.key as string | undefined;
    if (key) {
      if (!ONBOARDING_FIELD_KEYS.includes(key)) {
        ctx.errors.push({
          path: `${path}.key`,
          message: `"${key}" is not a profile field. Allowed: ${ONBOARDING_FIELD_KEYS.join(', ')}.`,
        });
      } else if (ctx.seenFieldKeys.has(key)) {
        ctx.errors.push({ path: `${path}.key`, message: `Field "${key}" is collected twice.` });
      } else {
        ctx.seenFieldKeys.add(key);
      }
    }
    const kind = node.kind as string | undefined;
    if ((kind === 'select' || kind === 'chips') && !(node.options as unknown[] | undefined)?.length) {
      ctx.errors.push({ path: `${path}.options`, message: `A "${kind}" field needs options.` });
    }
  }

  if (type === 'step') {
    const key = node.key as string | undefined;
    if (key && !/^[a-z][a-z0-9_-]{0,30}$/i.test(key)) {
      ctx.errors.push({ path: `${path}.key`, message: 'Step key must be a short identifier.' });
    }
  }
}

// ────────────────────────────────────────────────────────────────────────
// Feature pruning
// ────────────────────────────────────────────────────────────────────────

/**
 * Resolve every `feature` condition against the workspace's entitlements and
 * drop the branches that lose, BEFORE the tree is serialized to a device.
 *
 * Evaluating these on the client would ship the layout of a paid feature to a
 * workspace that has not bought it — the tree itself leaks the roadmap, and a
 * patched client would happily render the row. Resolving here means the bytes
 * never leave the server.
 */
export function pruneForFeatures(screen: UiScreen, features: readonly string[]): UiScreen {
  const has = (f: string) => features.includes(f);

  const resolve = (c: UiCondition): boolean | null => {
    switch (c.op) {
      case 'feature':
        return has(c.feature);
      case 'not': {
        const inner = resolve(c.of);
        return inner === null ? null : !inner;
      }
      case 'and': {
        const parts = c.of.map(resolve);
        if (parts.some((p) => p === false)) return false;
        return parts.every((p) => p === true) ? true : null;
      }
      case 'or': {
        const parts = c.of.map(resolve);
        if (parts.some((p) => p === true)) return true;
        return parts.every((p) => p === false) ? false : null;
      }
      default:
        // Data-dependent — only the device can answer it.
        return null;
    }
  };

  /** Strip `feature` leaves that have been decided, keeping data-dependent ones. */
  const rewrite = (c: UiCondition): UiCondition | null => {
    const decided = resolve(c);
    if (decided === true) return null; // always passes — drop the guard entirely
    if (decided === false) return c; // caller removes the node
    if (c.op === 'and' || c.op === 'or') {
      const kept = c.of.map(rewrite).filter((x): x is UiCondition => x !== null);
      if (!kept.length) return null;
      if (kept.length === 1) return kept[0];
      return { op: c.op, of: kept };
    }
    return c;
  };

  const walk = (node: UiNode): UiNode | null => {
    if (node.when && resolve(node.when) === false) return null;

    const next: Record<string, unknown> = { ...(node as unknown as Record<string, unknown>) };
    if (node.when) {
      const rewritten = rewrite(node.when);
      if (rewritten) next.when = rewritten;
      else delete next.when;
    }

    if (node.type === 'if') {
      const decided = resolve(node.cond);
      if (decided === true) {
        // The guard is settled — collapse to a plain stack so the device does
        // not re-evaluate a question that no longer has two answers.
        const kids = node.then.map(walk).filter((x): x is UiNode => x !== null);
        return { id: node.id, type: 'stack', gap: 'md', children: kids };
      }
      if (decided === false) {
        const kids = (node.else ?? []).map(walk).filter((x): x is UiNode => x !== null);
        if (!kids.length) return null;
        return { id: node.id, type: 'stack', gap: 'md', children: kids };
      }
      next.then = node.then.map(walk).filter(Boolean);
      if (node.else) next.else = node.else.map(walk).filter(Boolean);
      return next as unknown as UiNode;
    }

    for (const slot of ['children', 'empty'] as const) {
      const kids = (node as unknown as Record<string, unknown>)[slot];
      if (Array.isArray(kids)) {
        next[slot] = kids.map((k) => walk(k as UiNode)).filter(Boolean);
      }
    }
    return next as unknown as UiNode;
  };

  const root = walk(screen.root);
  return {
    ...screen,
    root: root ?? { id: 'empty', type: 'stack', children: [] },
  };
}
