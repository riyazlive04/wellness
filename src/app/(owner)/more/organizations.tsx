/**
 * Organizations — ports the web Organizations + OrganizationDashboard pages.
 *
 * Multi-location / franchise accounts: an org groups several workspaces, with
 * its own members and a roll-up dashboard. Plan-gated on `organizations`
 * (Scale Pro) and owner-only, matching the nav map.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import { BreakdownBars } from '@/components/owner/charts';
import {
  ActionButton,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  RouteGate,
  SegmentedTabs,
  Sheet,
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  ORG_ROLE_LABEL,
  organizationsApi,
  type OrganizationSummary,
  type OrgRole,
} from '@/lib/owner/api/organizations';
import { initials, inr, relativeTime, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

const ORG_ROLES: OrgRole[] = ['org_owner', 'org_admin', 'org_viewer'];

export default function OwnerOrganizations() {
  return (
    <RouteGate feature="organizations" featureLabel="Organizations">
      <OrganizationsInner />
    </RouteGate>
  );
}

function OrganizationsInner() {
  const t = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [open, setOpen] = useState<OrganizationSummary | null>(null);

  const listQ = useQuery({ queryKey: ['organizations'], queryFn: organizationsApi.list });

  const onRefresh = async () => {
    setRefreshing(true);
    await listQ.refetch();
    setRefreshing(false);
  };

  return (
    <OwnerPage
      title="Organizations"
      subtitle="Multi-location accounts"
      back
      actions={<IconButton icon="add" tone="accent" accessibilityLabel="New organization" onPress={() => setNewOpen(true)} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }>
      {listQ.isLoading ? (
        <Loading />
      ) : listQ.isError ? (
        <QueryError error={listQ.error} onRetry={() => void listQ.refetch()} lockedFeature="Organizations" />
      ) : !listQ.data?.length ? (
        <EmptyState
          icon="business-outline"
          title="No organizations"
          body="Group several practice locations under one account to see them together."
          action={
            <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
              <ActionButton label="Create an organization" icon="add" onPress={() => setNewOpen(true)} />
            </View>
          }
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {listQ.data.map((o) => (
            <ListRow
              key={o.id}
              title={o.name}
              subtitle={`${o.workspace_count} location${o.workspace_count === 1 ? '' : 's'} · ${o.member_count} members`}
              icon="business-outline"
              meta={ORG_ROLE_LABEL[o.my_role]}
              onPress={() => setOpen(o)}
            />
          ))}
        </Card>
      )}

      <NewOrgSheet visible={newOpen} onClose={() => setNewOpen(false)} />
      <OrgSheet org={open} onClose={() => setOpen(null)} />
    </OwnerPage>
  );
}

function NewOrgSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [billingEmail, setBillingEmail] = useState('');

  const create = useMutation({
    mutationFn: () =>
      organizationsApi.create({
        name: name.trim(),
        slug: slug.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: description.trim() || undefined,
        billing_email: billingEmail.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organizations'] });
      setName('');
      setSlug('');
      setDescription('');
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not create', e.message),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="New organization">
      <Field label="Name" value={name} onChangeText={setName} placeholder="Sirah Group" />
      <Field
        label="Slug"
        value={slug}
        onChangeText={setSlug}
        autoCapitalize="none"
        placeholder="sirah-group"
        hint="Left blank, it's derived from the name."
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 64, textAlignVertical: 'top' }}
      />
      <Field
        label="Billing email"
        value={billingEmail}
        onChangeText={setBillingEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <ActionButton
        label="Create"
        disabled={!name.trim()}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Sheet>
  );
}

type OrgTab = 'dashboard' | 'locations' | 'members' | 'activity';

function OrgSheet({ org, onClose }: { org: OrganizationSummary | null; onClose: () => void }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState<OrgTab>('dashboard');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('org_viewer');

  const id = org?.id;

  const dashQ = useQuery({
    queryKey: ['organizations', id, 'dashboard'],
    queryFn: () => organizationsApi.dashboard(id!),
    enabled: !!id && tab === 'dashboard',
  });
  const workspacesQ = useQuery({
    queryKey: ['organizations', id, 'workspaces'],
    queryFn: () => organizationsApi.listWorkspaces(id!),
    enabled: !!id && tab === 'locations',
  });
  const membersQ = useQuery({
    queryKey: ['organizations', id, 'members'],
    queryFn: () => organizationsApi.listMembers(id!),
    enabled: !!id && tab === 'members',
  });
  const activityQ = useQuery({
    queryKey: ['organizations', id, 'activity'],
    queryFn: () => organizationsApi.listActivity(id!, { limit: 50 }),
    enabled: !!id && tab === 'activity',
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['organizations', id] });

  const addMember = useMutation({
    mutationFn: () => organizationsApi.addMember(id!, { email: email.trim(), role }),
    onSuccess: () => {
      setEmail('');
      setInviteOpen(false);
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not add', e.message),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(id!, memberId),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not remove', e.message),
  });

  const detach = useMutation({
    mutationFn: (workspaceId: string) => organizationsApi.detachWorkspace(id!, workspaceId),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not detach', e.message),
  });

  const d = dashQ.data;

  return (
    <Sheet visible={!!org} onClose={onClose} title={org?.name ?? 'Organization'}>
      <SegmentedTabs
        options={[
          { key: 'dashboard', label: 'Roll-up' },
          { key: 'locations', label: 'Locations' },
          { key: 'members', label: 'Members' },
          { key: 'activity', label: 'Activity' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'dashboard' ? (
        dashQ.isLoading ? (
          <Loading />
        ) : dashQ.isError ? (
          <QueryError error={dashQ.error} onRetry={() => void dashQ.refetch()} />
        ) : d ? (
          <>
            <TileRow>
              <StatTile label="Locations" value={d.totals.locations} icon="business-outline" />
              <StatTile label="Clients" value={d.totals.clients} icon="people-outline" />
              <StatTile label="New" value={d.totals.newThisMonth} icon="person-add-outline" />
            </TileRow>
            <TileRow>
              <StatTile label="Team" value={d.totals.team} icon="people-circle-outline" />
              <StatTile label="MRR" value={inr(d.totals.mrrInr)} icon="cash-outline" />
            </TileRow>
            {d.workspaces.length ? (
              <Card>
                <BreakdownBars
                  rows={d.workspaces.map((w) => ({
                    label: w.name,
                    value: w.clients,
                    hint: `${w.clients} clients · ${inr(w.mrrInr)}`,
                  }))}
                />
              </Card>
            ) : null}
          </>
        ) : null
      ) : null}

      {tab === 'locations' ? (
        workspacesQ.isLoading ? (
          <Loading />
        ) : !workspacesQ.data?.length ? (
          <EmptyState icon="business-outline" title="No locations attached" />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {workspacesQ.data.map((w) => (
              <ListRow
                key={w.id}
                title={w.name}
                subtitle={`Attached ${relativeTime(w.created_at)}`}
                icon="storefront-outline"
                right={
                  <AppText
                    variant="caption"
                    tone="danger"
                    onPress={() =>
                      Alert.alert('Detach location?', `${w.name} leaves this organization.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Detach', style: 'destructive', onPress: () => detach.mutate(w.id) },
                      ])
                    }>
                    Detach
                  </AppText>
                }
              />
            ))}
          </Card>
        )
      ) : null}

      {tab === 'members' ? (
        <>
          <ActionButton label="Add a member" icon="person-add-outline" onPress={() => setInviteOpen(true)} />
          {membersQ.isLoading ? (
            <Loading />
          ) : !membersQ.data?.length ? (
            <EmptyState icon="people-outline" title="No members" />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {membersQ.data.map((m) => (
                <ListRow
                  key={m.id}
                  title={m.email ?? 'Member'}
                  subtitle={`${ORG_ROLE_LABEL[m.role]} · ${titleCase(m.status)}`}
                  avatarText={initials(m.email ?? 'M')}
                  tint={m.status === 'active' ? t.colors.success : undefined}
                  right={
                    <AppText variant="caption" tone="danger" onPress={() => removeMember.mutate(m.id)}>
                      Remove
                    </AppText>
                  }
                />
              ))}
            </Card>
          )}
        </>
      ) : null}

      {tab === 'activity' ? (
        activityQ.isLoading ? (
          <Loading />
        ) : !activityQ.data?.length ? (
          <EmptyState icon="pulse-outline" title="No activity" />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {activityQ.data.map((row) => (
              <ListRow
                key={row.id}
                title={`${row.http_method} ${row.entity_type ? titleCase(row.entity_type) : row.route}`}
                subtitle={row.actor_email ?? row.actor_name ?? 'System'}
                icon="pulse-outline"
                meta={relativeTime(row.created_at)}
              />
            ))}
          </Card>
        )
      ) : null}

      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title="Add organization member">
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="muted">
            ROLE
          </AppText>
          <SegmentedTabs
            options={ORG_ROLES.map((r) => ({ key: r, label: ORG_ROLE_LABEL[r] }))}
            value={role}
            onChange={setRole}
          />
        </View>
        <ActionButton
          label="Add member"
          disabled={!email.trim()}
          loading={addMember.isPending}
          onPress={() => addMember.mutate()}
        />
      </Sheet>

      {org ? <Pill label={`Slug: ${org.slug}`} /> : null}
    </Sheet>
  );
}
