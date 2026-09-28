/**
 * Voice AI API client — single-shot converse endpoint.
 * Talks to the NestJS backend at VITE_API_BASE_URL.
 */

import { api } from '@/lib/api';

export interface VoiceConverseResponse {
  userTranscript: string;
  aiResponse: string;
  intent: VoiceIntent;
  latencyMs: number;
}

export type VoiceIntent =
  | { kind: 'meal_log';   foods: string[]; notes?: string }
  | { kind: 'question';   topic: string }
  | { kind: 'reflection'; mood?: string; energy?: number }
  | { kind: 'unknown' };

export async function converse(audio: Blob): Promise<VoiceConverseResponse> {
  const fd = new FormData();
  // Backend expects field name "audio"; filename helps the backend pick a mime if browser omits it.
  fd.append('audio', audio, `clip.${extensionFor(audio.type)}`);

  // The shared client adds the sign-in token (the endpoint needs the
  // practice, for its AI key) and turns failures into ApiError.
  return api.post<VoiceConverseResponse>('/api/v1/voice/converse', { body: fd });
}

function extensionFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg')) return 'mp3';
  return 'bin';
}
