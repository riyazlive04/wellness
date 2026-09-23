/**
 * Server-driven UI — the allowlist.
 *
 * ONE table describes every node the schema permits: which props it takes, what
 * each prop may hold, which screens it is legal on, and where its children go.
 * The validator walks it to accept or reject a tree; the web editor walks the
 * same table to build its palette and its property forms.
 *
 * That shared table is the point. A hand-written validator and a hand-written
 * editor form drift the moment someone adds a prop, and the drift shows up as a
 * layout an author can build but the server rejects — or worse, one the server
 * accepts and the app cannot render. Describe the node once, derive both.
 */
import { FEATURES, type Feature } from '../common/features';
import { DATA_SOURCES, SCREEN_KEYS, type ScreenKey, type UiNodeType } from './sdui.types';

// ────────────────────────────────────────────────────────────────────────
// Structural limits
// ────────────────────────────────────────────────────────────────────────

/**
 * Hard ceilings on a tree. These are not style guidelines — they are what stops
 * a published layout from hanging the render thread on a mid-range Android
 * device, and what bounds the work the validator itself has to do.
 */
export const LIMITS = {
  maxNodes: 400,
  maxDepth: 14,
  /** Any single template/string prop. */
  maxStringLength: 600,
  /** Items a `repeat` may materialise, regardless of the bound array's length. */
  maxRepeat: 60,
  /** Serialized bytes for one screen. */
  maxScreenBytes: 128 * 1024,
} as const;

// ────────────────────────────────────────────────────────────────────────
// Navigation allowlist
// ────────────────────────────────────────────────────────────────────────

/**
 * Every route a `navigate` action may target. A `*` stands for exactly one
 * dynamic segment, so `/(tabs)/more/program/*` accepts a templated id but not a
 * traversal into some other area of the app.
 *
 * Mirrors the expo-router file tree in mobile/src/app. A route added there and
 * forgotten here simply cannot be linked from a server-driven layout — which is
 * the safe direction for this list to be wrong in.
 */
export const ROUTES: readonly string[] = [
  '/(tabs)',
  '/(tabs)/meals',
  '/(tabs)/assistant',
  '/(tabs)/progress',
  '/(tabs)/chat',
  '/(tabs)/more',
  '/(tabs)/more/habits',
  '/(tabs)/more/journal',
  '/(tabs)/more/wellbeing',
  '/(tabs)/more/cycle',
  '/(tabs)/more/meal-plan',
  '/(tabs)/more/goals',
  '/(tabs)/more/programs',
  '/(tabs)/more/program/*',
  '/(tabs)/more/assessments',
  '/(tabs)/more/assessment/*',
  '/(tabs)/more/timeline',
  '/(tabs)/more/foods',
  '/(tabs)/more/barcode',
  '/(tabs)/more/recipes',
  '/(tabs)/more/supplements',
  '/(tabs)/more/measurements',
  '/(tabs)/more/photos',
  '/(tabs)/more/reports',
  '/(tabs)/more/files',
  '/(tabs)/more/shop',
  '/(tabs)/more/appointments',
  '/(tabs)/more/meeting/*',
  '/(tabs)/more/community',
  '/(tabs)/more/notifications',
  '/(tabs)/more/settings',
  '/plate-vision',
];

/**
 * The expo-router screen names under app/(tabs). A `tab` node may only name one
 * of these: the tab bar can be reordered, relabelled and thinned, but it cannot
 * invent a destination that has no screen file behind it.
 */
export const TAB_ROUTES: readonly string[] = [
  'index',
  'meals',
  'assistant',
  'progress',
  'chat',
  'more',
];

/** A tab the author may not remove — without it the app has no way home. */
export const REQUIRED_TABS: readonly string[] = ['index'];

/** Does `href` (after template holes are blanked) match the route allowlist? */
export function isAllowedRoute(href: string): boolean {
  // A templated segment is opaque at validation time; treat it as one segment.
  const path = href.replace(/\{\{[^}]*\}\}/g, '*').split('?')[0].replace(/\/+$/, '') || '/';
  return ROUTES.some((pattern) => {
    const p = pattern.split('/');
    const h = path.split('/');
    if (p.length !== h.length) return false;
    return p.every((seg, i) => seg === '*' || seg === h[i]);
  });
}

