/**
 * Server-driven UI — the wire schema.
 *
 * This file is the CONTRACT. The mobile app mirrors it verbatim in
 * `mobile/src/lib/sdui/types.ts` and the web editor imports the same shapes.
 * Change it here first, bump SCHEMA_VERSION, then mirror.
 *
 * Two rules keep a generic renderer from becoming a liability:
 *
 *  1. Nothing in a tree is free-form executable. Every node type, every action
 *     kind and every data source is drawn from a closed allowlist (see
 *     sdui.registry.ts). A published layout can rearrange and re-label the app;
 *     it can never point it at an arbitrary URL or run arbitrary logic.
 *
 *  2. The app must survive a tree it does not understand. Unknown node types
 *     render nothing rather than throwing, and any screen that fails outright
 *     falls back to the layout compiled into the build. An old binary must stay
 *     usable after the server learns a new node type — that is the whole reason
 *     `version` travels with every screen.
 */

/** Bump on any breaking change to node shapes. Clients compare and fall back. */
export const SCHEMA_VERSION = 1;

/** The surfaces a workspace may re-author. */
export const SCREEN_KEYS = ['home', 'more', 'tabs', 'onboarding'] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];

/** JSON-safe prop values. Deliberately no functions, no nested trees. */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

// ────────────────────────────────────────────────────────────────────────
// Expressions
// ────────────────────────────────────────────────────────────────────────

/**
 * A template string: literal text with `{{path}}` holes resolved against the
 * screen's data scope. Supports an optional fallback and one formatting filter:
 *
 *   "Hi {{home.profile.name ?? there}}."
 *   "{{home.snapshot.waterMl | round}} ml"
 *   "{{home.program.starts_at | date}}"
 *
 * Resolution is a path walk over plain objects — never eval, never a function
 * constructor. A path that misses yields the fallback, or '' when none is given.
 */
export type Template = string;

/** Formatting filters a template may apply. Closed set, implemented client-side. */
export const FILTERS = ['round', 'date', 'time', 'upper', 'lower', 'count', 'percent'] as const;
export type Filter = (typeof FILTERS)[number];

/**
 * A structured predicate. Structured rather than a mini expression language so
 * it can be validated exhaustively and rendered as a form in the web editor.
 *
 * `feature` is special: it asks whether the workspace's plan includes an
 * entitlement. It is resolved SERVER-side and the failing branch is pruned
 * before the tree ever reaches the device, so a client cannot read a layout for
 * a feature the practice has not paid for.
 */
export type UiCondition =
  | { op: 'and' | 'or'; of: UiCondition[] }
  | { op: 'not'; of: UiCondition }
  | {
      op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
      left: Template;
      right: string | number | boolean;
    }
  | { op: 'truthy' | 'empty'; left: Template }
  | { op: 'feature'; feature: string };

// ────────────────────────────────────────────────────────────────────────
// Actions
// ────────────────────────────────────────────────────────────────────────

/**
 * What a tap may do. An allowlist, not a callback: `navigate` targets are
 * checked against the app's known routes and `openUrl` is https-only, so a
 * compromised or careless layout cannot send a user somewhere arbitrary.
 */
export type UiAction =
  | { kind: 'none' }
  | { kind: 'navigate'; href: string }
  | { kind: 'back' }
  | { kind: 'openUrl'; url: string }
  | { kind: 'refresh' }
  | { kind: 'signOut' }
  /** Increment/overwrite a habit metric. Bounds are enforced by the API, not here. */
  | {
      kind: 'logHabit';
      metric: 'water_ml' | 'sleep_hours' | 'exercise_minutes';
      delta?: number;
      value?: number;
    }
  | { kind: 'logMood'; value: number }
  /** Onboarding only: submit the collected field values. */
  | { kind: 'submitOnboarding' }
  /** Onboarding only: advance/retreat a step. */
  | { kind: 'step'; by: number };

// ────────────────────────────────────────────────────────────────────────
// Data
// ────────────────────────────────────────────────────────────────────────

export const DATA_SOURCES = [
  'me.home',
  'me.profile',
  'me.meals',
  'me.habits',
  'me.program',
  'me.messages',
  'me.achievements',
  'me.wellnessSnapshot',
] as const;
export type DataSourceKey = (typeof DATA_SOURCES)[number];

/**
 * A screen declares which server payloads it needs; the client maps each
 * `source` to a fixed React Query fetcher. The layout names a source, it never
 * supplies a URL — that is the line that keeps SDUI from becoming SSRF-by-JSON.
 */
export interface UiDataBinding {
  /** Scope key the templates read from, e.g. 'home' → `{{home.profile.name}}`. */
  key: string;
  source: DataSourceKey;
  /** Whitelisted scalar params (e.g. days: 14). */
  params?: Record<string, string | number | boolean>;
}

// ────────────────────────────────────────────────────────────────────────
// Nodes
// ────────────────────────────────────────────────────────────────────────

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'muted' | 'caption' | 'label';
export type Tone =
  | 'text'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'onBrand'
  | 'danger'
  | 'success'
  | 'warning';
