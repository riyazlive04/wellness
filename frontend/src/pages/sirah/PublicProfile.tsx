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
 * Public nutritionist link-in-bio — split portrait.
 *
 * Half the page is the practitioner's face, because this page's only job is
 * persuading a stranger who arrived from an Instagram bio to book, and people
 * book a person rather than a logo. The previous version centred a logo and a
 * single button on an empty canvas and showed none of the headline, bio or
 * links it already stored.
 *
 * The photo panel degrades in three steps: the uploaded photo, else the
 * practice logo on a brand gradient, else the practice initial. A practice
 * that uploads nothing still gets a page that looks deliberate.
 *
 * On a phone the two halves stack, photo first, so the face is still what a
 * visitor sees before anything else.
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
    <div className="relative min-h-screen bg-[#0c0d0c] text-white lg:flex">
      <button
        type="button"
        onClick={() => void sharePage()}
        aria-label="Share profile"
        className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/25 text-white/85 backdrop-blur-md transition hover:bg-black/40 hover:text-white md:right-6 md:top-6"
      >
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      </button>

      {/* ── Portrait half ─────────────────────────────────────────────
          Fixed on desktop so the face stays put while the right side
          scrolls; a plain block on a phone, where it leads instead. */}
      <div className="relative h-[42vh] min-h-[280px] w-full overflow-hidden lg:h-screen lg:w-[44%] lg:flex-shrink-0">
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(165deg, ${primary}, ${primary}22 85%, #0c0d0c)` }}
        />
        {profile.photo_url ? (
          <img
            src={profile.photo_url}
            alt={profile.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : profile.logo_url ? (
          <div className="absolute inset-0 grid place-items-center">
            <img
              src={profile.logo_url}
              alt=""
              className="h-32 w-32 rounded-full object-cover shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-2 ring-white/20 md:h-40 md:w-40"
            />
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-serif text-[22vw] leading-none text-white/25 lg:text-[9rem]">
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
        {/* Fades the photo into the content half rather than cutting it. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#0c0d0c] lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:w-28 lg:bg-gradient-to-r" />
      </div>

      {/* ── Content half ─────────────────────────────────────────── */}
      <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-10 lg:min-h-screen lg:px-14 lg:py-16">
        <div
          className="pointer-events-none absolute -right-24 top-1/4 h-[45vh] w-[45vh] rounded-full blur-3xl"
          style={{ background: `${accent}1F` }}
        />

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-lg"
        >
          {profile.verified && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium"
              style={{ borderColor: `${primary}66`, color: primary }}
            >
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Verified practice
            </span>
          )}

          <h1 className="mt-4 font-serif text-[2.6rem] leading-[1.03] tracking-tight md:text-6xl">
            {profile.name}
          </h1>

          {subtitle && (
            <p className="mt-4 text-base leading-snug text-white/75 md:text-lg">{subtitle}</p>
          )}
          {profile.bio && (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/55">{profile.bio}</p>
          )}

          {profile.show_join_cta && profile.join_url && (
            <a
              href={profile.join_url}
              className="mt-8 inline-flex items-center justify-center rounded-full px-8 py-3.5 text-sm font-semibold text-[#0c0d0c] transition hover:brightness-110"
              style={{ background: primary, boxShadow: `0 10px 28px ${primary}55` }}
            >
              Join my practice
            </a>
          )}

          {social.length > 0 && (
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
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

          {rest.length > 0 && (
            <div className="mt-6 flex w-full flex-col gap-2.5">
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
            </div>
          )}

          <p className="mt-12 text-[10px] uppercase tracking-[0.2em] text-white/25">
            Powered by NUSI
          </p>
        </motion.div>
      </div>
    </div>
  );
}
