import {
  BadRequestException, ConflictException, GoneException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'node:crypto';
import { AuthCacheService } from '../auth/auth-cache.service';
import { ClientsService } from '../clients/clients.service';
import { skipScheduled } from '../common/schedulers';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { TrialService } from '../billing/trial.service';
import { MealSlotsService } from '../meal-plans/meal-slots.service';
import { VerificationService } from '../verification/verification.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  SECTION_KEYS, cleanSection, emptySections, hasAnyValue, type SectionKey, type SectionState,
} from './sections';

export type OnboardingStatus = 'invited' | 'opened' | 'in_progress' | 'submitted' | 'changes' | 'approved' | 'cancelled';

interface Row {
  id: string;
  token: string;
  name: string;
  email: string;
  phone: string | null;
  plan_key: string;
  status: OnboardingStatus;
  sections: Record<SectionKey, SectionState>;
  changes_section: string | null;
  changes_note: string | null;
  activity: Array<{ at: string; text: string }>;
  user_id: string | null;
  workspace_id: string | null;
  expires_at: Date;
  opened_at: Date | null;
  submitted_at: Date | null;
  approved_at: Date | null;
  last_activity_at: Date;
  created_at: Date;
}

const PLANS = ['trial', 'starter', 'growth', 'scale_pro'];
const LINK_DAYS = 7;
const DELAY_MINUTES = 30;

/**
 * Guided practice onboarding. A super admin creates a personal link; the
 * nutritionist fills six sections at their own pace (autosaved); the admin sees
 * each section's status live, approves, and only then is the practice created
 * and its trial started, for however many days the super admin has configured.
 */
@Injectable()
export class PracticeOnboardingService {
  private readonly logger = new Logger(PracticeOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly workspaces: WorkspacesService,
    private readonly mealSlots: MealSlotsService,
    private readonly verification: VerificationService,
    private readonly clients: ClientsService,
    private readonly mail: MailService,
    private readonly authCache: AuthCacheService,
    private readonly trials: TrialService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Super admin
  // ─────────────────────────────────────────────────────────────────

  async create(adminId: string, input: { name: string; email: string; phone?: string; plan?: string }) {
    const name = input.name.trim().slice(0, 120);
    const email = input.email.trim().toLowerCase().slice(0, 160);
    const plan = PLANS.includes(input.plan ?? '') ? input.plan! : 'trial';
    const token = randomBytes(9).toString('base64url');
    const sections = emptySections();
    // What the admin already knows is pre-filled in the account section.
    sections.account.data = { name, email, phone: (input.phone ?? '').replace(/[^\d+]/g, '') };
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `INSERT INTO public.practice_onboarding (token, name, email, phone, plan_key, sections, created_by, expires_at, activity)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::uuid, now() + ($8 || ' days')::interval,
               jsonb_build_array(jsonb_build_object('at', now(), 'text', 'Link created')))
       RETURNING *`,
      token, name, email, input.phone?.trim() || null, plan, JSON.stringify(sections), adminId, String(LINK_DAYS),
    );
    return this.toAdmin(row);
  }

