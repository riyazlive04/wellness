import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { Glass } from '@/design-system';

interface TranscriptProps {
  /** What the user "said" — rendered with a token-by-token reveal */
  userText: string;
  /** When user transcript is fully revealed */
  onUserComplete?: () => void;
  /** AI reply, revealed token-by-token once `aiText` is non-empty */
  aiText?: string;
  /** Show the listening hint indicator while user transcript animates in */
  showListeningHint?: boolean;
}

/**
 * Transcript — two-bubble conversation view. The user line types in as
 * the orb "listens"; the AI line types in once the response stage begins.
 */
export function Transcript({ userText, aiText, onUserComplete, showListeningHint }: TranscriptProps) {
  const userRevealed = useTypewriter(userText, 22, onUserComplete);
  const aiRevealed   = useTypewriter(aiText ?? '', 14);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3">
      {/* User bubble */}
      <AnimatePresence>
        {userText && (
          <motion.div
            key="user"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="flex justify-end"
          >
            <Glass className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-sm text-white">
              {userRevealed}
              {showListeningHint && userRevealed.length < userText.length && (
                <span className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-emerald-300 align-middle" />
              )}
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI bubble */}
      <AnimatePresence>
        {aiText && (
          <motion.div
            key="ai"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="flex justify-start"
          >
            <div className="max-w-[85%]">
              <div className="mb-1 ml-1 text-[10px] uppercase tracking-[0.18em] text-violet-300">
                SIRAH
              </div>
              <Glass
                variant="heavy"
                className="rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed text-white/90"
              >
                {aiRevealed}
                {aiRevealed.length < aiText.length && (
                  <span className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-violet-300 align-middle" />
                )}
              </Glass>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function useTypewriter(text: string, msPerChar: number, onComplete?: () => void): string {
  const [revealed, setRevealed] = useState('');

  useEffect(() => {
    if (!text) {
      setRevealed('');
      return;
    }
    setRevealed('');
    let i = 0;
    const handle = setInterval(() => {
      i++;
      setRevealed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(handle);
        onComplete?.();
      }
    }, msPerChar);
    return () => clearInterval(handle);
    // intentionally exclude onComplete from deps so it doesn't re-trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, msPerChar]);

  return revealed;
}
