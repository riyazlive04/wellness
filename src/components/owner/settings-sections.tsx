/**
 * Settings sections ported from the web: AI, Video calls and the practice's
 * own WhatsApp number (Integrations). Same endpoints, same wording, laid out
 * for a phone.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ActionButton, Field, Loading, Pill } from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import {
  aiKeyApi,
  aiSource,
  clientAssistantApi,
  videoKeyApi,
  whatsappApi,
  type AiKeyView,
  type AiProvider,
  type VideoKeyView,
} from '@/lib/owner/api/practice-settings';
import { tenancyApi } from '@/lib/owner/api/tenancy';
import { radius, spacing } from '@/lib/theme';

// ─────────────────────────────────────────────────────────────── shared ────

function nextMonthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function Meter({ pct, used }: { pct: number; used: number }) {
  const t = useTheme();
  const color = pct >= 100 ? t.colors.danger : pct >= 80 ? t.colors.warning : t.colors.primary;
  return (
    <View style={[styles.track, { backgroundColor: t.colors.surfaceStrong }]}>
      <View style={{ width: `${Math.max(pct, used > 0 ? 3 : 0)}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

function Steps({ steps }: { steps: string[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {steps.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={[styles.stepNo, { backgroundColor: `${t.colors.primary}22` }]}>
            <AppText variant="label" style={{ color: t.colors.primary, fontSize: 10 }}>
              {i + 1}
            </AppText>
          </View>
          <AppText variant="muted" tone="muted" style={{ flex: 1 }}>
            {s}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function StatusLine({ icon, tone, title, body }: { icon: keyof typeof Ionicons.glyphMap; tone: 'success' | 'warning' | 'danger' | 'accent'; title: string; body?: string | null }) {
  const t = useTheme();
  const color = { success: t.colors.success, warning: t.colors.warning, danger: t.colors.danger, accent: t.colors.primary }[tone];
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={[styles.statusIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" style={{ fontWeight: '600' }}>
          {title}
        </AppText>
        {body ? (
          <AppText variant="muted" tone="muted">
            {body}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** A secret input with a show / hide toggle. */
function KeyField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View>
      <Field
        label="API key"
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={400}
        style={{ paddingRight: 44 }}
      />
      <Pressable onPress={() => setShow((s) => !s)} hitSlop={10} style={styles.eye} accessibilityLabel={show ? 'Hide key' : 'Show key'}>
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={t.colors.textMuted} />
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────── AI ────

const PROVIDERS: Record<AiProvider, { name: string; blurb: string; url: string; urlLabel: string; placeholder: string; steps: string[] }> = {
  gemini: {
    name: 'Google Gemini',
    blurb: 'Free tier available. Get a key from Google AI Studio.',
    url: 'https://aistudio.google.com/app/apikey',
    urlLabel: 'Open Google AI Studio',
    placeholder: 'AIza…',
    steps: [
      'Open Google AI Studio and sign in with your Google account.',
      'Tap "Create API key". If Google asks, pick a project or let it create one.',
      'Copy the key. It starts with "AIza".',
      'Paste it below and tap "Save & test key".',
    ],
  },
  openai: {
    name: 'OpenAI',
    blurb: 'Pay-as-you-go. Get a key from the OpenAI dashboard.',
    url: 'https://platform.openai.com/api-keys',
    urlLabel: 'Open the OpenAI dashboard',
    placeholder: 'sk-…',
    steps: [
      'Open the OpenAI dashboard and sign in (or create an account).',
      "Add a payment method and some credit under Settings → Billing. OpenAI keys don't work without credit.",
      'Go to API keys, create a new secret key named "NUSI" and copy it. It starts with "sk-".',
      'Paste it below and tap "Save & test key".',
    ],
  },
};

const DAILY_LIMITS = [5, 10, 20, 50];