  async list() {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT * FROM public.practice_onboarding WHERE status <> 'cancelled' ORDER BY last_activity_at DESC LIMIT 200`,
    );
    return rows.map((r) => this.toAdmin(r));
  }

  async detail(id: string) {
    return this.toAdmin(await this.byId(id));
  }

  /** Give a few more days to a link that's about to run out (or already did). */
  async extend(id: string) {
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE public.practice_onboarding
          SET expires_at = GREATEST(expires_at, now()) + ($2 || ' days')::interval,
              activity = activity || jsonb_build_object('at', now(), 'text', 'Link extended by ${LINK_DAYS} days'),
              updated_at = now()
        WHERE id = $1::uuid AND status NOT IN ('approved', 'cancelled') RETURNING *`,
      id, String(LINK_DAYS),
    );
    if (!row) throw new NotFoundException('Onboarding not found or already finished');
    return this.toAdmin(row);
  }

  async cancel(id: string) {
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE public.practice_onboarding SET status = 'cancelled', updated_at = now()
        WHERE id = $1::uuid AND status <> 'approved' RETURNING *`,
      id,
    );
    if (!row) throw new NotFoundException('Onboarding not found or already approved');
    return { cancelled: true };
  }

  async requestChanges(id: string, adminId: string, section: string, note: string) {
    if (!(SECTION_KEYS as readonly string[]).includes(section)) throw new BadRequestException('Unknown section');
    const row = await this.byId(id);
    if (row.status !== 'submitted') throw new ConflictException('Only a submitted onboarding can be sent back for changes.');
    const sections = { ...row.sections, [section]: { ...row.sections[section as SectionKey], status: 'in_progress' } };
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.practice_onboarding
          SET status = 'changes', sections = $2::jsonb, changes_section = $3, changes_note = $4,
              activity = activity || jsonb_build_object('at', now(), 'text', $5::text),
              last_activity_at = now(), updated_at = now()
        WHERE id = $1::uuid`,
      id, JSON.stringify(sections), section, note.trim().slice(0, 400), `Changes requested: ${section}`,
    );
    void this.mail.send({
      to: row.email,
      subject: 'One thing to fix in your NUSI setup',
      html: this.email(row.name, `Our team checked your details and needs one change:<br><br><b>${escapeHtml(note)}</b><br><br>Open your setup link, fix it and submit again.`, this.link(row.token), 'Open my setup'),
    });
    void adminId;
    return this.detail(id);
  }

  /**
   * Create the practice from the submitted sections and start its 14-day
   * trial now. Every extra (logo, meal times, verification, client list) is
   * best-effort: a failure there is logged on the onboarding, never blocks.
   */
  async approve(id: string, adminId: string) {
    const row = await this.byId(id);
    if (row.status === 'approved') return this.toAdmin(row);
    if (row.status !== 'submitted') throw new ConflictException('Only a submitted onboarding can be approved.');
    if (!row.user_id) throw new ConflictException('The nutritionist has not created their account yet.');

    const s = row.sections;
    const acc = s.account.data as { name: string; email: string; phone: string };
    const pr = s.practice.data as { practice_name: string; city: string; state: string; experience_years: number; specializations: string[] };
    const br = s.branding.data as { tagline: string; logo: string | null };
    const ml = s.meals.data as { slots: Array<{ slot: string; label: string }> };
    const cl = s.clients.data as { rows: Array<{ name: string; email: string; phone: string }> };
    const bi = s.billing.data as { pan: string; gstin: string; address: string };

    const ws = await this.workspaces.createForOwner(row.user_id, {
      name: pr.practice_name,
      contact_email: acc.email,
      contact_phone: acc.phone,
      city: pr.city,
      state: pr.state,
      country_code: 'IN',
      pan: bi.pan,
      gstin: bi.gstin || undefined,
      specializations: pr.specializations,
    });
    const notes: string[] = [];
    // The trial starts at approval, not at sign-up.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.workspaces
          SET trial_ends_at = now() + ($2 || ' days')::interval, tagline = $3, logo_url = COALESCE($4, logo_url), updated_at = now()
        WHERE id = $1::uuid`,
      ws.id, String(await this.trials.trialDays()), br.tagline || null, br.logo,
    );
    try {
      await this.mealSlots.set(ws.id, ml.slots.map((x) => ({ slot: x.slot, label: x.label || undefined })));
    } catch (err) { notes.push(`Meal times not saved: ${(err as Error).message}`); }
    try {
      await this.verification.submit(ws.id, row.user_id, {
        legal_name: acc.name, pan: bi.pan, gstin: bi.gstin || undefined, experience_years: pr.experience_years,
      });
    } catch (err) { notes.push(`Verification not submitted: ${(err as Error).message}`); }
    if (cl.rows?.length) {
      try {
        const r = await this.clients.importClients(ws.id, row.user_id, cl.rows);
        notes.push(`Imported ${r.created} of ${r.total} clients as invites`);
      } catch (err) { notes.push(`Client list not imported: ${(err as Error).message}`); }
    }
    await this.authCache.invalidate(row.user_id);

    const log = [{ text: 'Approved · 14-day trial started' }, ...notes.map((text) => ({ text }))];
    const [done] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE public.practice_onboarding
          SET status = 'approved', workspace_id = $2::uuid, approved_by = $3::uuid, approved_at = now(),
              changes_section = NULL, changes_note = NULL,
              activity = activity || (SELECT jsonb_agg(jsonb_build_object('at', now(), 'text', x->>'text')) FROM jsonb_array_elements($4::jsonb) x),
              last_activity_at = now(), updated_at = now()
        WHERE id = $1::uuid RETURNING *`,
      id, ws.id, adminId, JSON.stringify(log),
    );
    void this.mail.send({
      to: row.email,
      subject: 'You’re approved: your NUSI trial has started',
      html: this.email(row.name, `Your practice <b>${escapeHtml(pr.practice_name)}</b> is approved. Your 14-day free trial starts today, with every feature unlocked.`, `${this.base()}/auth?role=pro&email=${encodeURIComponent(acc.email)}`, 'Open my dashboard'),
    });
    return this.toAdmin(done);
  }

  // ─────────────────────────────────────────────────────────────────
  // The nutritionist (by token)
  // ─────────────────────────────────────────────────────────────────

  async open(token: string) {
    const row = await this.byToken(token);
    if (row.status === 'invited') {
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.practice_onboarding
            SET status = 'opened', opened_at = now(), last_activity_at = now(), updated_at = now(),
                activity = activity || jsonb_build_object('at', now(), 'text', 'Opened the link')
          WHERE id = $1::uuid AND status = 'invited'`,
        row.id,
      );
      row.status = 'opened';
    }
    return await this.toPublic(row);
  }

  /**
   * Save one section. `complete: false` is an autosave (keeps it "in
   * progress"); `complete: true` asks to mark it done and fails with the list
   * of what's missing. The account section also creates the login.
   */
  async saveSection(token: string, key: SectionKey, raw: Record<string, unknown>, complete: boolean, password?: string) {
    const row = await this.byToken(token);
    this.assertEditable(row);
    const { data, missing } = cleanSection(key, raw);

    let userId = row.user_id;
    if (key === 'account' && complete) {
      if (!missing.length) userId = await this.ensureLogin(row, data as { name: string; email: string; phone: string }, password);
    }
    if (complete && missing.length) {
      throw new BadRequestException({ message: `Still needed: ${missing.join(', ')}`, missing });
    }
    if (key === 'account' && complete && !userId) {
      throw new BadRequestException({ message: 'Choose a password of at least 8 characters.', missing: ['Password'] });
    }

    const status = complete ? 'done' : hasAnyValue(data) ? 'in_progress' : 'none';
    const prev = row.sections[key]?.status;
    const sections = { ...row.sections, [key]: { status, data, updated_at: new Date().toISOString() } };
    const nextStatus: OnboardingStatus = row.status === 'changes' ? 'changes' : 'in_progress';
    const text = status === 'done' && prev !== 'done' ? `${LABEL[key]} completed` : null;
    const [saved] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE public.practice_onboarding
          SET sections = $2::jsonb, status = $3, user_id = COALESCE($4::uuid, user_id),
              activity = CASE WHEN $5::text IS NULL THEN activity ELSE activity || jsonb_build_object('at', now(), 'text', $5::text) END,
              last_activity_at = now(), updated_at = now()
        WHERE id = $1::uuid RETURNING *`,
      row.id, JSON.stringify(sections), nextStatus, userId, text,
    );
    return await this.toPublic(saved);
  }

  async submit(token: string) {
    const row = await this.byToken(token);
    this.assertEditable(row);
    const notDone = SECTION_KEYS.filter((k) => row.sections[k]?.status !== 'done');
    if (notDone.length) throw new BadRequestException(`Finish these sections first: ${notDone.map((k) => LABEL[k]).join(', ')}`);
    const [saved] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE public.practice_onboarding
          SET status = 'submitted', submitted_at = now(), delay_notified_at = NULL, changes_section = NULL, changes_note = NULL,
              activity = activity || jsonb_build_object('at', now(), 'text', 'Submitted for approval'),
              last_activity_at = now(), updated_at = now()
        WHERE id = $1::uuid RETURNING *`,
      row.id,
    );
    void this.tellAdmins(saved);
    return await this.toPublic(saved);
  }

  /** For the sign-in redirect: an unaffiliated user still in guided onboarding. */
  async openSetupForUser(userId: string): Promise<{ token: string; status: OnboardingStatus } | null> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ token: string; status: OnboardingStatus }>>(
      `SELECT token, status FROM public.practice_onboarding
        WHERE user_id = $1::uuid AND status IN ('opened', 'in_progress', 'submitted', 'changes')
        ORDER BY last_activity_at DESC LIMIT 1`,
      userId,
    );
    return row ?? null;
  }

  /** "Still checking" message when approval takes longer than 30 minutes. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async nudgeSlowApprovals(): Promise<void> {
    if (skipScheduled(this.logger, 'practiceOnboardingDelay')) return;
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE public.practice_onboarding
          SET delay_notified_at = now()
        WHERE status = 'submitted' AND delay_notified_at IS NULL
          AND submitted_at < now() - ($1 || ' minutes')::interval
        RETURNING *`,
      String(DELAY_MINUTES),
    );
    for (const r of rows) {
      void this.mail.send({
        to: r.email,
        subject: 'We’re still checking your NUSI details',
        html: this.email(r.name, 'Thanks for your patience. Our team is still checking your practice details. You don’t need to keep the page open: we’ll email you as soon as your trial is active.', this.link(r.token), 'Check status'),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  private assertEditable(row: Row): void {
    if (row.status === 'approved') throw new ConflictException('This practice is already approved. Sign in to NUSI.');
    if (row.status === 'submitted') throw new ConflictException('Submitted. We’re checking your details.');
  }

  /** Create the nutritionist's login once; later saves can change the password. */
  private async ensureLogin(row: Row, acc: { name: string; email: string; phone: string }, password?: string): Promise<string | null> {
    const pw = (password ?? '').trim();
    if (row.user_id) {
      if (pw) {
        if (pw.length < 8) throw new BadRequestException({ message: 'Password must be at least 8 characters.', missing: ['Password'] });
        await this.supabaseAdmin(`/auth/v1/admin/users/${row.user_id}`, { method: 'PUT', body: JSON.stringify({ password: pw }) });
      }
      return row.user_id;
    }
    if (pw.length < 8) return null;
    try {
      const res = (await this.supabaseAdmin('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: acc.email, password: pw, email_confirm: true, user_metadata: { full_name: acc.name, phone: acc.phone } }),
      })) as { id: string };
      return res.id;
    } catch (err) {
      if (/already (been )?registered|exists|has already/i.test((err as Error).message)) {
        throw new ConflictException({ message: 'This email already has a NUSI account. Use another email, or ask NUSI to help.', missing: ['Email'] });
      }
      throw err;
    }
  }

  private async tellAdmins(row: Row): Promise<void> {
    try {
      const admins = await this.prisma.$queryRawUnsafe<Array<{ email: string }>>(
        `SELECT DISTINCT u.email FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
          WHERE r.role::text = 'super_admin' AND u.email IS NOT NULL`,
      );
      const practice = (row.sections.practice?.data as { practice_name?: string })?.practice_name ?? row.name;
      await Promise.allSettled(admins.map((a) => this.mail.send({
        to: a.email,
        subject: `Ready to approve: ${practice}`,
        html: this.email('team', `<b>${escapeHtml(row.name)}</b> (${escapeHtml(practice)}) finished all 6 onboarding sections and is waiting on the "Checking your details" screen.`, `${this.base()}/admin/onboarding`, 'Review and approve'),
      })));
    } catch (err) {
      this.logger.warn(`tellAdmins failed: ${(err as Error).message}`);
    }
  }

  private async byId(id: string): Promise<Row> {
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM public.practice_onboarding WHERE id = $1::uuid`, id);
    if (!row) throw new NotFoundException('Onboarding not found');
    return row;
  }

  private async byToken(token: string): Promise<Row> {
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) throw new NotFoundException('This setup link is not valid.');
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM public.practice_onboarding WHERE token = $1`, token);
    if (!row || row.status === 'cancelled') throw new NotFoundException('This setup link is not valid. Ask NUSI for a new one.');
    if (row.status !== 'approved' && row.status !== 'submitted' && new Date(row.expires_at).getTime() < Date.now()) {
      throw new GoneException('This setup link has expired. Ask NUSI to send a new one.');
    }
    return row;
  }

  private base(): string {
    return (this.config.get<string>('PUBLIC_APP_URL') ?? 'https://nusi.in').replace(/\/$/, '');
  }

  private link(token: string): string {
    return `${this.base()}/setup/${token}`;
  }

  private sectionSummary(row: Row) {
    return SECTION_KEYS.map((k) => ({ key: k, label: LABEL[k], status: row.sections[k]?.status ?? 'none', updated_at: row.sections[k]?.updated_at ?? null }));
  }

  private toAdmin(row: Row) {
    const expired = !['approved', 'submitted', 'cancelled'].includes(row.status) && new Date(row.expires_at).getTime() < Date.now();
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      plan_key: row.plan_key,
      status: row.status,
      expired,
      link: this.link(row.token),
      practice_name: (row.sections.practice?.data as { practice_name?: string })?.practice_name || null,
      sections: this.sectionSummary(row),
      done_count: SECTION_KEYS.filter((k) => row.sections[k]?.status === 'done').length,
      section_data: Object.fromEntries(SECTION_KEYS.map((k) => [k, row.sections[k]?.data ?? {}])),
      changes: row.changes_section ? { section: row.changes_section, note: row.changes_note } : null,
      activity: row.activity ?? [],
      workspace_id: row.workspace_id,
      expires_at: row.expires_at,
      opened_at: row.opened_at,
      submitted_at: row.submitted_at,
      approved_at: row.approved_at,
      last_activity_at: row.last_activity_at,
      created_at: row.created_at,
    };
  }

  private async toPublic(row: Row) {
    return {
      name: row.name,
      email: row.email,
      status: row.status,
      has_login: !!row.user_id,
      sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, { status: row.sections[k]?.status ?? 'none', data: row.sections[k]?.data ?? {} }])),
      changes: row.changes_section ? { section: row.changes_section, note: row.changes_note } : null,
      expires_at: row.expires_at,
      trial_days: await this.trials.trialDays(),
    };
  }

  private email(name: string, body: string, href: string, cta: string): string {
    return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1b241d">
      <div style="background:#123a0b;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-weight:700;font-size:18px">NUSI</div>
      <div style="border:1px solid #e3e8e1;border-top:0;border-radius:0 0 12px 12px;padding:22px;line-height:1.6;font-size:15px">
        <p>Hi ${escapeHtml(name)},</p><p>${body}</p>
        <p><a href="${href}" style="display:inline-block;background:#3f9b0b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${cta}</a></p>
        <p style="color:#8a948d;font-size:13px">NUSI by Sirah Digital</p></div></div>`;
  }

  private async supabaseAdmin(path: string, init: RequestInit = {}): Promise<unknown> {
    const url = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) ?? {}) },
    });
    const text = await res.text();
    let json: unknown;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!res.ok) {
      const o = json as { msg?: string; message?: string; error_description?: string };
      throw new BadRequestException(`Account service ${res.status}: ${o?.msg || o?.message || o?.error_description || text}`);
    }
    return json;
  }
}

const LABEL: Record<SectionKey, string> = {
  account: 'Your account',
  practice: 'Practice details',
  branding: 'Branding',
  meals: 'Meal times',
  clients: 'Your clients',
  billing: 'Billing & verification',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