export type SpaceToken = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

interface NodeBase {
  /**
   * Stable id. Required: it is the React key, the editor's selection handle,
   * and what a render error is reported against. The server assigns one to any
   * node saved without it.
   */
  id: string;
  /** Render only when this holds. Evaluated client-side except for `feature`. */
  when?: UiCondition;
}

export type UiNode =
  // ── Structure ──────────────────────────────────────────────────────
  | (NodeBase & {
      type: 'stack';
      direction?: 'column' | 'row';
      gap?: SpaceToken;
      padding?: SpaceToken;
      align?: 'start' | 'center' | 'end' | 'stretch';
      justify?: 'start' | 'center' | 'end' | 'between';
      wrap?: boolean;
      children: UiNode[];
    })
  | (NodeBase & { type: 'card'; padding?: SpaceToken; children: UiNode[] })
  | (NodeBase & { type: 'section'; title?: Template; children: UiNode[] })
  | (NodeBase & { type: 'spacer'; size?: SpaceToken })
  | (NodeBase & { type: 'divider' })
  // ── Content ────────────────────────────────────────────────────────
  | (NodeBase & {
      type: 'text';
      value: Template;
      variant?: TextVariant;
      tone?: Tone;
      align?: 'left' | 'center' | 'right';
      lines?: number;
    })
  | (NodeBase & { type: 'icon'; name: string; size?: number; tone?: Tone })
  | (NodeBase & {
      type: 'image';
      url: Template;
      height?: number;
      radius?: SpaceToken;
      mode?: 'cover' | 'contain';
    })
  | (NodeBase & { type: 'badge'; value: Template; tone?: Tone })
  | (NodeBase & { type: 'progress'; value: Template; max?: number; tone?: Tone })
  | (NodeBase & { type: 'ring'; value: Template; label?: Template; caption?: Template })
  | (NodeBase & { type: 'chart'; points: Template; label?: Template })
  // ── Interactive ────────────────────────────────────────────────────
  | (NodeBase & { type: 'button'; label: Template; variant?: 'primary' | 'ghost'; action?: UiAction })
  | (NodeBase & { type: 'pressable'; action?: UiAction; children: UiNode[] })
  /** The grouped-list row that the More menu is built from. */
  | (NodeBase & {
      type: 'row';
      label: Template;
      icon?: string;
      detail?: Template;
      badge?: Template;
      action?: UiAction;
    })
  // ── Logic ──────────────────────────────────────────────────────────
  | (NodeBase & {
      type: 'if';
      /**
       * The branch selector. Named `cond` rather than `when` so it cannot be
       * confused with NodeBase's `when` visibility guard: a false `when` removes
       * a node entirely, while a false `cond` is what selects the `else` branch.
       * One name for both meanings silently swallowed every else branch.
       */
      cond: UiCondition;
      then: UiNode[];
      else?: UiNode[];
    })
  | (NodeBase & {
      type: 'repeat';
      /** Template resolving to an array, e.g. '{{home.mood}}'. */
      each: Template;
      /** Scope key each item is bound to inside `children`. Default 'item'. */
      as?: string;
      max?: number;
      children: UiNode[];
      /** Rendered instead when the array is empty or missing. */
      empty?: UiNode[];
    })
  // ── Screen-specific ────────────────────────────────────────────────
  /** Only valid on the `tabs` screen. */
  | (NodeBase & { type: 'tab'; route: string; label: Template; icon: string })
  /** Only valid on the `onboarding` screen. */
  | (NodeBase & { type: 'step'; key: string; title: Template; subtitle?: Template; children: UiNode[] })
  /** Only valid inside a `step`. Collects a value keyed by `key`. */
  | (NodeBase & {
      type: 'field';
      key: string;
      label: Template;
      kind: 'text' | 'multiline' | 'number' | 'select' | 'chips' | 'date';
      placeholder?: Template;
      required?: boolean;
      min?: number;
      max?: number;
      options?: { value: string; label: string }[];
    })
  // ── Escape hatch ───────────────────────────────────────────────────
  /**
   * Renders a component compiled into the app by name. This is what keeps the
   * schema small: genuinely interactive or animated pieces (the mood picker,
   * the habit tiles) stay native code, and the server only decides WHERE they
   * sit. A name the build doesn't know renders nothing.
   */
  | (NodeBase & { type: 'native'; component: string; props?: Record<string, Json> });

export type UiNodeType = UiNode['type'];

/** One authored surface. */
export interface UiScreen {
  /** SCHEMA_VERSION this tree was authored against. */
  version: number;
  screen: ScreenKey;
  /** Monotonic content revision, bumped on publish. Drives client cache busting. */
  revision: number;
  data?: UiDataBinding[];
  root: UiNode;
}

/** What `GET /v1/me/ui` returns — every screen in one round-trip. */
export interface UiBundle {
  version: number;
  /** Hash of the payload; the client sends it back as If-None-Match. */
  etag: string;
  screens: Partial<Record<ScreenKey, UiScreen>>;
}
