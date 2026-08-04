/**
 * Voice AI — single-shot converse endpoint.
 *
 * Rewritten for React Native rather than copied verbatim from the web module:
 * the web version posted a browser `Blob` through a bare `fetch` pointed at
 * `import.meta.env.VITE_API_BASE_URL`, with no Authorization header. On mobile
 * there is no Blob for a recording (the recorder hands back a file URI),
 * `import.meta` doesn't exist in Hermes, and the backend needs the Supabase
 * JWT — so this goes through the app's own `api` wrapper, which injects auth
 * and resolves the runtime-configurable base URL.
 */
import { api } from '@/lib/api';

export type VoiceIntent =
  | { kind: 'meal_log'; foods: string[]; notes?: string }
  | { kind: 'question'; topic: string }
  | { kind: 'reflection'; mood?: string; energy?: number }
  | { kind: 'unknown' };

export interface VoiceConverseResponse {
  userTranscript: string;
  aiResponse: string;
  intent: VoiceIntent;
  latencyMs: number;
}

function extensionFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'm4a';
}

/**
 * Send a recorded clip for transcription + intent parsing.
 * `uri` is a local file URI from the recorder (e.g. `file:///.../clip.m4a`).
 */
export async function converse(uri: string, mimeType = 'audio/m4a'): Promise<VoiceConverseResponse> {
  const fd = new FormData();
  // RN's FormData takes a {uri,name,type} descriptor where the web takes a Blob.
  fd.append('audio', {
    uri,
    name: `clip.${extensionFor(mimeType)}`,
    type: mimeType,
  } as unknown as Blob);
  return api.post<VoiceConverseResponse>('/api/v1/voice/converse', { body: fd });
}

export const voiceAiApi = { converse };
