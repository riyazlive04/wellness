/**
 * Browser-native TTS using SpeechSynthesis. No API key, no cost.
 * Picks the highest-quality English voice available on the user's OS.
 */

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  if (typeof speechSynthesis === 'undefined') return null;

  const voices = speechSynthesis.getVoices();
  // Preferences: Google > Microsoft > Apple > anything English.
  const score = (v: SpeechSynthesisVoice): number => {
    let s = 0;
    const lang = v.lang.toLowerCase();
    if (lang.startsWith('en')) s += 10;
    if (lang === 'en-us' || lang === 'en-gb' || lang === 'en-in') s += 5;
    const name = v.name.toLowerCase();
    if (name.includes('google')) s += 8;
    if (name.includes('natural')) s += 6;
    if (name.includes('microsoft') || name.includes('aria') || name.includes('jenny')) s += 5;
    if (name.includes('samantha') || name.includes('siri')) s += 4;
    if (v.default) s += 2;
    return s;
  };
  cachedVoice = [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
  return cachedVoice;
}

export function speak(text: string, opts?: { rate?: number; pitch?: number }): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.rate = opts?.rate ?? 1.02;
  utter.pitch = opts?.pitch ?? 1.0;
  speechSynthesis.speak(utter);
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

// Voices populate asynchronously on most browsers — warm the cache.
if (typeof speechSynthesis !== 'undefined') {
  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.addEventListener('voiceschanged', () => {
      cachedVoice = null;
      pickVoice();
    }, { once: true });
  } else {
    pickVoice();
  }
}