// ────────────────────────────────────────────────────────────────────────
// Native component allowlist
// ────────────────────────────────────────────────────────────────────────

/**
 * Components compiled into the app that a layout may place by name.
 *
 * This list is why the schema stays small. Anything genuinely stateful or
 * animated — the mood picker, the tappable habit tiles — stays real React
 * Native code; the server only decides whether and where it appears. Trying to
 * express those in generic nodes is how an SDUI schema turns into a bad
 * programming language.
 *
 * The app owns the truth here; an entry the build doesn't know renders nothing.
 */
export const NATIVE_COMPONENTS: readonly string[] = [
  /** Greeting, live clock, streak and the score ring. */
  'home.scoreHero',
  /** The gradient "Log a meal" call to action. */
  'home.logMealCta',
  /** Water/sleep/move/mood tiles plus the mood picker they expand into. */
  'home.habitTiles',
  /** Calories against target for today. */
  'home.mealSummary',
  /** Latest message from the nutritionist. */
  'home.coachNudge',
  /** Active program week + status. */
  'home.programProgress',
  /** The 2x2 shortcut grid. */
  'home.quickActions',
  /** Avatar, name, email and the settings shortcut. */
  'more.profileHeader',
  /** The destructive sign-out button. */
  'more.signOut',
];

// ────────────────────────────────────────────────────────────────────────
// Prop specification
// ────────────────────────────────────────────────────────────────────────

export type PropKind =
  /** Text with `{{binding}}` holes. */
  | 'template'
  /** Plain text, no bindings resolved. */
  | 'string'
  | 'number'
  | 'boolean'
  /** One of `values`. */
  | 'enum'
  /** An Ionicons glyph name. */
  | 'icon'
  /** A UiAction object. */
  | 'action'
  /** A UiCondition object. */
  | 'condition'
  /** A child node array — the editor renders a drop target. */
  | 'nodes'
  /** `{ value, label }[]` for select/chips fields. */
  | 'options'
  /** Free JSON bag, only for `native` props. */
  | 'json';

export interface PropSpec {
  kind: PropKind;
  required?: boolean;
  /** For `enum`. */
  values?: readonly string[];
  /** For `number`. */
  min?: number;
  max?: number;
  /** Editor affordances. */
  label?: string;
  hint?: string;
  default?: unknown;
}

export interface NodeSpec {
  /** Editor-facing name. */
  label: string;
  /** One line explaining when to reach for it. */
  hint: string;
  /** Palette grouping in the editor. */
  group: 'structure' | 'content' | 'interactive' | 'logic' | 'screen';
  /** Screens this node is legal on. Omitted = all. */
  screens?: readonly ScreenKey[];
  /** Node types this one may only appear directly inside. */
  parents?: readonly UiNodeType[];
  props: Record<string, PropSpec>;
}

const TONES = ['text', 'muted', 'faint', 'accent', 'onBrand', 'danger', 'success', 'warning'] as const;
const VARIANTS = ['display', 'title', 'heading', 'body', 'muted', 'caption', 'label'] as const;
const SPACE = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const;