export function AiSection() {
  const qc = useQueryClient();
  const router = useRouter();
  const { isOwner } = useOwner();
  const keyQ = useQuery({ queryKey: ['workspace', 'ai-key'], queryFn: aiKeyApi.get, staleTime: 0 });
  const view = keyQ.data;
  const source = aiSource(view);
  const hasKey = !!view && view.status !== 'missing';

  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [key, setKey] = useState('');
  const setView = (v: AiKeyView) => qc.setQueryData(['workspace', 'ai-key'], v);

  const save = useMutation({
    mutationFn: () => aiKeyApi.save(provider, key.trim()),
    onSuccess: (v) => {
      setView(v);
      setKey('');
      setEditing(false);
      Alert.alert('Key connected', `Your practice's AI now runs on your ${PROVIDERS[provider].name} key.`);
    },
    onError: (e: Error) => Alert.alert('Could not save the key', e.message),
  });
  const retest = useMutation({
    mutationFn: aiKeyApi.test,
    onSuccess: (v) => {
      setView(v);
      Alert.alert(v.status === 'connected' ? 'Key is working' : 'Key not working', v.status === 'connected' ? undefined : v.last_error ?? undefined);
    },
    onError: (e: Error) => Alert.alert('Could not test the key', e.message),
  });
  const remove = useMutation({
    mutationFn: aiKeyApi.remove,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace', 'ai-key'] }),
    onError: (e: Error) => Alert.alert('Could not remove the key', e.message),
  });

  const startEdit = () => {
    setProvider(view?.provider ?? 'gemini');
    setKey('');
    setEditing(true);
  };
  const confirmRemove = () =>
    Alert.alert(
      'Remove your AI key?',
      view?.included
        ? "Your practice's AI goes back to NUSI's AI from your plan."
        : 'AI features stop until you choose a plan or add a key.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() },
      ],
    );

  if (keyQ.isLoading) return <Loading />;
  if (keyQ.isError) return <QueryError error={keyQ.error} onRetry={() => void keyQ.refetch()} />;

  const showForm = isOwner && (source === 'none' || editing);
  const ok = view?.status === 'connected';
  const p = PROVIDERS[provider];

  return (
    <>
      <AppText variant="muted" tone="muted">
        AI comes with your NUSI plan: Plate Vision, voice notes, AI meal plans and your clients&apos; AI assistant. Each AI action uses one credit.
      </AppText>

      <Card style={{ gap: spacing.md }}>
        {source === 'nusi' ? (
          <StatusLine icon="sparkles" tone="success" title="AI is on, included in your plan" body="Nothing to set up." />
        ) : source === 'none' ? (
          <StatusLine
            icon="alert-circle"
            tone="warning"
            title="AI is off for your practice"
            body={isOwner ? 'Choose a plan in Billing, or connect your own Google Gemini or OpenAI key below.' : 'Ask your practice owner to choose a plan or add an AI key.'}
          />
        ) : (
          <StatusLine
            icon={ok ? 'checkmark-circle' : 'alert-circle'}
            tone={ok ? 'success' : 'danger'}
            title={`Your ${view?.provider ? PROVIDERS[view.provider].name : 'AI'} key ${ok ? 'is connected' : "isn't working"}`}
            body={[view?.last4 ? `••••${view.last4}` : null, !ok ? view?.last_error : null].filter(Boolean).join(' · ') || null}
          />
        )}
        {isOwner && !editing ? (
          source === 'nusi' ? (
            <ActionButton label="Use my own key" icon="key-outline" tone="neutral" onPress={startEdit} />
          ) : hasKey ? (
            <View style={styles.buttonRow}>
              <View style={{ flex: 1 }}>
                <ActionButton label="Test" icon="refresh" tone="neutral" loading={retest.isPending} onPress={() => retest.mutate()} />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton label="Change" icon="key-outline" tone="neutral" onPress={startEdit} />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton label="Remove" icon="trash-outline" tone="danger" loading={remove.isPending} onPress={confirmRemove} />
              </View>
            </View>
          ) : null
        ) : null}
      </Card>

      {showForm ? (
        <Card style={{ gap: spacing.md }}>
          <AppText variant="heading">{hasKey ? 'Replace your AI key' : 'Connect your own AI key'}</AppText>
          {!hasKey && view?.included ? (
            <AppText variant="muted" tone="muted">
              Optional. AI then runs on your own Google or OpenAI account. Your plan&apos;s credits still apply.
            </AppText>
          ) : null}
          <View style={styles.buttonRow}>
            {(Object.keys(PROVIDERS) as AiProvider[]).map((k) => (
              <ProviderChoice key={k} active={provider === k} name={PROVIDERS[k].name} blurb={PROVIDERS[k].blurb} onPress={() => setProvider(k)} />
            ))}
          </View>
          <Steps steps={p.steps} />
          <ActionButton label={p.urlLabel} icon="open-outline" tone="neutral" onPress={() => void WebBrowser.openBrowserAsync(p.url)} />
          <KeyField value={key} onChange={setKey} placeholder={p.placeholder} />
          <ActionButton
            label={save.isPending ? 'Checking key…' : 'Save & test key'}
            icon="key-outline"
            loading={save.isPending}
            disabled={key.trim().length < 20}
            onPress={() => save.mutate()}
          />
          {hasKey || source === 'nusi' ? (
            <ActionButton label="Cancel" tone="neutral" onPress={() => setEditing(false)} />
          ) : null}
        </Card>
      ) : null}

      <AiCredits isOwner={isOwner} onBilling={() => router.push('/(owner)/more/billing')} />
      <ClientAssistantCard isOwner={isOwner} />
    </>
  );
}

