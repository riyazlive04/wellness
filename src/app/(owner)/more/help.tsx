/**
 * Help & guides — the NUSI user guides, the same PDFs the web Help & guides
 * page lists. The guide index and files live on the web app
 * (`/guides/index.json`), so a new or updated guide shows up here without an
 * app update.
 */
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Pressable, RefreshControl, Share, StyleSheet, View } from 'react-native';

import { Loading, OwnerPage, RouteGate, Section } from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { resolveApiBase } from '@/lib/api';
import { radius, spacing } from '@/lib/theme';

interface GuideFile {
  no: number;
  slug: string;
  section: string;
  color: string;
  title: string;
  tagline: string;
  file: string;
  thumb: string;
  pages: number;
}

interface GuideIndex {
  complete: { file: string; thumb: string; parts: number; pages: number; kb: number };
  guides: GuideFile[];
}

const GREEN = ['#1a5c2d', '#2f8f46', '#6db33f'] as const;

async function fetchGuides(): Promise<{ base: string; index: GuideIndex }> {
  const base = `${(await resolveApiBase()).replace(/\/+$/, '')}/guides`;
  const res = await fetch(`${base}/index.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error("The guides couldn't be loaded. Please try again.");
  return { base, index: (await res.json()) as GuideIndex };
}

/**
 * Android's in-app browser can't show a PDF (it just downloads it), so there
 * the guide goes to the system, which opens it in a PDF viewer.
 */
function openPdf(url: string) {
  if (Platform.OS === 'android') void Linking.openURL(url);
  else void WebBrowser.openBrowserAsync(url);
}

function sharePdf(url: string, title: string) {
  void Share.share(Platform.OS === 'ios' ? { url, title } : { message: `${title}\n${url}`, title });
}

export default function OwnerHelp() {
  return (
    <RouteGate permission="ai.use">
      <HelpInner />
    </RouteGate>
  );
}

function HelpInner() {
  const q = useQuery({ queryKey: ['help', 'guides'], queryFn: fetchGuides, staleTime: 60 * 60_000 });

  return (
    <OwnerPage
      title="Help & guides"
      subtitle="Step-by-step guides for every section"
      back
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? (
        <Loading label="Loading guides…" />
      ) : q.isError || !q.data ? (
        <QueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <CompleteGuideCard base={q.data.base} guide={q.data.index.complete} />
          <Section title="Guides by section">
            <View style={{ gap: spacing.md }}>
              {q.data.index.guides.map((g) => (
                <GuideRow key={g.slug} base={q.data!.base} guide={g} />
              ))}
            </View>
          </Section>
        </>
      )}
    </OwnerPage>
  );
}

function CompleteGuideCard({ base, guide }: { base: string; guide: GuideIndex['complete'] }) {
  const url = `${base}/${guide.file}`;
  const title = 'The complete NUSI user guide';
  return (
    <Pressable onPress={() => openPdf(url)} accessibilityRole="button" accessibilityLabel={`Open ${title}`}>
      <LinearGradient colors={GREEN} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={[styles.blob, { width: 180, height: 180, right: -60, top: -70 }]} />
        <View style={[styles.blob, { width: 120, height: 120, right: 70, bottom: -70 }]} />
        <View style={styles.coverStack}>
          <View style={[styles.coverBack, { transform: [{ rotate: '7deg' }, { translateX: 8 }] }]} />
          <View style={[styles.coverBack, { opacity: 0.5, transform: [{ rotate: '3deg' }, { translateX: 4 }] }]} />
          <Image source={{ uri: `${base}/${guide.thumb}` }} style={styles.cover} contentFit="cover" contentPosition="top" />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="label" style={styles.heroEyebrow}>
            NUSI OVERALL GUIDE
          </AppText>
          <AppText variant="heading" style={{ color: '#fff', fontSize: 19, lineHeight: 23 }}>
            {title}
          </AppText>
          <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.85)', lineHeight: 16 }}>
            All {guide.parts} guides in one book, with a contents page.
          </AppText>
          <View style={styles.heroChips}>
            <HeroChip label={`${guide.parts} parts`} />
            <HeroChip label={`${guide.pages} pages`} />
          </View>
          <View style={styles.heroActions}>
            <View style={styles.heroPrimary}>
              <Ionicons name="book-outline" size={14} color={GREEN[0]} />
              <AppText variant="label" style={{ color: GREEN[0], fontSize: 12 }}>
                Open guide
              </AppText>
            </View>
            <Pressable
              onPress={() => sharePdf(url, title)}
              hitSlop={8}
              style={styles.heroSecondary}
              accessibilityLabel="Share the complete guide">
              <Ionicons name="share-outline" size={14} color="#fff" />
              <AppText variant="label" style={{ color: '#fff', fontSize: 12 }}>
                Share
              </AppText>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function HeroChip({ label }: { label: string }) {
  return (
    <View style={styles.heroChip}>
      <AppText variant="label" style={{ color: '#fff' }}>
        {label}
      </AppText>
    </View>
  );
}

function GuideRow({ base, guide: g }: { base: string; guide: GuideFile }) {
  const t = useTheme();
  const url = `${base}/${g.file}`;
  return (
    <Pressable onPress={() => openPdf(url)} accessibilityRole="button" accessibilityLabel={`Open the ${g.title} guide`}>
      {({ pressed }) => (
        <Card style={[styles.row, pressed && { opacity: 0.85 }]}>
          <View style={[styles.thumbWrap, { backgroundColor: `${g.color}22` }]}>
            <Image source={{ uri: `${base}/${g.thumb}` }} style={styles.thumb} contentFit="cover" contentPosition="top" />
            <View style={styles.partBadge}>
              <AppText variant="label" style={{ color: '#fff', fontSize: 9 }}>
                {g.no}
              </AppText>
            </View>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={[styles.sectionPill, { backgroundColor: `${g.color}1f` }]}>
              <AppText variant="label" style={{ color: g.color, fontSize: 10 }}>
                {g.section}
              </AppText>
            </View>
            <AppText variant="body" style={{ fontWeight: '700' }} numberOfLines={2}>
              {g.title}
            </AppText>
            <AppText variant="caption" tone="muted" numberOfLines={2} style={{ lineHeight: 15 }}>
              {g.tagline}
            </AppText>
            <View style={styles.rowMeta}>
              <AppText variant="caption" tone="faint">
                PDF · {g.pages} page{g.pages === 1 ? '' : 's'}
              </AppText>
              <Pressable onPress={() => sharePdf(url, g.title)} hitSlop={10} accessibilityLabel={`Share the ${g.title} guide`}>
                <Ionicons name="share-outline" size={16} color={t.colors.textMuted} />
              </Pressable>
            </View>
          </View>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  coverStack: { width: 92, height: 130 },
  coverBack: { position: 'absolute', top: 0, left: 0, width: 92, height: 130, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.3)' },
  cover: { width: 92, height: 130, borderRadius: 6, backgroundColor: '#fff' },
  heroEyebrow: { color: 'rgba(255,255,255,0.85)', letterSpacing: 1.4 },
  heroChips: { flexDirection: 'row', gap: 6, marginTop: 2 },
  heroChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.16)' },
  heroActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  heroPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  heroSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  // Thumbnails are the top of page 1, about 8:7 (wider than tall).
  thumbWrap: { width: 100, height: 88, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', paddingTop: 12 },
  thumb: { width: 86, height: 76, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: '#fff' },
  partBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sectionPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
});
