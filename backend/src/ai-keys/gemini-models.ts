/**
 * Which Gemini models NUSI asks for, in order.
 *
 * Google retires models: a retired one answers 404 "no longer available to
 * new users", so a key created after the retirement can't use it at all even
 * while older keys still can. Busy models answer 503. Never depend on a single
 * model name: try the primary, then the fallbacks.
 *
 * Env overrides, so a retirement is a config change, not a code change:
 *   GEMINI_MODEL            primary
 *   GEMINI_FALLBACK_MODELS  comma-separated, tried in order
 */
// Measured 2026-10-11 on NUSI's key: 3.5-flash answered in 1.5-2.5s; 3.8-flash
// (Google's suggestion) and flash-latest timed out at 40s under load; 2.5-flash
// answered in 2s but is closed to keys created after its retirement.
export const GEMINI_PRIMARY_MODEL = 'gemini-3.5-flash';
export const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest'];

type Config = { get<T = string>(key: string): T | undefined };

export function geminiModels(config?: Config): string[] {
  const primary = config?.get<string>('GEMINI_MODEL')?.trim() || GEMINI_PRIMARY_MODEL;
  const configured = config?.get<string>('GEMINI_FALLBACK_MODELS');
  const fallbacks = configured === undefined
    ? GEMINI_FALLBACK_MODELS
    : configured.split(',').map((m) => m.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

/** HTTP status of a Gemini SDK error (the SDK puts it in the message). */
export function geminiStatus(err: unknown): number {
  const typed = (err as { status?: unknown })?.status;
  if (typeof typed === 'number') return typed;
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/"code"\s*:\s*(\d{3})/) ?? message.match(/\[(\d{3})\s/);
  return match ? Number(match[1]) : 0;
}

/**
 * Whether another model might succeed where this one failed: retired or
 * unknown (404), busy (503), or rate-limited per model (429). A bad key (400,
 * 401, 403) fails the same on every model.
 */
export function tryNextGeminiModel(err: unknown): boolean {
  return [404, 429, 503].includes(geminiStatus(err));
}
