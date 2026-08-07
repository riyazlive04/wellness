import { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';

/**
 * Language picker for the topbars. Two languages today (English / தமிழ்), so a
 * small globe-triggered menu rather than a full <select>. The choice persists
 * via i18next's localStorage detector, so it survives reloads and logout.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current =
    SUPPORTED_LANGUAGES.find((l) => i18n.language?.startsWith(l.code)) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (code: LanguageCode) => {
    void i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        aria-label={t('language.choose')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('language.label')}
      >
        <Globe className="h-4 w-4" />
        {!compact && <span className="text-xs font-medium">{current.native}</span>}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-foreground/10 bg-canvas/95 py-1 shadow-lg backdrop-blur-xl"
        >
          {SUPPORTED_LANGUAGES.map((l) => {
            const active = l.code === current.code;
            return (
              <button
                key={l.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(l.code)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <span>{l.native}</span>
                {active && <Check className="h-3.5 w-3.5 text-teal-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
