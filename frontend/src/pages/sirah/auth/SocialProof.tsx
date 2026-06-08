import { Quote } from 'lucide-react';

import { Glass } from '@/design-system';

/**
 * Social-proof block on the auth page's left column.
 *
 * Two layers, low-key to high-key:
 *   1. AvatarStrip — five overlapping practitioner portraits +
 *      "Join 1,200+ wellness practitioners". Single-line, scannable.
 *   2. TestimonialCard — one real-feeling quote with a portrait,
 *      name, and role. Adds humanity without becoming a wall of text.
 *
 * Photos are from Unsplash, cropped to faces at 80px (strip) / 160px
 * (card). Swap the photo IDs / quote text any time without touching
 * layout — the component is data-driven via the consts below.
 */

const UNSPLASH = (id: string, size: number) =>
  `https://images.unsplash.com/${id}?w=${size * 2}&h=${size * 2}&fit=crop&crop=faces&auto=format&q=80`;

// Five diverse practitioner portraits. Kept stable; if any 404s upstream
// it just renders the alt text — no layout shift.
const AVATARS = [
  'photo-1559839734-2b71ea197ec2', // man, smiling
  'photo-1573497019940-1c28c88b4f3e', // woman, professional
  'photo-1607746882042-944635dfe10e', // woman, glasses
  'photo-1560250097-0b93528c311a',  // man, professional
  'photo-1438761681033-6461ffad8d80', // woman, warm
];

const FEATURED = {
  name: 'Dr. Priya M.',
  role: 'Nutritionist · Chennai',
  quote:
    'My clients log meals consistently for the first time. Voice and Plate Vision changed everything.',
  photoId: 'photo-1573497019940-1c28c88b4f3e',
};

export function SocialProof() {
  return (
    <div className="max-w-[340px] space-y-5">
      <AvatarStrip />
      <TestimonialCard />
    </div>
  );
}

function AvatarStrip() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {AVATARS.map((id, i) => (
          <img
            key={id}
            src={UNSPLASH(id, 28)}
            alt=""
            loading="lazy"
            aria-hidden
            // border-canvas creates the gap-illusion between overlapping circles.
            // ring is a hairline so the avatar reads as raised, not flat.
            className="h-7 w-7 rounded-full border-2 border-canvas object-cover ring-1 ring-foreground/[0.06]"
            style={{ zIndex: AVATARS.length - i }}
          />
        ))}
      </div>
      <span className="text-xs text-foreground/65">
        Join <strong className="font-semibold text-foreground">1,247</strong> wellness practitioners
      </span>
    </div>
  );
}

function TestimonialCard() {
  return (
    <Glass className="relative overflow-hidden p-5">
      {/* Decorative quote glyph behind the content. Hairline-thin so it
          reads as embossed paper rather than a sticker. */}
      <Quote
        aria-hidden
        className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 -rotate-12 text-foreground/[0.05]"
        strokeWidth={1}
      />

      <div className="relative flex items-start gap-3">
        <img
          src={UNSPLASH(FEATURED.photoId, 48)}
          alt={`${FEATURED.name} portrait`}
          loading="lazy"
          className="h-12 w-12 flex-shrink-0 rounded-full border border-foreground/10 object-cover shadow-sm"
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-foreground">
            {FEATURED.name}
          </div>
          <div className="text-[11px] text-foreground/60">{FEATURED.role}</div>
          <p className="mt-2 text-[13px] leading-relaxed text-foreground/80">
            “{FEATURED.quote}”
          </p>
        </div>
      </div>
    </Glass>
  );
}