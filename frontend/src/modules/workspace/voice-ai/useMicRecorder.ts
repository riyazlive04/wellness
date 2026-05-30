import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'requesting' | 'recording' | 'stopped' | 'denied' | 'unsupported';

export interface MicRecorder {
  status: Status;
  /** Last recorded clip, available after stop(). */
  clip: Blob | null;
  /** Begin recording. Resolves once the stream is acquired and MediaRecorder is started. */
  start: () => Promise<void>;
  /** Stop recording. Resolves with the final blob (also stored in `clip`). */
  stop: () => Promise<Blob | null>;
  /** Reset to idle (releases mic, clears clip). */
  reset: () => void;
}

/**
 * Cross-browser MIME pick. Chrome/Edge prefer webm;opus; Safari prefers mp4.
 */
function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function useMicRecorder(): MicRecorder {
  const [status, setStatus] = useState<Status>('idle');
  const [clip, setClip] = useState<Blob | null>(null);

  const recRef    = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopResolveRef = useRef<((b: Blob | null) => void) | null>(null);

  // Cleanup on unmount: kill recorder + release mic.
  useEffect(() => {
    return () => {
      try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    setStatus('requesting');
    setClip(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;
      rec.addEventListener('dataavailable', (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      });
      rec.addEventListener('stop', () => {
        const type = rec.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setClip(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recRef.current = null;
        setStatus('stopped');
        stopResolveRef.current?.(blob);
        stopResolveRef.current = null;
      });
      rec.start();
      setStatus('recording');
    } catch (err) {
      console.error('Mic permission error', err);
      setStatus('denied');
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const rec = recRef.current;
    if (!rec || rec.state !== 'recording') return clip;
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      rec.stop();
    });
  }, [clip]);

  const reset = useCallback(() => {
    try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    chunksRef.current = [];
    setClip(null);
    setStatus('idle');
  }, []);

  return { status, clip, start, stop, reset };
}
