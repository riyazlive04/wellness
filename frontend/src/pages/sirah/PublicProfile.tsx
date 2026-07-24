import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BadgeCheck, Calendar, Check, ExternalLink, Instagram, Link2, Loader2,
  MessageCircle, Share2, ShoppingBag, Globe, Youtube,
} from 'lucide-react';
import { toast } from 'sonner';

import { publicProfileApi, type ProfileLinkIcon, type PublicProfileLink } from '@/modules/workspace/api/publicProfile';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<ProfileLinkIcon, typeof Link2> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  youtube: Youtube,
  website: Globe,
  calendar: Calendar,
  shop: ShoppingBag,
  custom: Link2,
};

const SOCIAL_ICONS = new Set<ProfileLinkIcon>(['whatsapp', 'instagram', 'youtube']);

function splitLinks(links: PublicProfileLink[]) {
  const social: PublicProfileLink[] = [];
  const rest: PublicProfileLink[] = [];
  for (const link of links) {
    if (SOCIAL_ICONS.has(link.icon)) social.push(link);
    else rest.push(link);
  }
  return { social, rest };
}

/**
 * Public nutritionist link-in-bio at /p/:slug — SuperProfile-inspired layout:
 * diagonal brand bands, left-aligned identity, social icon row, share, Join CTA.
 */
export default function PublicProfile() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [copied, setCopied] = useState(false);

  const q = useQuery({
    queryKey: ['public-profile', slug],
    queryFn: () => publicProfileApi.bySlug(slug),
    enabled: !!slug,
    retry: 1,
  });

  const profile = q.data;
  const primary = profile?.brand_color || '#2F6F5E';
  const accent = profile?.brand_accent || '#C45C26';

  const { social, rest } = useMemo(
    () => splitLinks(profile?.links ?? []),
    [profile?.links],
  );

  useEffect(() => {
    if (profile?.name) document.title = `${profile.name} · SIRAH LIFE`;
    return () => { document.title = 'SIRAH LIFE'; };
  }, [profile?.name]);

  async function sharePage() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: profile?.name ?? 'SIRAH LIFE', url });
        return;
      }
    } catch {
      /* fall through to clipboard */
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copied');
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (q.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#111] text-white">
        <Loader2 className="h-8 w-8 animate-spin opacity-70" />
      </div>
    );
  }

  if (q.isError || !profile) {
    const msg = q.error instanceof ApiError && q.error.status === 404
      ? 'This public page is not available.'
      : (q.error instanceof Error ? q.error.message : 'Could not load this page.');
    return (
      <div className="grid min-h-screen place-items-center bg-[#111] px-6 text-center text-white">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Page not found</h1>
          <p className="mt-2 max-w-sm text-sm text-white/65">{msg}</p>
          <Link to="/" className="mt-6 inline-block text-sm text-white/80 underline underline-offset-4 hover:text-white">
            Go to SIRAH LIFE
          </Link>
        </div>
      </div>
    );
  }

  const subtitle = profile.headline || profile.tagline;

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      {/* SuperProfile-style diagonal bands, tinted with workspace brand */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            repeating-linear-gradient(
              -32deg,
              #0a0a0a 0px,
              #0a0a0a 48px,
              ${primary}22 48px,
              ${primary}22 96px,
              #121212 96px,
              #121212 144px,
              ${accent}28 144px,
              ${accent}28 192px
            )
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(90% 70% at 15% 10%, ${primary}40 0%, transparent 55%), radial-gradient(70% 50% at 90% 90%, ${accent}35 0%, transparent 50%)`,
        }}
      />

      <button
        type="button"
        onClick={() => void sharePage()}
        aria-label="Share profile"
        className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white/85 backdrop-blur-md transition hover:bg-black/50 hover:text-white md:right-8 md:top-8"
      >
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      </button>

      <div className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-start text-left"
        >
          <div
            className="grid h-28 w-28 place-items-center overflow-hidden rounded-full border-[3px] shadow-2xl md:h-32 md:w-32"
            style={{ borderColor: 'rgba(255,255,255,0.2)', background: `${primary}33` }}
          >
            {profile.logo_url ? (
              <img src={profile.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="font-serif text-4xl tracking-tight" style={{ color: primary }}>
                {profile.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>

          <h1 className="mt-6 flex items-center gap-2 font-serif text-4xl leading-none tracking-tight md:text-5xl">
            {profile.name}
            {profile.verified && (
              <BadgeCheck className="h-6 w-6 text-sky-300" aria-label="Verified" />
            )}
          </h1>

          {subtitle && (
            <p className="mt-3 max-w-md text-base text-white/75 md:text-lg">{subtitle}</p>
          )}
          {profile.bio && (
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/55">{profile.bio}</p>
          )}

          {social.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {social.map((link) => {
                const Icon = ICON_MAP[link.icon] ?? Link2;
                return (
                  <a
                    key={link.id ?? link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                    title={link.label}
                    className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:scale-105 hover:bg-white/20"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex w-full flex-col gap-3"
        >
          {profile.show_join_cta && profile.join_url && (
            <a
              href={profile.join_url}
              className="inline-flex w-full items-center justify-center rounded-2xl px-5 py-4 text-sm font-semibold tracking-wide text-[#0c1110] shadow-xl transition hover:brightness-110"
              style={{ background: `linear-gradient(90deg, ${primary}, ${accent})` }}
            >
              Join my practice
            </a>
          )}

          {rest.map((link, i) => {
            const Icon = ICON_MAP[link.icon] ?? Link2;
            return (
              <motion.a
                key={link.id ?? `${link.label}-${i}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 + i * 0.04 }}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-2xl border border-white/12 bg-black/35 px-4 py-3.5 backdrop-blur-md transition',
                  'hover:border-white/25 hover:bg-black/50',
                )}
              >
                <span
                  className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full"
                  style={{ background: `${primary}40`, color: '#fff' }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-left text-sm font-medium tracking-wide">{link.label}</span>
                <ExternalLink className="h-3.5 w-3.5 text-white/35 transition group-hover:text-white/70" />
              </motion.a>
            );
          })}
        </motion.div>

        <p className="mt-12 text-left text-[10px] uppercase tracking-[0.22em] text-white/30">
          Powered by SIRAH LIFE
        </p>
      </div>
    </div>
  );
}