/** The catalog. Adding a node type means adding an entry here first. */
export const NODE_SPECS: Record<UiNodeType, NodeSpec> = {
  // ── Structure ──────────────────────────────────────────────────────
  stack: {
    label: 'Stack',
    hint: 'Lays children out in a column or a row.',
    group: 'structure',
    props: {
      direction: { kind: 'enum', values: ['column', 'row'], default: 'column' },
      gap: { kind: 'enum', values: SPACE, default: 'md' },
      padding: { kind: 'enum', values: SPACE, default: 'none' },
      align: { kind: 'enum', values: ['start', 'center', 'end', 'stretch'] },
      justify: { kind: 'enum', values: ['start', 'center', 'end', 'between'] },
      wrap: { kind: 'boolean' },
      children: { kind: 'nodes', required: true },
    },
  },
  card: {
    label: 'Card',
    hint: 'Elevated surface with a border — the app’s default grouping.',
    group: 'structure',
    props: {
      padding: { kind: 'enum', values: SPACE, default: 'lg' },
      children: { kind: 'nodes', required: true },
    },
  },
  section: {
    label: 'Section',
    hint: 'An uppercase eyebrow label above a group of cards.',
    group: 'structure',
    props: {
      title: { kind: 'template' },
      children: { kind: 'nodes', required: true },
    },
  },
  spacer: {
    label: 'Spacer',
    hint: 'Fixed vertical gap.',
    group: 'structure',
    props: { size: { kind: 'enum', values: SPACE, default: 'md' } },
  },
  divider: {
    label: 'Divider',
    hint: 'Hairline rule.',
    group: 'structure',
    props: {},
  },

  // ── Content ────────────────────────────────────────────────────────
  text: {
    label: 'Text',
    hint: 'Themed text. Use {{bindings}} to pull in live data.',
    group: 'content',
    props: {
      value: { kind: 'template', required: true },
      variant: { kind: 'enum', values: VARIANTS, default: 'body' },
      tone: { kind: 'enum', values: TONES, default: 'text' },
      align: { kind: 'enum', values: ['left', 'center', 'right'] },
      lines: { kind: 'number', min: 1, max: 20 },
    },
  },
  icon: {
    label: 'Icon',
    hint: 'An Ionicons glyph, e.g. heart-outline.',
    group: 'content',
    props: {
      name: { kind: 'icon', required: true },
      size: { kind: 'number', min: 8, max: 96, default: 20 },
      tone: { kind: 'enum', values: TONES, default: 'muted' },
    },
  },
  image: {
    label: 'Image',
    hint: 'Remote image. https only.',
    group: 'content',
    props: {
      url: { kind: 'template', required: true },
      height: { kind: 'number', min: 20, max: 600, default: 160 },
      radius: { kind: 'enum', values: SPACE, default: 'lg' },
      mode: { kind: 'enum', values: ['cover', 'contain'], default: 'cover' },
    },
  },
  badge: {
    label: 'Badge',
    hint: 'Small pill, usually a count or status.',
    group: 'content',
    props: {
      value: { kind: 'template', required: true },
      tone: { kind: 'enum', values: TONES, default: 'accent' },
    },
  },
  progress: {
    label: 'Progress bar',
    hint: 'Horizontal fill from a numeric binding.',
    group: 'content',
    props: {
      value: { kind: 'template', required: true },
      max: { kind: 'number', min: 1, max: 100000, default: 100 },
      tone: { kind: 'enum', values: TONES, default: 'accent' },
    },
  },
  ring: {
    label: 'Score ring',
    hint: 'The circular wellness score dial.',
    group: 'content',
    props: {
      value: { kind: 'template', required: true },
      label: { kind: 'template' },
      caption: { kind: 'template' },
    },
  },
  chart: {
    label: 'Trend chart',
    hint: 'Sparkline over an array binding of numbers.',
    group: 'content',
    props: {
      points: { kind: 'template', required: true },
      label: { kind: 'template' },
    },
  },

  // ── Interactive ────────────────────────────────────────────────────
  button: {
    label: 'Button',
    hint: 'Primary gradient CTA or a ghost outline button.',
    group: 'interactive',
    props: {
      label: { kind: 'template', required: true },
      variant: { kind: 'enum', values: ['primary', 'ghost'], default: 'primary' },
      action: { kind: 'action' },
    },
  },
  pressable: {
    label: 'Pressable',
    hint: 'Makes anything tappable.',
    group: 'interactive',
    props: {
      action: { kind: 'action' },
      children: { kind: 'nodes', required: true },
    },
  },
  row: {
    label: 'List row',
    hint: 'Icon + label + chevron. What the More menu is built from.',
    group: 'interactive',
    props: {
      label: { kind: 'template', required: true },
      icon: { kind: 'icon' },
      detail: { kind: 'template' },
      badge: { kind: 'template' },
      action: { kind: 'action' },
    },
  },

  // ── Logic ──────────────────────────────────────────────────────────
  if: {
    label: 'Condition',
    hint: 'Shows one branch or the other based on live data or plan.',
    group: 'logic',
    props: {
      cond: { kind: 'condition', required: true, label: 'Show the first branch when' },
      then: { kind: 'nodes', required: true },
      else: { kind: 'nodes' },
    },
  },
  repeat: {
    label: 'Repeat',
    hint: 'Renders children once per item of a bound array.',
    group: 'logic',
    props: {
      each: { kind: 'template', required: true, hint: 'e.g. {{home.mood}}' },
      as: { kind: 'string', default: 'item', hint: 'Scope name inside the loop.' },
      max: { kind: 'number', min: 1, max: LIMITS.maxRepeat, default: 20 },
      children: { kind: 'nodes', required: true },
      empty: { kind: 'nodes', hint: 'Shown when the array is empty.' },
    },
  },

  // ── Screen-specific ────────────────────────────────────────────────
  tab: {
    label: 'Tab',
    hint: 'One entry in the bottom tab bar.',
    group: 'screen',
    screens: ['tabs'],
    props: {
      route: { kind: 'enum', values: TAB_ROUTES, required: true },
      label: { kind: 'template', required: true },
      icon: { kind: 'icon', required: true },
    },
  },
  step: {
    label: 'Onboarding step',
    hint: 'One full-screen page of the onboarding flow.',
    group: 'screen',
    screens: ['onboarding'],
    props: {
      key: { kind: 'string', required: true },
      title: { kind: 'template', required: true },
      subtitle: { kind: 'template' },
      children: { kind: 'nodes', required: true },
    },
  },
  field: {
    label: 'Input field',
    hint: 'Collects one value during onboarding.',
    group: 'screen',
    screens: ['onboarding'],
    parents: ['step', 'stack', 'card'],
    props: {
      key: { kind: 'string', required: true, hint: 'Profile key this writes to.' },
      label: { kind: 'template', required: true },
      kind: {
        kind: 'enum',
        values: ['text', 'multiline', 'number', 'select', 'chips', 'date'],
        required: true,
        default: 'text',
      },
      placeholder: { kind: 'template' },
      required: { kind: 'boolean' },
      min: { kind: 'number' },
      max: { kind: 'number' },
      options: { kind: 'options' },
    },
  },

  // ── Escape hatch ───────────────────────────────────────────────────
  native: {
    label: 'Built-in block',
    hint: 'Places a component that ships inside the app.',
    group: 'structure',
    props: {
      component: { kind: 'enum', values: NATIVE_COMPONENTS, required: true },
      props: { kind: 'json' },
    },
  },
};

