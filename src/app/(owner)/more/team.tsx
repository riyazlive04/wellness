/**
 * Team — ports the web Team page.
 *
 * Staff members with their roles, pending invites, plan seat usage, and the
 * per-member permission editor (the web's PermissionEditorDialog). Permissions
 * are stored as overrides on top of the role defaults, so the editor shows
 * three states per permission: inherited, granted, denied — same model the
 * backend evaluates.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, Share, View } from 'react-native';

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
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import {
  INVITABLE_ROLES,
  PERMISSION_LABEL,
  ROLE_LABEL,
  permissionsApi,
  switchApi,
  tenancyApi,
  type OverrideEffect,
  type TeamMember,
} from '@/lib/owner/api/tenancy';
import { dateTime, initials, relativeTime, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Tab = 'members' | 'invites' | 'workspaces';

export default function OwnerTeam() {
  return (
    <RouteGate permission="team.manage">
      <TeamInner />
    </RouteGate>
  );
}

function TeamInner() {
  const t = useTheme();
  const qc = useQueryClient();
  const { isOwner, scope } = useOwner();
  const [tab, setTab] = useState<Tab>('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [permsFor, setPermsFor] = useState<TeamMember | null>(null);

  const limitsQ = useQuery({ queryKey: ['tenancy', 'limits'], queryFn: tenancyApi.getLimits });
  const membersQ = useQuery({ queryKey: ['tenancy', 'members'], queryFn: tenancyApi.listMembers });
  const invitesQ = useQuery({ queryKey: ['tenancy', 'invites'], queryFn: tenancyApi.listInvites });
  const membershipsQ = useQuery({
    queryKey: ['tenancy', 'memberships'],
    queryFn: switchApi.memberships,
    enabled: tab === 'workspaces',
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['tenancy'] });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => tenancyApi.updateMemberRole(id, role),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not change role', e.message),
  });
  const removeMember = useMutation({
    mutationFn: (id: string) => tenancyApi.removeMember(id),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not remove', e.message),
  });
  const revokeInvite = useMutation({
    mutationFn: (id: string) => tenancyApi.revokeInvite(id),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not revoke', e.message),
  });
  const switchWs = useMutation({
    mutationFn: (workspaceId: string) => switchApi.switch(workspaceId),
    onSuccess: () => {
      // Switching workspace invalidates literally every cached read.
      void qc.invalidateQueries();
      Alert.alert('Switched', 'You are now working in the selected workspace.');
    },
    onError: (e: Error) => Alert.alert('Could not switch', e.message),
  });

  const limits = limitsQ.data;
  const pendingInvites = (invitesQ.data ?? []).filter((i) => i.status === 'pending');

  return (
    <OwnerPage
      title="Team"
      subtitle={scope?.workspaceRole ? `You are ${ROLE_LABEL[scope.workspaceRole] ?? scope.workspaceRole}` : undefined}
      back
      actions={
        isOwner ? (
          <IconButton icon="person-add-outline" tone="accent" accessibilityLabel="Invite" onPress={() => setInviteOpen(true)} />
        ) : undefined
      }
      contentStyle={{ paddingHorizontal: 0 }}>
      {limits ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <TileRow>
            <StatTile
              label="Seats used"
              value={limits.limits.maxTeam ? `${limits.usage.team}/${limits.limits.maxTeam}` : limits.usage.team}
              icon="people-circle-outline"
              tint={limits.remaining.team === 0 ? t.colors.warning : undefined}
            />
            <StatTile
              label="Clients"
              value={limits.limits.maxClients ? `${limits.usage.clients}/${limits.limits.maxClients}` : limits.usage.clients}
              icon="people-outline"
            />
            <StatTile
              label="AI calls"
              value={
                limits.limits.aiCallsPerMonth
                  ? `${limits.usage.aiCallsThisMonth}/${limits.limits.aiCallsPerMonth}`
                  : limits.usage.aiCallsThisMonth
              }
              icon="sparkles-outline"
            />
          </TileRow>
        </View>
      ) : null}

      <SegmentedTabs
        options={[
          { key: 'members', label: 'Members', badge: membersQ.data?.length },
          { key: 'invites', label: 'Invites', badge: pendingInvites.length || undefined },
          { key: 'workspaces', label: 'Workspaces' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {tab === 'members' ? (
          membersQ.isLoading ? (
            <Loading />
          ) : membersQ.isError ? (
            <QueryError error={membersQ.error} onRetry={() => void membersQ.refetch()} />
          ) : !membersQ.data?.length ? (
            <EmptyState icon="people-circle-outline" title="No team members" body="It's just you right now." />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {membersQ.data.map((m) => (
                <ListRow
                  key={m.id}
                  title={m.email ?? 'Member'}
                  subtitle={`${ROLE_LABEL[m.role] ?? titleCase(m.role)} · joined ${relativeTime(m.joined_at)}`}
                  avatarText={initials(m.email ?? 'M')}
                  tint={m.status === 'active' ? t.colors.success : undefined}
                  onPress={isOwner && m.role !== 'owner' ? () => setPermsFor(m) : undefined}
                  right={
                    isOwner && m.role !== 'owner' ? (
                      <AppText
                        variant="caption"
                        tone="danger"
                        onPress={() =>
                          Alert.alert('Remove member?', `${m.email} loses access immediately.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => removeMember.mutate(m.id) },
                          ])
                        }>
                        Remove
                      </AppText>
                    ) : (
                      <Pill label={titleCase(m.status)} tone={m.status === 'active' ? 'success' : 'neutral'} />
                    )
                  }
                />
              ))}
            </Card>
          )
        ) : null}

        {tab === 'invites' ? (
          invitesQ.isLoading ? (
            <Loading />
          ) : !invitesQ.data?.length ? (
            <EmptyState icon="mail-outline" title="No invites" body="Invite a colleague to share the workload." />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {invitesQ.data.map((i) => (
                <ListRow
                  key={i.id}
                  title={i.email}
                  subtitle={`${ROLE_LABEL[i.role] ?? titleCase(i.role)} · ${
                    i.status === 'pending' ? `expires ${dateTime(i.expires_at)}` : titleCase(i.status)
                  }`}
                  icon="mail-outline"
                  tint={i.status === 'pending' ? t.colors.warning : undefined}
                  right={
                    i.status === 'pending' ? (
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <AppText
                          variant="caption"
                          tone="accent"
                          onPress={() => void Share.share({ message: inviteLink(i.token) })}>
                          Share
                        </AppText>
                        <AppText variant="caption" tone="danger" onPress={() => revokeInvite.mutate(i.id)}>
                          Revoke
                        </AppText>
                      </View>
                    ) : (
                      <Pill label={titleCase(i.status)} />
                    )
                  }
                />
              ))}
            </Card>
          )
        ) : null}

        {tab === 'workspaces' ? (
          membershipsQ.isLoading ? (
            <Loading />
          ) : !membershipsQ.data?.length ? (
            <EmptyState icon="business-outline" title="One workspace" body="You only belong to this practice." />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {membershipsQ.data.map((w) => (
                <ListRow
                  key={w.workspace_id}
                  title={w.name}
                  subtitle={ROLE_LABEL[w.role] ?? titleCase(w.role)}
                  icon="business-outline"
                  tint={w.is_active ? t.colors.accent : undefined}
                  right={
                    w.is_active ? (
                      <Pill label="Active" tone="accent" />
                    ) : (
                      <AppText variant="caption" tone="accent" onPress={() => switchWs.mutate(w.workspace_id)}>
                        Switch
                      </AppText>
                    )
                  }
                />
              ))}
            </Card>
          )
        ) : null}
      </View>

      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} />
      <PermissionsSheet member={permsFor} onClose={() => setPermsFor(null)} onChangeRole={changeRole.mutate} />
    </OwnerPage>
  );
}

function inviteLink(token: string): string {
  return `https://nusi.in/team-invite/${token}`;
}

function InviteSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'invite' | 'direct'>('invite');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>(INVITABLE_ROLES[0]);
  const [notes, setNotes] = useState('');

  const invite = useMutation({
    mutationFn: () => tenancyApi.invite({ email: email.trim(), role, notes: notes.trim() || undefined }),
    onSuccess: (inv) => {
      void qc.invalidateQueries({ queryKey: ['tenancy'] });
      setEmail('');
      setNotes('');
      onClose();
      // Share rather than clipboard: expo-clipboard is a native module and
      // this screen has to stay shippable over OTA.
      Alert.alert('Invite sent', `${inv.email} can join as ${ROLE_LABEL[inv.role] ?? inv.role}.`, [
        { text: 'OK' },
        { text: 'Share link', onPress: () => void Share.share({ message: inviteLink(inv.token) }) },
      ]);
    },
    onError: (e: Error) => Alert.alert('Could not invite', e.message),
  });

  const provision = useMutation({
    mutationFn: () => tenancyApi.createMember({ email: email.trim(), password, role }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenancy'] });
      setEmail('');
      setPassword('');
      onClose();
      Alert.alert('Member created', 'They can sign in with the email and password you set.');
    },
    onError: (e: Error) => Alert.alert('Could not create', e.message),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Add a team member">
      <SegmentedTabs
        options={[
          { key: 'invite', label: 'Send invite' },
          { key: 'direct', label: 'Create login' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      {mode === 'direct' ? (
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          hint="They can change it after signing in."
        />
      ) : (
        <Field
          label="Note (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          style={{ minHeight: 64, textAlignVertical: 'top' }}
        />
      )}
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          ROLE
        </AppText>
        <SegmentedTabs
          options={INVITABLE_ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] ?? titleCase(r) }))}
          value={role}
          onChange={setRole}
        />
      </View>
      <ActionButton
        label={mode === 'invite' ? 'Send invite' : 'Create member'}
        disabled={!email.trim() || (mode === 'direct' && password.length < 8)}
        loading={invite.isPending || provision.isPending}
        onPress={() => (mode === 'invite' ? invite.mutate() : provision.mutate())}
      />
    </Sheet>
  );
}

/**
 * Per-member permission editor. Each permission is tri-state: inherit from the
 * role, explicitly grant, or explicitly deny — which is exactly the override
 * model the backend stores and evaluates.
 */
