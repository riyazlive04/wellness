/**
 * Settings — ports the web owner Settings page and all seven of its sections:
 * General · Branding · Public page · Verification · Integrations · Security ·
 * Data. Deep-linkable via `?tab=` exactly like the web (`/settings?tab=public`
 * is what the "Public page" nav item points at).
 *
 * Owner-only writes are enforced server-side; the UI mirrors that by hiding
 * the destructive sections behind `isOwner`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Alert, Share, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  Field,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  RouteGate,
  SegmentedTabs,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useOwner } from '@/contexts/owner-context';
import { useEditable } from '@/hooks/use-editable';
import { useTheme } from '@/hooks/use-theme';
import { API_BASE_DEFAULT, clearApiBase, currentApiBase, setApiBase } from '@/lib/api';
import { apiKeysApi } from '@/lib/owner/api/apiKeys';
import { dataPrivacyApi } from '@/lib/owner/api/dataPrivacy';
import { publicProfileApi, type ProfileLinkIcon } from '@/lib/owner/api/publicProfile';
import { verificationApi } from '@/lib/owner/api/verification';
import { workspacesApi } from '@/lib/owner/api/workspaces';
import { dateTime, relativeTime, titleCase } from '@/lib/owner/format';
import { canWhiteLabel } from '@/lib/plan-capabilities';
import { spacing } from '@/lib/theme';

type SectionKey = 'general' | 'branding' | 'public' | 'verification' | 'integrations' | 'security' | 'data';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'branding', label: 'Branding' },
  { key: 'public', label: 'Public page' },
  { key: 'verification', label: 'Verification' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'security', label: 'Security' },
  { key: 'data', label: 'Data' },
];

export default function OwnerSettings() {
  return (
    <RouteGate permission="settings.manage">
      <SettingsInner />
    </RouteGate>
  );
}

function SettingsInner() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const valid = SECTIONS.some((s) => s.key === params.tab);
  const [section, setSection] = useState<SectionKey>(valid ? (params.tab as SectionKey) : 'general');

  return (
    <OwnerPage
      title="Settings"
      subtitle="Workspace configuration"
      back
      contentStyle={{ paddingHorizontal: 0 }}>
      <SegmentedTabs options={SECTIONS} value={section} onChange={setSection} />
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {section === 'general' ? <GeneralSection /> : null}
        {section === 'branding' ? <BrandingSection /> : null}
        {section === 'public' ? <PublicProfileSection /> : null}
        {section === 'verification' ? <VerificationSection /> : null}
        {section === 'integrations' ? <IntegrationsSection /> : null}
        {section === 'security' ? <SecuritySection /> : null}
        {section === 'data' ? <DataSection /> : null}
      </View>
    </OwnerPage>
  );
}

// ────────────────────────────────────────────────────────────────  general ────

function GeneralSection() {
  const qc = useQueryClient();
  const { isOwner } = useOwner();
  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: workspacesApi.me });

  const server = useMemo(
    () => ({
      name: wsQ.data?.name ?? '',
      legal_name: wsQ.data?.legal_name ?? '',
      contact_email: wsQ.data?.contact_email ?? '',
      contact_phone: wsQ.data?.contact_phone ?? '',
      timezone: wsQ.data?.timezone ?? '',
      locale: wsQ.data?.locale ?? '',
      dashboard_quote: wsQ.data?.dashboard_quote ?? '',
    }),
    [wsQ.data],
  );
  const { value: form, dirty, field: set, reset } = useEditable(server);

  const save = useMutation({
    mutationFn: () => workspacesApi.update(form),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ['workspace'] });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  if (wsQ.isLoading) return <Loading />;
  if (wsQ.isError) return <QueryError error={wsQ.error} onRetry={() => void wsQ.refetch()} />;

  return (
    <>
      <Card style={{ gap: spacing.md }}>
        <Field label="Practice name" value={form.name} onChangeText={set('name')} editable={isOwner} />
        <Field label="Legal name" value={form.legal_name} onChangeText={set('legal_name')} editable={isOwner} />
        <Field
          label="Contact email"
          value={form.contact_email}
          onChangeText={set('contact_email')}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={isOwner}
        />
        <Field
          label="Contact phone"
          value={form.contact_phone}
          onChangeText={set('contact_phone')}
          keyboardType="phone-pad"
          editable={isOwner}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Timezone" value={form.timezone} onChangeText={set('timezone')} editable={isOwner} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Locale" value={form.locale} onChangeText={set('locale')} editable={isOwner} />
          </View>
        </View>
        <Field
          label="Dashboard quote"
          value={form.dashboard_quote}
          onChangeText={set('dashboard_quote')}
          multiline
          editable={isOwner}
          style={{ minHeight: 64, textAlignVertical: 'top' }}
          hint="Shown to your clients on their home screen"
        />
      </Card>

      {isOwner ? (
        <ActionButton
          label="Save changes"
          icon="save-outline"
          disabled={!dirty}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      ) : (
        <AppText variant="caption" tone="faint">
          Only the workspace owner can change these.
        </AppText>
      )}

      <Card style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="faint">
          IDENTIFIERS
        </AppText>
        <Line label="Workspace ID" value={wsQ.data?.id ?? '—'} />
        <Line label="Slug" value={wsQ.data?.slug ?? '—'} />
        <Line label="Plan" value={titleCase(wsQ.data?.plan)} />
        <Line label="GSTIN" value={wsQ.data?.gstin ?? '—'} />
        <Line label="PAN" value={wsQ.data?.pan ?? '—'} />
      </Card>
    </>
  );
}

// ───────────────────────────────────────────────────────────────  branding ────

function BrandingSection() {
  const qc = useQueryClient();
  const { isOwner, scope } = useOwner();
  const brandQ = useQuery({ queryKey: ['workspace', 'branding'], queryFn: workspacesApi.branding });

  const allowed = canWhiteLabel(scope?.plan);

  const server = useMemo(
    () => ({
      logo_url: brandQ.data?.logo_url ?? '',
      brand_color: brandQ.data?.brand_color ?? '',
      brand_accent: brandQ.data?.brand_accent ?? '',
      tagline: brandQ.data?.tagline ?? '',
      pdf_contact_line: brandQ.data?.pdf_contact_line ?? '',
      pdf_footer_note: brandQ.data?.pdf_footer_note ?? '',
      white_label: !!brandQ.data?.white_label,
    }),
    [brandQ.data],
  );
  const { value: form, dirty, field: set, patch, reset } = useEditable(server);

  const save = useMutation({
    mutationFn: () => workspacesApi.updateBranding(form),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ['workspace'] });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  if (brandQ.isLoading) return <Loading />;

  return (
    <>
      <Card style={{ gap: spacing.md }}>
        <Field label="Logo URL" value={form.logo_url} onChangeText={set('logo_url')} autoCapitalize="none" editable={isOwner} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Brand colour" value={form.brand_color} onChangeText={set('brand_color')} placeholder="#0F9AA9" autoCapitalize="none" editable={isOwner} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Accent" value={form.brand_accent} onChangeText={set('brand_accent')} placeholder="#2BC4AE" autoCapitalize="none" editable={isOwner} />
          </View>
        </View>
        <Field label="Tagline" value={form.tagline} onChangeText={set('tagline')} editable={isOwner} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <AppText variant="heading">PDF documents</AppText>
        <Field label="Header contact line" value={form.pdf_contact_line} onChangeText={set('pdf_contact_line')} editable={isOwner} />
        <Field
          label="Footer note"
          value={form.pdf_footer_note}
          onChangeText={set('pdf_footer_note')}
          multiline
          editable={isOwner}
          style={{ minHeight: 64, textAlignVertical: 'top' }}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">White label</AppText>
        <AppText variant="muted" tone="muted">
          Removes SIRAH LIFE branding from the client portal and your invoices.
        </AppText>
        {allowed ? (
          <SegmentedTabs
            options={[
              { key: 'off', label: 'Show branding' },
              { key: 'on', label: 'White label' },
            ]}
            value={form.white_label ? 'on' : 'off'}
            onChange={(v) => patch({ white_label: v === 'on' })}
          />
        ) : (
          <Pill label="Not on your plan" tone="warning" />
        )}
      </Card>

      {isOwner ? (
        <ActionButton
          label="Save branding"
          icon="save-outline"
          disabled={!dirty}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────  public page ────

const LINK_ICONS: ProfileLinkIcon[] = ['whatsapp', 'instagram', 'youtube', 'website', 'calendar', 'shop', 'custom'];

function PublicProfileSection() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['public-profile'], queryFn: publicProfileApi.getMine });

  const [linkOpen, setLinkOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState<ProfileLinkIcon>('website');

  const server = useMemo(
    () => ({ headline: profileQ.data?.headline ?? '', bio: profileQ.data?.bio ?? '' }),
    [profileQ.data],
  );
  const { value: form, dirty, field: setField, reset } = useEditable(server);

  const patch = useMutation({
    mutationFn: (body: Parameters<typeof publicProfileApi.patchMine>[0]) => publicProfileApi.patchMine(body),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ['public-profile'] });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const replaceLinks = useMutation({
    mutationFn: (links: { label: string; url: string; icon?: ProfileLinkIcon; enabled?: boolean }[]) =>
      publicProfileApi.replaceLinks(links),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['public-profile'] }),
    onError: (e: Error) => Alert.alert('Could not save links', e.message),
  });

  if (profileQ.isLoading) return <Loading />;
  if (profileQ.isError) return <QueryError error={profileQ.error} onRetry={() => void profileQ.refetch()} />;

  const p = profileQ.data;
  const links = p?.links ?? [];
  const publicUrl = p?.public_url ?? null;

  return (
    <>
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Public page</AppText>
        <AppText variant="muted" tone="muted">
          A single shareable link with your bio, links and a join button.
        </AppText>
        <SegmentedTabs
          options={[
            { key: 'off', label: 'Hidden' },
            { key: 'on', label: 'Live' },
          ]}
          value={p?.enabled ? 'on' : 'off'}
          onChange={(v) => patch.mutate({ enabled: v === 'on' })}
        />
        {publicUrl ? (
          <>
            <AppText variant="muted" tone="accent" selectable>
              {publicUrl}
            </AppText>
            {/* No clipboard button — expo-clipboard is native, and this screen
                must stay OTA-shippable. The URL above is selectable. */}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <ActionButton label="Share" icon="share-outline" onPress={() => void Share.share({ message: publicUrl })} />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  label="Open"
                  icon="open-outline"
                  tone="neutral"
                  onPress={() => void WebBrowser.openBrowserAsync(publicUrl)}
                />
              </View>
            </View>
          </>
        ) : (
          <AppText variant="caption" tone="faint">
            Set a workspace slug under General to get a public URL.
          </AppText>
        )}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Field
          label="Headline"
          value={form.headline}
          onChangeText={setField('headline')}
          placeholder="Clinical nutrition for busy people"
        />
        <Field
          label="Bio"
          value={form.bio}
          onChangeText={setField('bio')}
          multiline
          style={{ minHeight: 110, textAlignVertical: 'top' }}
        />
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="muted">
            JOIN BUTTON
          </AppText>
          <SegmentedTabs
            options={[
              { key: 'off', label: 'Hide' },
              { key: 'on', label: 'Show' },
            ]}
            value={p?.show_join_cta ? 'on' : 'off'}
            onChange={(v) => patch.mutate({ show_join_cta: v === 'on' })}
          />
        </View>
        <ActionButton
          label="Save"
          icon="save-outline"
          disabled={!dirty}
          loading={patch.isPending}
          onPress={() => patch.mutate({ headline: form.headline || null, bio: form.bio || null })}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Links</AppText>
        {!links.length ? (
          <AppText variant="muted" tone="faint">
            No links yet.
          </AppText>
        ) : (
          links.map((l) => (
            <ListRow
              key={l.id}
              title={l.label}
              subtitle={l.url}
              icon="link-outline"
              right={
                <AppText
                  variant="caption"
                  tone="danger"
                  onPress={() =>
                    replaceLinks.mutate(
                      links
                        .filter((x) => x.id !== l.id)
                        .map((x) => ({ label: x.label, url: x.url, icon: x.icon, enabled: x.enabled })),
                    )
                  }>
                  Remove
                </AppText>
              }
            />
          ))
        )}
        <ActionButton label="Add a link" icon="add" tone="neutral" onPress={() => setLinkOpen(true)} />
      </Card>

      <Sheet visible={linkOpen} onClose={() => setLinkOpen(false)} title="Add a link">
        <Field label="Label" value={label} onChangeText={setLabel} placeholder="WhatsApp" />
        <Field label="URL" value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="https://…" />
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="muted">
            ICON
          </AppText>
          <SegmentedTabs
            options={LINK_ICONS.map((i) => ({ key: i, label: titleCase(i) }))}
            value={icon}
            onChange={setIcon}
          />
        </View>
        <ActionButton
          label="Add link"
          disabled={!label.trim() || !url.trim()}
          loading={replaceLinks.isPending}
          onPress={() => {
            replaceLinks.mutate([
              ...links.map((x) => ({ label: x.label, url: x.url, icon: x.icon, enabled: x.enabled })),
              { label: label.trim(), url: url.trim(), icon, enabled: true },
            ]);
            setLabel('');
            setUrl('');
            setLinkOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

// ───────────────────────────────────────────────────────────  verification ────

function VerificationSection() {
  const qc = useQueryClient();
  const t = useTheme();
  const vQ = useQuery({ queryKey: ['verification'], queryFn: verificationApi.get });

  const [uploading, setUploading] = useState(false);

  const server = useMemo(
    () => ({
      legal_name: vQ.data?.legal_name ?? '',
      professional_title: vQ.data?.professional_title ?? '',
      qualifications: vQ.data?.qualifications ?? '',
      registration_number: vQ.data?.registration_number ?? '',
      experience_years:
        vQ.data?.experience_years !== null && vQ.data?.experience_years !== undefined
          ? String(vQ.data.experience_years)
          : '',
      pan: vQ.data?.pan ?? '',
      gstin: vQ.data?.gstin ?? '',
    }),
    [vQ.data],
  );
  const { value: form, field: set, reset } = useEditable(server);

  const submit = useMutation({
    mutationFn: () =>
      verificationApi.submit({
        legal_name: form.legal_name || undefined,
        professional_title: form.professional_title || undefined,
        qualifications: form.qualifications || undefined,
        registration_number: form.registration_number || undefined,
        experience_years: form.experience_years ? Number(form.experience_years) : undefined,
        pan: form.pan || undefined,
        gstin: form.gstin || undefined,
        documents: vQ.data?.documents ?? [],
      }),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ['verification'] });
      Alert.alert('Submitted', 'Your credentials are queued for review.');
    },
    onError: (e: Error) => Alert.alert('Could not submit', e.message),
  });

  /** Same ticket → PUT → register flow as every other upload in the app. */
  const uploadDoc = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) return;
    const file = picked.assets[0];
    setUploading(true);
    try {
      const ticket = await verificationApi.uploadTicket(file.name);
      const blob = await (await fetch(file.uri)).blob();
      const put = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: file.mimeType ? { 'Content-Type': file.mimeType } : undefined,
        body: blob,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await verificationApi.submit({
        documents: [
          ...(vQ.data?.documents ?? []),
          { type: 'credential', file_name: file.name, storage_key: ticket.storageKey },
        ],
      });
      void qc.invalidateQueries({ queryKey: ['verification'] });
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (vQ.isLoading) return <Loading />;
  if (vQ.isError) return <QueryError error={vQ.error} onRetry={() => void vQ.refetch()} />;

  const v = vQ.data!;

  return (
    <>
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="heading" style={{ flex: 1 }}>
            Practitioner verification
          </AppText>
          <Pill
            label={titleCase(v.status)}
            tone={
              v.status === 'verified'
                ? 'success'
                : v.status === 'pending'
                  ? 'warning'
                  : v.status === 'rejected'
                    ? 'danger'
                    : 'neutral'
            }
          />
        </View>
        <AppText variant="muted" tone="muted">
          Verified practices get a badge on their public page. Review is manual and usually takes a couple of days.
        </AppText>
        {v.review_notes ? (
          <AppText variant="muted" tone={v.status === 'rejected' ? 'danger' : 'muted'}>
            {v.review_notes}
          </AppText>
        ) : null}
        {v.submitted_at ? (
          <AppText variant="caption" tone="faint">
            {`Submitted ${dateTime(v.submitted_at)}`}
          </AppText>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Field label="Legal name" value={form.legal_name} onChangeText={set('legal_name')} />
        <Field label="Professional title" value={form.professional_title} onChangeText={set('professional_title')} placeholder="Registered Dietitian" />
        <Field
          label="Qualifications"
          value={form.qualifications}
          onChangeText={set('qualifications')}
          multiline
          style={{ minHeight: 70, textAlignVertical: 'top' }}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Registration no." value={form.registration_number} onChangeText={set('registration_number')} autoCapitalize="characters" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Years of experience" value={form.experience_years} onChangeText={set('experience_years')} keyboardType="number-pad" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="PAN" value={form.pan} onChangeText={set('pan')} autoCapitalize="characters" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="GSTIN" value={form.gstin} onChangeText={set('gstin')} autoCapitalize="characters" />
          </View>
        </View>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Documents</AppText>
        {!v.documents.length ? (
          <AppText variant="muted" tone="faint">
            No documents uploaded.
          </AppText>
        ) : (
          v.documents.map((d, i) => (
            <ListRow key={i} title={d.file_name} subtitle={titleCase(d.type)} icon="document-outline" tint={t.colors.success} />
          ))
        )}
        <ActionButton
          label="Upload a document"
          icon="cloud-upload-outline"
          tone="neutral"
          loading={uploading}
          onPress={() => void uploadDoc()}
        />
      </Card>

      <ActionButton
        label={v.status === 'unsubmitted' ? 'Submit for review' : 'Resubmit'}
        icon="shield-checkmark-outline"
        loading={submit.isPending}
        onPress={() => submit.mutate()}
      />
    </>
  );
}

// ───────────────────────────────────────────────────────────  integrations ────

function IntegrationsSection() {
  const t = useTheme();
  const intQ = useQuery({ queryKey: ['workspace', 'integrations'], queryFn: workspacesApi.integrations });

  if (intQ.isLoading) return <Loading />;
  if (intQ.isError) return <QueryError error={intQ.error} onRetry={() => void intQ.refetch()} />;

  const report = intQ.data!;

  return (
    <>
      <Card style={{ gap: spacing.xs }}>
        <AppText variant="heading">
          {report.summary.connected} of {report.summary.total} connected
        </AppText>
        <AppText variant="muted" tone="muted">
          {`${report.summary.partial} partially configured · ${report.summary.missing} not set up`}
        </AppText>
        <AppText variant="caption" tone="faint">
          Read-only: this reports which server keys are present, never their values.
        </AppText>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {report.items.map((i) => (
          <ListRow
            key={i.key}
            title={i.name}
            subtitle={`${titleCase(i.category)} · ${i.detail}`}
            icon="link-outline"
            tint={
              i.status === 'connected'
                ? t.colors.success
                : i.status === 'partial'
                  ? t.colors.warning
                  : t.colors.danger
            }
            right={
              <Pill
                label={i.status === 'not_configured' ? 'Missing' : titleCase(i.status)}
                tone={i.status === 'connected' ? 'success' : i.status === 'partial' ? 'warning' : 'neutral'}
              />
            }
            onPress={i.docs_url ? () => void WebBrowser.openBrowserAsync(i.docs_url!) : undefined}
          />
        ))}
      </Card>
    </>
  );
}

// ───────────────────────────────────────────────────────────────  security ────

function SecuritySection() {
  const qc = useQueryClient();
  const { isOwner, hasFeature } = useOwner();
  const { signOut, user } = useAuth();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState(currentApiBase());

  const keysQ = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeysApi.list,
    enabled: hasFeature('api_access'),
  });

  const create = useMutation({
    mutationFn: () => apiKeysApi.create(name.trim()),
    onSuccess: (k) => {
      setName('');
      setCreated(k.key);
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (e: Error) => Alert.alert('Could not create key', e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  return (
    <>
      <Card style={{ gap: spacing.xs }}>
        <AppText variant="heading">Signed in as</AppText>
        <AppText variant="muted" tone="muted">
          {user?.email ?? '—'}
        </AppText>
      </Card>

      {hasFeature('api_access') ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">API keys</AppText>
          <AppText variant="muted" tone="muted">
            For your own integrations. A key is shown once, at creation — store it somewhere safe.
          </AppText>
          {keysQ.isLoading ? (
            <Loading />
          ) : !keysQ.data?.length ? (
            <AppText variant="muted" tone="faint">
              No keys yet.
            </AppText>
          ) : (
            keysQ.data.map((k) => (
              <ListRow
                key={k.id}
                title={k.name}
                subtitle={`${k.key_prefix}… · ${k.last_used_at ? `used ${relativeTime(k.last_used_at)}` : 'never used'}`}
                icon="key-outline"
                right={
                  k.revoked_at ? (
                    <Pill label="Revoked" tone="neutral" />
                  ) : (
                    <AppText variant="caption" tone="danger" onPress={() => revoke.mutate(k.id)}>
                      Revoke
                    </AppText>
                  )
                }
              />
            ))
          )}
          {isOwner ? (
            <>
              <Field label="New key name" value={name} onChangeText={setName} placeholder="Zapier" />
              <ActionButton
                label="Create key"
                icon="add"
                disabled={!name.trim()}
                loading={create.isPending}
                onPress={() => create.mutate()}
              />
            </>
          ) : null}
        </Card>
      ) : (
        <Card style={{ gap: spacing.xs }}>
          <AppText variant="heading">API access</AppText>
          <Pill label="Not on your plan" tone="warning" />
        </Card>
      )}

      {/* Server URL override — mobile-only, and the reason a changed backend
          host never forces a rebuild. Mirrors the client portal's setting. */}
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Server</AppText>
        <Field
          label="API base URL"
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          keyboardType="url"
          hint={`Build default: ${API_BASE_DEFAULT}`}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <ActionButton
              label="Use this"
              onPress={async () => {
                await setApiBase(serverUrl);
                Alert.alert('Saved', 'Sign out and back in for it to take full effect.');
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <ActionButton
              label="Reset"
              tone="neutral"
              onPress={async () => {
                await clearApiBase();
                setServerUrl(currentApiBase());
              }}
            />
          </View>
        </View>
      </Card>

      <ActionButton label="Sign out" icon="log-out-outline" tone="danger" onPress={() => void signOut()} />

      <Sheet visible={!!created} onClose={() => setCreated(null)} title="Your new API key">
        <AppText variant="muted" tone="warning">
          {"This is the only time you'll see it."}
        </AppText>
        <Card>
          {/* Long-press to select and copy. A clipboard button would need
              expo-clipboard, which is native and would block OTA delivery. */}
          <AppText variant="muted" selectable>
            {created}
          </AppText>
        </Card>
        <ActionButton
          label="Send key to myself"
          icon="share-outline"
          onPress={() => {
            if (created) void Share.share({ message: created });
          }}
        />
        <AppText variant="caption" tone="faint">
          Long-press the key above to select it, or use Share to put it straight into your password manager.
        </AppText>
      </Sheet>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────  data ────

function DataSection() {
  const qc = useQueryClient();
  const { isOwner } = useOwner();
  const [requestOpen, setRequestOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [type, setType] = useState<'export' | 'erasure'>('export');
  const [reason, setReason] = useState('');

  const retentionQ = useQuery({ queryKey: ['data', 'retention'], queryFn: dataPrivacyApi.retention });
  const requestsQ = useQuery({ queryKey: ['data', 'requests'], queryFn: dataPrivacyApi.listRequests });

  const server = useMemo(
    () => ({
      client_months: retentionQ.data ? String(retentionQ.data.client_months) : '',
      messages_years: retentionQ.data ? String(retentionQ.data.messages_years) : '',
      backups_days: retentionQ.data ? String(retentionQ.data.backups_days) : '',
    }),
    [retentionQ.data],
  );
  const { value: retention, dirty, field: set, reset } = useEditable(server);

  const saveRetention = useMutation({
    mutationFn: () =>
      dataPrivacyApi.updateRetention({
        client_months: Number(retention.client_months),
        messages_years: Number(retention.messages_years),
        backups_days: Number(retention.backups_days),
      }),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ['data', 'retention'] });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const createRequest = useMutation({
    mutationFn: () =>
      dataPrivacyApi.createRequest({ target_email: email.trim(), type, reason: reason.trim() || undefined }),
    onSuccess: () => {
      setEmail('');
      setReason('');
      setRequestOpen(false);
      void qc.invalidateQueries({ queryKey: ['data', 'requests'] });
    },
    onError: (e: Error) => Alert.alert('Could not log request', e.message),
  });

  const exportAll = useMutation({
    mutationFn: () => dataPrivacyApi.export(),
    onSuccess: (res) => {
      const rows = Object.values(res.counts).reduce((a, b) => a + b, 0);
      Alert.alert(
        'Export ready',
        `${rows} rows across ${Object.keys(res.tables).length} tables, generated ${dateTime(res.generated_at)}.\n\nDownload the file from the web app — a full export is too large to hand off on a phone.`,
      );
    },
    onError: (e: Error) => Alert.alert('Export failed', e.message),
  });

  return (
    <>
      <Card style={{ gap: spacing.md }}>
        <AppText variant="heading">Retention</AppText>
        <AppText variant="muted" tone="muted">
          How long records are kept after a client leaves.
        </AppText>
        <Field label="Client records (months)" value={retention.client_months} onChangeText={set('client_months')} keyboardType="number-pad" editable={isOwner} />
        <Field label="Messages (years)" value={retention.messages_years} onChangeText={set('messages_years')} keyboardType="number-pad" editable={isOwner} />
        <Field label="Backups (days)" value={retention.backups_days} onChangeText={set('backups_days')} keyboardType="number-pad" editable={isOwner} />
        {isOwner ? (
          <ActionButton
            label="Save retention"
            disabled={!dirty}
            loading={saveRetention.isPending}
            onPress={() => saveRetention.mutate()}
          />
        ) : null}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Subject requests</AppText>
        {requestsQ.isLoading ? (
          <Loading />
        ) : !requestsQ.data?.length ? (
          <AppText variant="muted" tone="faint">
            No export or erasure requests logged.
          </AppText>
        ) : (
          requestsQ.data.map((r) => (
            <ListRow
              key={r.id}
              title={r.target_email}
              subtitle={`${titleCase(r.status)} · due ${dateTime(r.due_by)}`}
              icon="shield-outline"
              meta={titleCase(r.request_channel)}
            />
          ))
        )}
        <ActionButton label="Log a request" icon="add" tone="neutral" onPress={() => setRequestOpen(true)} />
      </Card>

      {isOwner ? (
        <ActionButton
          label="Export all workspace data"
          icon="download-outline"
          tone="neutral"
          loading={exportAll.isPending}
          onPress={() => exportAll.mutate()}
        />
      ) : null}

      <Sheet visible={requestOpen} onClose={() => setRequestOpen(false)} title="Log a subject request">
        <Field label="Subject email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="muted">
            TYPE
          </AppText>
          <SegmentedTabs
            options={[
              { key: 'export', label: 'Export' },
              { key: 'erasure', label: 'Erasure' },
            ]}
            value={type}
            onChange={setType}
          />
        </View>
        <Field
          label="Reason (optional)"
          value={reason}
          onChangeText={setReason}
          multiline
          style={{ minHeight: 70, textAlignVertical: 'top' }}
        />
        <ActionButton
          label="Log request"
          disabled={!email.trim()}
          loading={createRequest.isPending}
          onPress={() => createRequest.mutate()}
        />
      </Sheet>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText variant="muted" tone="muted">
        {label}
      </AppText>
      <AppText variant="muted" numberOfLines={1} style={{ flexShrink: 1 }} selectable>
        {value}
      </AppText>
    </View>
  );
}