function ProviderChoice({ active, name, blurb, onPress }: { active: boolean; name: string; blurb: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, { borderColor: active ? t.colors.primary : t.colors.border, backgroundColor: active ? `${t.colors.primary}12` : 'transparent' }]}>
      <AppText variant="body" style={{ fontWeight: '600' }}>
        {name}
      </AppText>
      <AppText variant="caption" tone="muted">
        {blurb}
      </AppText>
    </Pressable>
  );
}

function AiCredits({ isOwner, onBilling }: { isOwner: boolean; onBilling: () => void }) {
  const q = useQuery({ queryKey: ['tenancy', 'limits'], queryFn: tenancyApi.getLimits, staleTime: 60_000 });
  if (!q.data) return null;
  const used = q.data.usage.aiCallsThisMonth;
  const limit = q.data.limits.aiCallsPerMonth;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const fmt = (n: number) => n.toLocaleString('en-IN');
  return (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="heading">AI credits this month</AppText>
      <AppText variant="muted" tone="muted">
        {limit == null ? `${fmt(used)} used. Your plan has no monthly limit.` : `${fmt(used)} of ${fmt(limit)} used. Resets on ${nextMonthStart()}.`}
      </AppText>
      {limit != null ? <Meter pct={pct} used={used} /> : null}
      {limit != null && pct >= 100 ? (
        <AppText variant="caption" tone="danger">
          This month&apos;s AI credits are used up. AI is paused until {nextMonthStart()}
          {isOwner ? ' or until you add more credits.' : '.'}
        </AppText>
      ) : null}
      {isOwner && limit != null ? (
        <ActionButton label={pct >= 75 ? 'Get more credits' : 'Plans & credits'} tone="neutral" onPress={onBilling} />
      ) : null}
    </Card>
  );
}

