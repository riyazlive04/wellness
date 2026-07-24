import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BadgeCheck, Calendar, ExternalLink, Instagram, Link2, Loader2,
  ShoppingBag, Globe, MessageCircle,
} from 'lucide-react';

import { publicProfileApi, type ProfileLinkIcon } from '@/modules/workspace/api/publicProfile';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<ProfileLinkIcon, typeof Link2> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  website: Globe,
  calendar: Calendar,
  shop: ShoppingBag,
  custom: Link2,
};

/**
 * Public nutritionist link-in-bio at /p/:slug — no auth required.
 * Brand-first hero using the workspace palette; Join CTA + custom links.
 */
export default function PublicProfile() {
  const { slug = '' } = useParams<{ slug: string }>();

  const q = useQuery({
    queryKey: ['public-profile', slug],
    queryFn: () => publicProfileApi.bySlug(slug),
    enabled: !!slug,
    retry: 1,
  });

  const profile = q.data;
  const primary = profile?.brand_color || '#7DBE9D';
  const accent = profile?.brand_accent || '#8087FF';

  useEffect(() => {
    if (profile?.name) document.title = `${profile.name} · SIRAH LIFE`;
    return () => { document.title = 'SIRAH LIFE'; };
  }, [profile?.name]);

  if (q.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0f1412] text-white">
        <Loader2 className="h-8 w-8 animate-spin opacity-70" />
      </div>
    );
  }

  if (q.isError || !profile) {
    const msg = q.error instanceof ApiError && q.error.status === 404
      ? 'This public page is not available.'
      : (q.error instanceof Error ? q.error.message : 'Could not load this page.');
    return (
      <div className="grid min-h-screen place-items-center bg-[#0f1412] px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
          <p className="mt-2 max-w-sm text-sm text-white/65">{msg}</p>
          <Link to="/" className="mt-6 inline-block text-sm text-white/80 underline underline-offset-4 hover:text-white">
            Go to SIRAH LIFE
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{
        background: `radial-gradient(120% 80% at 50% -10%, ${primary}55 0%, transparent 55%), radial-gradient(90% 60% at 100% 100%, ${accent}40 0%, transparent 50%), #0c1110`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><circle cx=%221%22 cy=%221%22 r=%221%22 fill=%22rgba(255,255,255,0.04)%22/></svg>')]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-14">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center"
        >
          <div
            className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 shadow-lg"
            style={{ borderColor: `${primary}99`, background: `${primary}22` }}
          >
            {profile.logo_url ? (
              <img src={profile.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-semibold tracking-tight" style={{ color: primary }}>
                {profile.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>

          <h1 className="mt-5 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {profile.name}
            {profile.verified && (
              <BadgeCheck className="h-5 w-5 text-sky-300" aria-label="Verified" />
            )}
          </h1>

          {(profile.headline || profile.tagline) && (
            <p className="mt-2 text-sm text-white/75">{profile.headline || profile.tagline}</p>
          )}
          {profile.bio && (
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">{profile.bio}</p>
          )}
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-1 flex-col gap-3"
        >
          {profile.show_join_cta && profile.join_url && (
            <a
              href={profile.join_url}
              className="inline-flex w-full items-center justify-center rounded-full px-5 py-3.5 text-sm font-semibold text-[#0c1110] shadow-lg transition hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
            >
              Join my practice
            </a>
          )}

          {profile.links.map((link, i) => {
            const Icon = ICON_MAP[link.icon] ?? Link2;
            return (
              <motion.a
                key={link.id ?? `${link.label}-${i}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.04 }}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3.5 backdrop-blur-md transition',
                  'hover:border-white/25 hover:bg-white/[0.1]',
                )}
              >
                <span
                  className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl"
                  style={{ background: `${primary}33`, color: primary }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-left text-sm font-medium">{link.label}</span>
                <ExternalLink className="h-3.5 w-3.5 text-white/35 transition group-hover:text-white/70" />
              </motion.a>
            );
          })}
        </motion.div>

        <p className="mt-10 text-center text-[10px] uppercase tracking-[0.2em] text-white/35">
          Powered by SIRAH LIFE
        </p>
      </div>
    </div>
  );
}