/**
 * Onboarding writes straight through to `POST /v1/me/onboarding/complete`, so a
 * field may only name a key that endpoint's DTO accepts. Without this an author
 * could invent keys that pass validation here and then silently vanish on
 * submit, because class-validator strips what it does not declare.
 *
 * Keep in step with CompleteOnboardingDto in clients/me.controller.ts.
 */
export const ONBOARDING_FIELD_KEYS: readonly string[] = [
  'age',
  'gender',
  'goals',
  'phone',
  'allergies',
  'medical_conditions',
  'food_preferences',
  'activity_level',
  'height_cm',
  'initial_weight_kg',
];

/** Values `activity_level` is allowed to take — mirrors the DTO's @IsIn. */
export const ACTIVITY_LEVELS: readonly string[] = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
];

/** Actions that only make sense on the onboarding screen. */
export const ONBOARDING_ONLY_ACTIONS: readonly string[] = ['submitOnboarding', 'step'];

export const ACTION_KINDS: readonly string[] = [
  'none',
  'navigate',
  'back',
  'openUrl',
  'refresh',
  'signOut',
  'logHabit',
  'logMood',
  'submitOnboarding',
  'step',
];

export const HABIT_METRICS: readonly string[] = ['water_ml', 'sleep_hours', 'exercise_minutes'];

export const CONDITION_OPS: readonly string[] = [
  'and',
  'or',
  'not',
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'truthy',
  'empty',
  'feature',
];

export function isFeature(x: string): x is Feature {
  return (FEATURES as readonly string[]).includes(x);
}

export function isScreenKey(x: string): x is ScreenKey {
  return (SCREEN_KEYS as readonly string[]).includes(x);
}

export function isDataSource(x: string): boolean {
  return (DATA_SOURCES as readonly string[]).includes(x);
}

/**
 * An Ionicons glyph name. The full glyph map lives in the app bundle, so the
 * server can only check the shape — a name that does not exist renders as a
 * blank box rather than a crash, which is an acceptable authoring mistake.
 */
export function isIconName(x: string): boolean {
  return /^[a-z][a-z0-9-]{1,40}$/.test(x);
}
