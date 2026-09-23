/**
 * Server-driven UI — resolving `{{bindings}}` and conditions on device.
 *
 * Everything here is a path walk over plain data. There is deliberately no
 * `eval`, no `new Function`, no JSON-to-JS expression compiler: a layout comes
 * off the network, and the moment it can express computation it is remote code
 * execution wearing a schema. The cost of that choice is that the template
 * language is small — a path, an optional fallback, one formatting filter — and
 * that is the right trade for a surface a customer can publish to.
 */
import type { Filter, UiCondition } from './types';

/** The data a screen was rendered with, keyed by its declared binding names. */
export type Scope = Record<string, unknown>;

const HOLE = /\{\{([^}]*)\}\}/g;

/**
 * Walk `a.b[0].c` over plain objects and arrays.
 *
 * Own-property checks only. A path like `constructor.prototype` would otherwise
 * climb out of the data and into JavaScript's own object graph, which is the
 * classic way a "harmless" template resolver turns into a prototype-pollution
 * read primitive.
 */
function readPath(scope: Scope, path: string): unknown {
  const parts = path.split(/[.[\]]+/).filter(Boolean);
  let cur: unknown = scope;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;
    if (Array.isArray(cur)) {
      const i = Number(part);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return undefined;
      cur = cur[i];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function applyFilter(value: unknown, filter: Filter): unknown {
  switch (filter) {
    case 'round': {
      const n = Number(value);
      return Number.isFinite(n) ? Math.round(n) : value;
    }
    case 'percent': {
      const n = Number(value);
      return Number.isFinite(n) ? `${Math.round(n * 100)}%` : value;
    }
    case 'count':
      return Array.isArray(value) ? value.length : value == null ? 0 : 1;
    case 'upper':
      return typeof value === 'string' ? value.toUpperCase() : value;
    case 'lower':
      return typeof value === 'string' ? value.toLowerCase() : value;
    case 'date': {
      const d = toDate(value);
      return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
    }
    case 'time': {
      const d = toDate(value);
      return d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    }
    default:
      return value;
  }
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface ParsedHole {
  path: string;
  fallback?: string;
  filter?: Filter;
}

/** `home.profile.name ?? there | upper` → { path, fallback, filter } */
function parseHole(body: string): ParsedHole | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  let rest = trimmed;
  let filter: Filter | undefined;
  const pipe = rest.lastIndexOf('|');
  if (pipe !== -1) {
    filter = rest.slice(pipe + 1).trim() as Filter;
    rest = rest.slice(0, pipe).trim();
  }

  let fallback: string | undefined;
  const coalesce = rest.indexOf('??');
  if (coalesce !== -1) {
    fallback = rest.slice(coalesce + 2).trim();
    rest = rest.slice(0, coalesce).trim();
  }

  if (!rest) return null;
  return { path: rest, fallback, filter };
}

/**
 * Resolve one hole to its raw value (not stringified).
 *
 * Used where the type matters — `repeat`'s array, `progress`'s number — rather
 * than where the result is going straight into a Text node.
 */
export function resolveValue(template: string, scope: Scope): unknown {
  const whole = template.trim().match(/^\{\{([^}]*)\}\}$/);
  if (!whole) return interpolate(template, scope);

  const parsed = parseHole(whole[1]);
  if (!parsed) return undefined;

  let value = readPath(scope, parsed.path);
  if ((value === undefined || value === null || value === '') && parsed.fallback !== undefined) {
    value = parsed.fallback;
  }
  if (parsed.filter) value = applyFilter(value, parsed.filter);
  return value;
}

/** Substitute every hole in a template and return the resulting string. */
export function interpolate(template: string, scope: Scope): string {
  if (!template.includes('{{')) return template;

  HOLE.lastIndex = 0;
  return template.replace(HOLE, (_match, body: string) => {
    const parsed = parseHole(body);
    if (!parsed) return '';

    let value = readPath(scope, parsed.path);
    if ((value === undefined || value === null || value === '') && parsed.fallback !== undefined) {
      return parsed.filter ? String(applyFilter(parsed.fallback, parsed.filter)) : parsed.fallback;
    }
    if (parsed.filter) value = applyFilter(value, parsed.filter);

    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return Array.isArray(value) ? String(value.length) : '';
    return String(value);
  });
}

/** Number coercion for numeric props, with a caller-chosen default. */
export function resolveNumber(template: string, scope: Scope, fallback = 0): number {
  const raw = resolveValue(template, scope);
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Array coercion for `repeat`. Anything non-array reads as empty. */
export function resolveArray(template: string, scope: Scope): unknown[] {
  const raw = resolveValue(template, scope);
  return Array.isArray(raw) ? raw : [];
}

function truthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

/**
 * Evaluate a condition against the current scope.
 *
 * `feature` always reads true here: the server has already resolved plan gates
 * and cut the losing branches, so anything still in the tree has passed. If a
 * stale tree somehow carries one, showing it is the safe failure — the screen
 * behind it enforces its own entitlement and returns 402.
 */
export function evaluate(condition: UiCondition | undefined, scope: Scope): boolean {
  if (!condition) return true;

  switch (condition.op) {
    case 'and':
      return condition.of.every((c) => evaluate(c, scope));
    case 'or':
      return condition.of.some((c) => evaluate(c, scope));
    case 'not':
      return !evaluate(condition.of, scope);
    case 'feature':
      return true;
    case 'truthy':
      return truthy(resolveValue(condition.left, scope));
    case 'empty':
      return !truthy(resolveValue(condition.left, scope));
    default:
      break;
  }

  const left = resolveValue(condition.left, scope);
  const right = condition.right;

  switch (condition.op) {
    case 'eq':
      return looseEq(left, right);
    case 'ne':
      return !looseEq(left, right);
    case 'contains': {
      if (Array.isArray(left)) return left.some((v) => looseEq(v, right));
      return String(left ?? '')
        .toLowerCase()
        .includes(String(right).toLowerCase());
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = Number(left);
      const b = Number(right);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (condition.op === 'gt') return a > b;
      if (condition.op === 'gte') return a >= b;
      if (condition.op === 'lt') return a < b;
      return a <= b;
    }
    default:
      return true;
  }
}

/**
 * Compare across the string/number boundary.
 *
 * Bindings come from JSON APIs where an id or a count is a string in one
 * payload and a number in the next. An author writing `eq 3` means three, and
 * being strict here would just produce conditions that mysteriously never fire.
 */
function looseEq(a: unknown, b: string | number | boolean): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return false;
  if (typeof b === 'boolean') return truthy(a) === b;
  return String(a) === String(b);
}
