import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, Copy, ExternalLink, Loader2, Plus, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import {
  publicProfileApi,
  type ProfileLinkIcon,
  type PublicProfileLink,
} from '@/modules/workspace/api/publicProfile';
import { cn } from '@/lib/utils';

const ICON_OPTIONS: { value: ProfileLinkIcon; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'website', label: 'Website' },
  { value: 'calendar', label: 'Book / Calendar' },
  { value: 'shop', label: 'Shop' },
];

type DraftLink = {
  key: string;
  label: string;
  url: string;
  icon: ProfileLinkIcon;
  enabled: boolean;
};

function toDraft(links: PublicProfileLink[]): DraftLink[] {
  return links.map((l, i) => ({
    key: l.id ?? `new-${i}-${l.label}`,
    label: l.label,
    url: l.url,
    icon: (l.icon as ProfileLinkIcon) || 'custom',
    enabled: l.enabled !== false,
  }));
}

export function PublicProfileSection() {
  const queryClient = useQueryClient();
  const { data: ws } = useQuery({
    queryKey: ['workspace', 'me'],
    queryFn: () => workspacesApi.me(),
    staleTime: 5 * 60 * 1000,
  });
  const profileQ = useQuery({
    queryKey: ['workspace', 'public-profile'],
    queryFn: () => publicProfileApi.getMine(),
  });

  const [slug, setSlug] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [showJoin, setShowJoin] = useState(true);
  const [links, setLinks] = useState<DraftLink[]>([]);
  const seeded = useRef(false);

  useEffect(() => {
    if (!profileQ.data || seeded.current) return;
    seeded.current = true;
    setEnabled(profileQ.data.enabled);
    setHeadline(profileQ.data.headline ?? '');
    setBio(profileQ.data.bio ?? '');
    setShowJoin(profileQ.data.show_join_cta);
    setLinks(toDraft(profileQ.data.links));
    setSlug(profileQ.data.slug ?? ws?.slug ?? '');
  }, [profileQ.data, ws?.slug]);

  useEffect(() => {
    if (!seeded.current && ws?.slug) setSlug(ws.slug);
  }, [ws?.slug]);

  const saveSlug = useMutation({
    mutationFn: () => workspacesApi.update({ slug: slug.trim().toLowerCase() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', 'public-profile'] });
      toast.success('Slug saved');
      seeded.current = false;
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save slug'),
  });

  const saveProfile = useMutation({
    mutationFn: async () => {
      await publicProfileApi.patchMine({
        enabled,
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        show_join_cta: showJoin,
      });
      await publicProfileApi.replaceLinks(
        links.map((l) => ({
          label: l.label.trim(),
          url: l.url.trim(),
          icon: l.icon,
          enabled: l.enabled,
        })),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', 'public-profile'] });
      toast.success('Public page saved');
      seeded.current = false;
    },
    onError: (err: Error) => {
      const msg = err instanceof ApiError ? err.message : err.message;
      toast.error(msg ?? 'Could not save public page');
    },
  });

  const publicUrl =
    profileQ.data?.public_url ??
    (slug ? `${window.location.origin}/${encodeURIComponent(slug.trim().toLowerCase())}` : null);

  function moveLink(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= links.length) return;
    setLinks((prev) => {
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  }

  if (profileQ.isLoading) {
    return (
      <Glass className="flex items-center justify-center p-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/50" />
      </Glass>
    );
  }

  return (
    <div className="space-y-5">
      <Glass className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold">Public page</h2>
          <p className="mt-1 text-xs text-foreground/60">
            Your public link-in-bio at <code className="text-foreground/80">yoursite.com/your-slug</code>.
            Share it on Instagram, WhatsApp, or your business card.
          </p>
        </div>

        <Field label="Public URL slug">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 items-center gap-1 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 text-sm">
              <span className="shrink-0 text-foreground/45">/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="your-practice"
                className="w-full bg-transparent py-2.5 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => saveSlug.mutate()}
              disabled={!slug.trim() || saveSlug.isPending}
              className="rounded-full border border-foreground/10 px-4 py-2 text-xs font-medium hover:bg-foreground/[0.04] disabled:opacity-50"
            >
              {saveSlug.isPending ? 'Saving…' : 'Save slug'}
            </button>
          </div>
        </Field>

        {publicUrl && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-foreground/[0.03] px-3 py-2.5 text-xs">
            <span className="truncate text-foreground/70">{publicUrl}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2.5 py-1 hover:bg-foreground/[0.05]"
              onClick={async () => {
                await navigator.clipboard.writeText(publicUrl);
                toast.success('Link copied');
              }}
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2.5 py-1 hover:bg-foreground/[0.05]"
            >
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          </div>
        )}

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium">Publish page</span>
            <span className="mt-0.5 block text-xs text-foreground/55">Off = visitors see “not found”.</span>
          </span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium">Show “Join my practice”</span>
            <span className="mt-0.5 block text-xs text-foreground/55">Uses your workspace join link.</span>
          </span>
          <input type="checkbox" checked={showJoin} onChange={(e) => setShowJoin(e.target.checked)} className="h-4 w-4" />
        </label>

        <Field label="Headline (optional)">
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={120}
            placeholder="Clinical nutrition · Weight loss · PCOS"
            className="w-full rounded-xl border border-foreground/10 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-foreground/25"
          />
        </Field>

        <Field label="Bio (optional)">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="A short intro for prospects landing from your Instagram bio."
            className="w-full rounded-xl border border-foreground/10 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-foreground/25"
          />
        </Field>
      </Glass>

      <Glass className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Links</h3>
            <p className="mt-0.5 text-xs text-foreground/55">WhatsApp, Instagram, booking, shop — anything with a URL.</p>
          </div>
          <button
            type="button"
            onClick={() =>
              setLinks((prev) => [
                ...prev,
                { key: `new-${Date.now()}`, label: '', url: 'https://', icon: 'custom', enabled: true },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.04]"
          >
            <Plus className="h-3.5 w-3.5" /> Add link
          </button>
        </div>

        <div className="space-y-3">
          {links.length === 0 && (
            <p className="text-xs text-foreground/50">No links yet. Add WhatsApp, a booking page, or your website.</p>
          )}
          {links.map((link, index) => (
            <div key={link.key} className="rounded-xl border border-foreground/10 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={link.label}
                  onChange={(e) =>
                    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, label: e.target.value } : l)))
                  }
                  placeholder="Label"
                  className="rounded-lg border border-foreground/10 bg-transparent px-2.5 py-2 text-sm outline-none"
                />
                <select
                  value={link.icon}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((l, i) => (i === index ? { ...l, icon: e.target.value as ProfileLinkIcon } : l)),
                    )
                  }
                  className="rounded-lg border border-foreground/10 bg-transparent px-2.5 py-2 text-sm outline-none"
                >
                  {ICON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <input
                value={link.url}
                onChange={(e) =>
                  setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, url: e.target.value } : l)))
                }
                placeholder="https://"
                className="mt-2 w-full rounded-lg border border-foreground/10 bg-transparent px-2.5 py-2 text-sm outline-none"
              />
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-foreground/65">
                  <input
                    type="checkbox"
                    checked={link.enabled}
                    onChange={(e) =>
                      setLinks((prev) =>
                        prev.map((l, i) => (i === index ? { ...l, enabled: e.target.checked } : l)),
                      )
                    }
                  />
                  Visible
                </label>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveLink(index, -1)} className={cn('rounded-full p-1.5 hover:bg-foreground/[0.06]', index === 0 && 'opacity-30')} aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => moveLink(index, 1)} className={cn('rounded-full p-1.5 hover:bg-foreground/[0.06]', index === links.length - 1 && 'opacity-30')} aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                    className="rounded-full p-1.5 text-rose-600 hover:bg-rose-500/10"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Glass>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => saveProfile.mutate()}
          disabled={saveProfile.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-teal-600 to-teal-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saveProfile.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save public page
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-foreground/70">{label}</span>
      {children}
    </label>
  );
}
