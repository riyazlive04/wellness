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

function resolveIcon(link: PublicProfileLink): ProfileLinkIcon {
  const url = (link.url || '').toLowerCase();
  if (link.icon === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (link.icon === 'instagram' || url.includes('instagram.com')) return 'instagram';
  if (link.icon === 'whatsapp' || url.includes('wa.me') || url.includes('whatsapp.com')) return 'whatsapp';
  return link.icon || 'custom';
}

function isSocial(icon: ProfileLinkIcon): boolean {
  return icon === 'whatsapp' || icon === 'instagram' || icon === 'youtube';
}

/** Official-ish brand fills for social icon chips */
const SOCIAL_BRAND: Record<'whatsapp' | 'instagram' | 'youtube', { bg: string; color: string }> = {
  youtube: { bg: '#FF0000', color: '#ffffff' },
  instagram: {
    bg: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 45%, #8134af 75%, #515bd4 100%)',
    color: '#ffffff',
  },
  whatsapp: { bg: '#25D366', color: '#ffffff' },
};

function splitLinks(links: PublicProfileLink[]) {
  const social: Array<PublicProfileLink & { resolvedIcon: ProfileLinkIcon }> = [];
  const rest: Array<PublicProfileLink & { resolvedIcon: ProfileLinkIcon }> = [];
  for (const link of links) {
    const resolvedIcon = resolveIcon(link);
    const item = { ...link, resolvedIcon };
    if (isSocial(resolvedIcon)) social.push(item);
    else rest.push(item);
  }
  return { social, rest };
}

/**
 * Public nutritionist link-in-bio — calm dark canvas, soft brand atmosphere,
 * left-aligned identity (SuperProfile-inspired without loud stripes).
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
  const primary = profile?.brand_color || '#3D8B74';
  const accent = profile?.brand_accent || '#D4A574';

  const { social, rest } = useMemo(
    () => splitLinks(profile?.links ?? []),
    [profile?.links],
  );

  useEffect(() => {
    if (profile?.name) document.title = `${profile.name} · NUSI`;
    return () => { document.title = 'NUSI'; };
  }, [profile?.name]);

  async function sharePage() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: profile?.name ?? 'NUSI', url });
        return;
      }
    } catch {
      /* clipboard fallback */
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copied');
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (q.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0e0f0e] text-white">
        <Loader2 className="h-8 w-8 animate-spin opacity-70" />
      </div>
    );
  }

  if (q.isError || !profile) {
    const msg = q.error instanceof ApiError && q.error.status === 404
      ? 'This public page is not available.'
      : (q.error instanceof Error ? q.error.message : 'Could not load this page.');
    return (
      <div className="grid min-h-screen place-items-center bg-[#0e0f0e] px-6 text-center text-white">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Page not found</h1>
          <p className="mt-2 max-w-sm text-sm text-white/65">{msg}</p>
          <Link to="/" className="mt-6 inline-block text-sm text-white/80 underline underline-offset-4 hover:text-white">
            Go to NUSI
          </Link>
        </div>
      </div>
    );
  }

  const subtitle = profile.headline || profile.tagline;

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      {/* Quiet dark base + soft brand washes (no loud stripes) */}
      <div className="absolute inset-0 bg-[#0c0d0c]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -28deg,
            transparent 0,
            transparent 56px,
            ${primary} 56px,
            ${primary} 57px
          )`,
        }}
      />
      <div
        className="pointer-events-none absolute -left-24 top-0 h-[70vh] w-[70vw] rounded-full blur-3xl"
        style={{ background: `${primary}33` }}
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-[55vh] w-[55vw] rounded-full blur-3xl"
        style={{ background: `${accent}28` }}
      />

      <button
        type="button"
        onClick={() => void sharePage()}
        aria-label="Share profile"
        className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 backdrop-blur-md transition hover:bg-white/[0.12] hover:text-white md:right-7 md:top-7"
      >
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      </button>

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16 sm:max-w-lg sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-start"
        >
          <div className="h-24 w-24 overflow-hidden rounded-full bg-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-2 ring-white/15 md:h-28 md:w-28">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className="grid h-full w-full place-items-center font-serif text-3xl"
                style={{ background: `${primary}44`, color: '#fff' }}
              >
                {profile.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <h1 className="mt-6 flex items-center gap-2 font-serif text-[2.35rem] leading-[1.05] tracking-tight md:text-5xl">
            {profile.name}
            {profile.verified && (
              <BadgeCheck className="h-6 w-6 shrink-0 text-sky-300" aria-label="Verified" />
            )}
          </h1>

          {subtitle && (
            <p className="mt-3 max-w-sm text-[15px] leading-snug text-white/72">{subtitle}</p>
          )}
          {profile.bio && (
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">{profile.bio}</p>
          )}

          {social.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {social.map((link) => {
                const Icon = ICON_MAP[link.resolvedIcon] ?? Link2;
                const brand = isSocial(link.resolvedIcon)
                  ? SOCIAL_BRAND[link.resolvedIcon as 'whatsapp' | 'instagram' | 'youtube']
                  : null;
                return (
                  <a
                    key={link.id ?? link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                    title={link.label}
                    className="grid h-10 w-10 place-items-center rounded-full shadow-md transition hover:scale-105 hover:brightness-110"
                    style={
                      brand
                        ? { background: brand.bg, color: brand.color }
                        : { background: 'rgba(255,255,255,0.08)', color: '#fff' }
                    }
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-9 flex w-full flex-col gap-2.5"
        >
          {profile.show_join_cta && profile.join_url && (
            <a
              href={profile.join_url}
              className="inline-flex w-full items-center justify-center rounded-full px-5 py-3.5 text-sm font-semibold text-[#0c0d0c] transition hover:brightness-110"
              style={{
                background: primary,
                boxShadow: `0 10px 28px ${primary}55`,
              }}
            >
              Join my practice
            </a>
          )}

          {rest.map((link, i) => {
            const Icon = ICON_MAP[link.resolvedIcon] ?? Link2;
            return (
              <motion.a
                key={link.id ?? `${link.label}-${i}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.04 }}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3.5 ring-1 ring-white/10 transition',
                  'hover:bg-white/[0.1] hover:ring-white/20',
                )}
              >
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white/10 text-white/90">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-left text-sm font-medium text-white/90">{link.label}</span>
                <ExternalLink className="h-3.5 w-3.5 text-white/30 transition group-hover:text-white/60" />
              </motion.a>
            );
          })}
        </motion.div>

        <p className="mt-12 text-[10px] uppercase tracking-[0.2em] text-white/25">
          Powered by NUSI
        </p>
      </div>
    </div>
  );
}