function PermissionsSheet({
  member,
  onClose,
  onChangeRole,
}: {
  member: TeamMember | null;
  onClose: () => void;
  onChangeRole: (args: { id: string; role: string }) => void;
}) {
  const qc = useQueryClient();
  const catalogQ = useQuery({
    queryKey: ['permissions', 'catalog'],
    queryFn: permissionsApi.catalog,
    enabled: !!member,
  });
  const memberQ = useQuery({
    queryKey: ['permissions', 'member', member?.id],
    queryFn: () => permissionsApi.getMember(member!.id),
    enabled: !!member,
  });

  // Server overrides as a map, with the sheet's unsaved edits laid over it.
  // Keyed edits are dropped when a different member is opened (the `edits`
  // key check below) rather than cleared from an effect.
  const [edits, setEdits] = useState<{ memberId: string; map: Record<string, OverrideEffect> } | null>(null);

  const serverOverrides = useMemo(() => {
    const next: Record<string, OverrideEffect> = {};
    for (const o of memberQ.data?.overrides ?? []) next[o.permission] = o.effect;
    return next;
  }, [memberQ.data]);

  const dirty = !!edits && edits.memberId === member?.id;
  const overrides = dirty ? edits.map : serverOverrides;

  const save = useMutation({
    mutationFn: () =>
      permissionsApi.setMember(
        member!.id,
        Object.entries(overrides).map(([permission, effect]) => ({ permission, effect })),
      ),
    onSuccess: () => {
      setEdits(null);
      void qc.invalidateQueries({ queryKey: ['permissions'] });
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not save permissions', e.message),
  });

  const roleDefaults = new Set(memberQ.data?.role_defaults ?? []);

  const cycle = (permission: string) => {
    if (!member) return;
    const next = { ...overrides };
    const current = next[permission];
    if (!current) next[permission] = roleDefaults.has(permission) ? 'deny' : 'grant';
    else if (current === 'grant') next[permission] = 'deny';
    else delete next[permission];
    setEdits({ memberId: member.id, map: next });
  };

  const stateOf = (permission: string): { label: string; tone: 'success' | 'danger' | 'neutral' } => {
    const o = overrides[permission];
    if (o === 'grant') return { label: 'Granted', tone: 'success' };
    if (o === 'deny') return { label: 'Denied', tone: 'danger' };
    return roleDefaults.has(permission)
      ? { label: 'From role', tone: 'success' }
      : { label: 'Not allowed', tone: 'neutral' };
  };

  return (
    <Sheet visible={!!member} onClose={onClose} title={member?.email ?? 'Permissions'}>
      {catalogQ.isLoading || memberQ.isLoading ? (
        <Loading />
      ) : catalogQ.isError ? (
        <QueryError error={catalogQ.error} onRetry={() => void catalogQ.refetch()} />
      ) : (
        <>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="label" tone="muted">
              ROLE
            </AppText>
            <SegmentedTabs
              options={INVITABLE_ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] ?? titleCase(r) }))}
              value={member?.role ?? INVITABLE_ROLES[0]}
              onChange={(r) => member && onChangeRole({ id: member.id, role: r })}
            />
            <AppText variant="caption" tone="faint">
              Changing the role resets what they inherit; overrides below stay.
            </AppText>
          </View>

          {(catalogQ.data?.groups ?? []).map((g) => (
            <View key={g.resource} style={{ gap: spacing.xs }}>
              <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
                {g.label}
              </AppText>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {g.permissions.map((p) => {
                  const s = stateOf(p);
                  return (
                    <ListRow
                      key={p}
                      title={PERMISSION_LABEL[p] ?? p}
                      subtitle={p}
                      onPress={() => cycle(p)}
                      right={<Pill label={s.label} tone={s.tone} />}
                    />
                  );
                })}
              </Card>
            </View>
          ))}

          <AppText variant="caption" tone="faint">
            Tap a permission to cycle: from role → granted → denied → from role.
          </AppText>

          <ActionButton
            label="Save permissions"
            icon="save-outline"
            disabled={!dirty}
            loading={save.isPending}
            onPress={() => save.mutate()}
          />
        </>
      )}
    </Sheet>
  );
}