function ClientAssistantCard({ isOwner }: { isOwner: boolean }) {
  const t = useTheme();
  const qc = useQueryClient();
  const { hasFeature } = useOwner();
  const onPlan = hasFeature('ai_assistant');
  const q = useQuery({ queryKey: ['workspace', 'client-assistant'], queryFn: clientAssistantApi.get, enabled: onPlan });
  const save = useMutation({
    mutationFn: clientAssistantApi.update,
    onSuccess: (s) => qc.setQueryData(['workspace', 'client-assistant'], s),
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });
  if (!onPlan || !q.data) return null;
  const s = q.data;
  const enabled = save.isPending && save.variables?.enabled !== undefined ? !!save.variables.enabled : s.enabled;

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">Client AI assistant</AppText>
          <AppText variant="muted" tone="muted">
            Let clients ask an AI assistant about their own plan and progress in their app. Every question uses one AI credit.
          </AppText>
        </View>
        <Switch
          value={enabled}
          disabled={!isOwner || save.isPending}
          onValueChange={(v) => save.mutate({ enabled: v })}
          trackColor={{ true: t.colors.primary, false: t.colors.surfaceStrong }}
        />
      </View>
      {enabled ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption" tone="muted">
            Questions per client per day
          </AppText>
          <View style={styles.buttonRow}>
            {DAILY_LIMITS.map((n) => {
              const on = s.daily_limit === n;
              return (
                <Pressable
                  key={n}
                  disabled={!isOwner || save.isPending}
                  onPress={() => save.mutate({ daily_limit: n })}
                  style={[styles.limit, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? `${t.colors.primary}14` : 'transparent' }]}>
                  <AppText variant="body" style={{ fontWeight: on ? '700' : '400' }}>
                    {n}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {!isOwner ? (
        <AppText variant="caption" tone="faint">
          Only the practice owner can change this.
        </AppText>
      ) : null}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────── video calls ────

const DAILY_STEPS = [
  'Go to dashboard.daily.co and create a free account (or sign in).',
  'Open "Developers" in the menu.',
  'Copy the API key shown there.',
  'Paste it below and tap "Save & test key".',
];

function hoursLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} m`;
  return m ? `${h} h ${m} m` : `${h} h`;
}

export function VideoSection() {
  const qc = useQueryClient();
  const { isOwner } = useOwner();
  const keyQ = useQuery({ queryKey: ['workspace', 'video-key'], queryFn: videoKeyApi.get, staleTime: 0 });
  const limitsQ = useQuery({ queryKey: ['tenancy', 'limits'], queryFn: tenancyApi.getLimits, staleTime: 60_000 });
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const setView = (v: VideoKeyView) => qc.setQueryData(['workspace', 'video-key'], v);

  const save = useMutation({
    mutationFn: () => videoKeyApi.save(key.trim()),
    onSuccess: (v) => {
      setView(v);
      setKey('');
      setEditing(false);
      Alert.alert('Daily.co connected', 'Your video calls now run on your own account.');
    },
    onError: (e: Error) => Alert.alert('Could not save the key', e.message),
  });
  const retest = useMutation({
    mutationFn: videoKeyApi.test,
    onSuccess: (v) => {
      setView(v);
      Alert.alert(v.status === 'connected' ? 'Key is working' : 'Key not working', v.status === 'connected' ? undefined : v.last_error ?? undefined);
    },
    onError: (e: Error) => Alert.alert('Could not test the key', e.message),
  });
  const remove = useMutation({
    mutationFn: videoKeyApi.remove,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace', 'video-key'] }),
    onError: (e: Error) => Alert.alert('Could not remove the key', e.message),
  });

  if (keyQ.isLoading) return <Loading />;
  if (keyQ.isError) return <QueryError error={keyQ.error} onRetry={() => void keyQ.refetch()} />;

  const view = keyQ.data!;
  const own = view.source === 'own';
  const hasKey = view.status !== 'missing';
  const used = limitsQ.data?.usage.videoMinutesThisMonth ?? 0;
  const limit = limitsQ.data?.limits.videoMinutesPerMonth;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <>
      <AppText variant="muted" tone="muted">
        Video consultations come with your NUSI plan, measured in hours a month. You can connect your own Daily.co account instead and pay Daily.co directly.
      </AppText>

      <Card style={{ gap: spacing.md }}>
        <StatusLine
          icon="videocam"
          tone={own ? 'success' : 'accent'}
          title={own ? `Your own Daily.co account${view.domain ? ` (${view.domain})` : ''}` : "NUSI's video, from your plan"}
          body={
            own
              ? `Key ending ${view.last4} · calls don't use your plan's hours; Daily.co bills your account.`
              : limit === 0
                ? "Your plan doesn't include video calls. Upgrade to Growth, or connect your own Daily.co account."
                : limit == null
                  ? 'Unlimited on your plan.'
                  : `${hoursLabel(used)} of ${hoursLabel(limit)} used this month.`
          }
        />
        {!own && limit ? <Meter pct={pct} used={used} /> : null}
        {view.status === 'error' ? (
          <AppText variant="caption" tone="danger">
            Your Daily.co key stopped working ({view.last_error}). Calls use NUSI&apos;s video and your plan&apos;s hours until you fix it and test again.
          </AppText>
        ) : null}
        {isOwner && !editing ? (
          <View style={styles.buttonRow}>
            {hasKey ? (
              <View style={{ flex: 1 }}>
                <ActionButton label="Test" icon="refresh" tone="neutral" loading={retest.isPending} onPress={() => retest.mutate()} />
              </View>
            ) : null}
            <View style={{ flex: hasKey ? 1 : 0, flexGrow: 1 }}>
              <ActionButton label={hasKey ? 'Replace' : 'Use my own Daily.co'} icon="key-outline" tone="neutral" onPress={() => setEditing(true)} />
            </View>
            {hasKey ? (
              <View style={{ flex: 1 }}>
                <ActionButton
                  label="Remove"
                  icon="trash-outline"
                  tone="danger"
                  loading={remove.isPending}
                  onPress={() =>
                    Alert.alert('Remove your Daily.co key?', "Video calls go back to NUSI's, using your plan's hours.", [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() },
                    ])
                  }
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      {isOwner && editing ? (
        <Card style={{ gap: spacing.md }}>
          <AppText variant="heading">{hasKey ? 'Replace your Daily.co key' : 'Connect your own Daily.co account'}</AppText>
          <AppText variant="muted" tone="muted">
            Daily.co gives every account free video minutes each month and then bills per minute. Your calls then don&apos;t count against your NUSI plan.
          </AppText>
          <Steps steps={DAILY_STEPS} />
          <ActionButton
            label="Open Daily.co dashboard"
            icon="open-outline"
            tone="neutral"
            onPress={() => void WebBrowser.openBrowserAsync('https://dashboard.daily.co/developers')}
          />
          <KeyField value={key} onChange={setKey} placeholder="Paste your Daily.co API key" />
          <ActionButton
            label={save.isPending ? 'Checking key…' : 'Save & test key'}
            icon="key-outline"
            loading={save.isPending}
            disabled={key.trim().length < 20}
            onPress={() => save.mutate()}
          />
          <ActionButton label="Cancel" tone="neutral" onPress={() => { setEditing(false); setKey(''); }} />
        </Card>
      ) : null}
    </>
  );
}

// ───────────────────────────────────────────────────────────── WhatsApp ────

export function WhatsappCard() {
  const t = useTheme();
  const qc = useQueryClient();
  const { isOwner } = useOwner();
  const [linking, setLinking] = useState(false);

  const q = useQuery({
    queryKey: ['workspace', 'connections', 'whatsapp'],
    queryFn: whatsappApi.status,
    // Poll while a QR is on screen so a scan is picked up; stop once linked.
    refetchInterval: (query) => (linking && query.state.data?.status !== 'connected' ? 4000 : false),
    staleTime: 0,
  });
  const connected = q.data?.status === 'connected';
  const refresh = () => void qc.invalidateQueries({ queryKey: ['workspace', 'connections', 'whatsapp'] });

  const connect = useMutation({
    mutationFn: whatsappApi.connect,
    onSuccess: (res) => {
      setLinking(res.status !== 'connected');
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not start WhatsApp linking', e.message),
  });
  const disconnect = useMutation({
    mutationFn: whatsappApi.disconnect,
    onSuccess: () => {
      setLinking(false);
      refresh();
    },
  });
  const notify = useMutation({
    mutationFn: whatsappApi.setNotifyClients,
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });
  const test = useMutation({
    mutationFn: whatsappApi.sendTest,
    onSuccess: (res) => {
      const r = res.whatsapp;
      if (r) Alert.alert(r.ok ? 'Test sent' : 'Test failed', r.reason);
    },
    onError: () => Alert.alert("Couldn't send the test"),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;

  const clientsOn = notify.isPending ? !!notify.variables : !!q.data?.notify_clients;

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={[styles.statusIcon, { backgroundColor: '#25D36622' }]}>
          <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="heading">WhatsApp</AppText>
            <Pill
              label={connected ? 'Connected' : linking ? 'Waiting for scan' : 'Not connected'}
              tone={connected ? 'success' : linking ? 'warning' : 'neutral'}
            />
          </View>
          <AppText variant="muted" tone="muted">
            {connected && q.data?.number
              ? `Linked to +${q.data.number}${q.data.profileName ? ` · ${q.data.profileName}` : ''}`
              : 'Link your practice WhatsApp to send reminders and alerts from your own number.'}
          </AppText>
        </View>
      </View>

      {connected ? (
        <View style={[styles.switchRow, { borderTopColor: t.colors.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="body" style={{ fontWeight: '600' }}>
              Send client reminders on WhatsApp
            </AppText>
            <AppText variant="caption" tone="muted">
              Appointment reminders, bookings and new meal plans go to clients from this number.
            </AppText>
          </View>
          <Switch
            value={clientsOn}
            disabled={!isOwner || notify.isPending}
            onValueChange={(v) => notify.mutate(v)}
            trackColor={{ true: t.colors.primary, false: t.colors.surfaceStrong }}
          />
        </View>
      ) : null}

      {linking && !connected ? (
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <View style={styles.qrBox}>
            {q.data?.qr ? (
              <Image source={{ uri: q.data.qr }} style={{ width: 200, height: 200 }} contentFit="contain" />
            ) : (
              <ActivityIndicator />
            )}
          </View>
          <Steps
            steps={[
              'Open WhatsApp on the practice phone.',
              'Tap ⋮ (or Settings) → Linked devices.',
              'Tap "Link a device" and scan this code.',
            ]}
          />
          <AppText variant="caption" tone="faint">
            Scan with another phone than this one. The code refreshes automatically.
          </AppText>
        </View>
      ) : null}

      {isOwner ? (
        <View style={styles.buttonRow}>
          {connected ? (
            <View style={{ flex: 1 }}>
              <ActionButton label="Send test" icon="paper-plane-outline" tone="neutral" loading={test.isPending} onPress={() => test.mutate()} />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <ActionButton label={linking ? 'Refresh QR' : 'Connect'} icon="qr-code-outline" loading={connect.isPending} onPress={() => connect.mutate()} />
            </View>
          )}
          {connected || linking ? (
            <View style={{ flex: 1 }}>
              <ActionButton label="Disconnect" icon="trash-outline" tone="danger" loading={disconnect.isPending} onPress={() => disconnect.mutate()} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  stepNo: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  statusIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  eye: { position: 'absolute', right: 12, bottom: 14 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { flex: 1, minWidth: 140, gap: 2, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  limit: { minWidth: 52, alignItems: 'center', paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  qrBox: { width: 216, height: 216, borderRadius: radius.lg, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
