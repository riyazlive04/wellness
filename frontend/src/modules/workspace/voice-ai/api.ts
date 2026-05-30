/**
 * Voice AI API client — single-shot converse endpoint.
 * Talks to the NestJS backend at VITE_API_BASE_URL.
 */

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

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

export async function converse(audio: Blob): Promise<VoiceConverseResponse> {
  const fd = new FormData();
  // Backend expects field name "audio"; filename helps the backend pick a mime if browser omits it.
  fd.append('audio', audio, `clip.${extensionFor(audio.type)}`);

  const res = await fetch(`${API_BASE}/api/v1/voice/converse`, {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Voice converse failed (${res.status}): ${text || res.statusText}`);
  }

  // Backend wraps successful responses in { data, meta }.
  const json = (await res.json()) as { data: VoiceConverseResponse };
  return json.data;
}

function extensionFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg')) return 'mp3';
  return 'bin';
}
