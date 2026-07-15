import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export type VerificationStatus = 'unsubmitted' | 'pending' | 'verified' | 'rejected';

export interface VerificationDoc {
  type: string;
  file_name: string;
  storage_key: string;
}

export interface WorkspaceVerification {
  workspace_id: string;
  status: VerificationStatus;
  legal_name: string | null;
  professional_title: string | null;
  qualifications: string | null;
  registration_number: string | null;
  experience_years: number | null;
  pan: string | null;
  gstin: string | null;
  documents: VerificationDoc[];
  review_notes: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
}

export interface VerificationSubmission {
  legal_name?: string;
  professional_title?: string;
  qualifications?: string;
  registration_number?: string;
  experience_years?: number;
  pan?: string;
  gstin?: string;
  documents?: VerificationDoc[];
}

const BUCKET = 'client-files';
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

interface Row {
  workspace_id: string;
  status: string;
  legal_name: string | null;
  professional_title: string | null;
  qualifications: string | null;
  registration_number: string | null;
  experience_years: number | null;
  pan: string | null;
  gstin: string | null;
  documents: unknown;
  review_notes: string | null;
  reviewed_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
}

/**
 * Practitioner verification. A workspace owner submits their professional and
 * compliance data (+ supporting documents); a SIRAH LIFE super admin reviews
 * and marks it verified or rejected. Format checks run on submit; the rest is
 * a manual review queue (no third-party KYC vendor wired yet).
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Owner side ──────────────────────────────────────────────────────

  async getForWorkspace(workspaceId: string): Promise<WorkspaceVerification> {
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT workspace_id, status, legal_name, professional_title, qualifications,
              registration_number, experience_years, pan, gstin, documents,
              review_notes, reviewed_at, created_at, updated_at
         FROM public.workspace_verifications
        WHERE workspace_id = $1::uuid
        LIMIT 1`,
      workspaceId,
    );
    if (!row) {
      return {
        workspace_id: workspaceId,
        status: 'unsubmitted',
        legal_name: null, professional_title: null, qualifications: null,
        registration_number: null, experience_years: null, pan: null, gstin: null,
        documents: [], review_notes: null, reviewed_at: null, submitted_at: null,
      };
    }
    return this.toView(row);
  }

  /**
   * Create a placeholder 'unsubmitted' row when a workspace is created, so it
   * surfaces in the super-admin queue as "Awaiting submission" immediately —
   * before the owner submits any credentials. Idempotent: never clobbers an
   * existing row (e.g. one that's already pending/verified).
   */
  async initForWorkspace(workspaceId: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.workspace_verifications (workspace_id, status, updated_at)
       VALUES ($1::uuid, 'unsubmitted', now())
       ON CONFLICT (workspace_id) DO NOTHING`,
      workspaceId,
    );
  }

  async submit(
    workspaceId: string,
    userId: string,
    input: VerificationSubmission,
  ): Promise<WorkspaceVerification> {
    const pan = input.pan?.trim().toUpperCase() || null;
    const gstin = input.gstin?.trim().toUpperCase() || null;
    if (pan && !PAN_RE.test(pan)) {
      throw new BadRequestException('PAN must look like ABCDE1234F.');
    }
    if (gstin && !GSTIN_RE.test(gstin)) {
      throw new BadRequestException('GSTIN must be a valid 15-character GST number.');
    }
    const docs = Array.isArray(input.documents)
      ? input.documents
          .filter((d) => d && d.storage_key && d.file_name)
          .slice(0, 12)
          .map((d) => ({ type: String(d.type || 'document').slice(0, 40), file_name: String(d.file_name).slice(0, 200), storage_key: String(d.storage_key) }))
      : [];

    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `INSERT INTO public.workspace_verifications
         (workspace_id, submitted_by, status, legal_name, professional_title,
          qualifications, registration_number, experience_years, pan, gstin,
          documents, review_notes, reviewed_by, reviewed_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'pending', $3, $4, $5, $6, $7::int, $8, $9,
               $10::jsonb, NULL, NULL, NULL, now())
       ON CONFLICT (workspace_id) DO UPDATE SET
         submitted_by        = EXCLUDED.submitted_by,
         status              = 'pending',
         legal_name          = EXCLUDED.legal_name,
         professional_title  = EXCLUDED.professional_title,
         qualifications      = EXCLUDED.qualifications,
         registration_number = EXCLUDED.registration_number,
         experience_years    = EXCLUDED.experience_years,
         pan                 = EXCLUDED.pan,
         gstin               = EXCLUDED.gstin,
         documents           = EXCLUDED.documents,
         review_notes        = NULL,
         reviewed_by         = NULL,
         reviewed_at         = NULL,
         updated_at          = now()
       RETURNING workspace_id, status, legal_name, professional_title, qualifications,
                 registration_number, experience_years, pan, gstin, documents,
                 review_notes, reviewed_at, created_at, updated_at`,
      workspaceId,
      userId,
      input.legal_name?.trim() || null,
      input.professional_title?.trim() || null,
      input.qualifications?.trim() || null,
      input.registration_number?.trim() || null,
      Number.isFinite(input.experience_years as number) ? Math.trunc(input.experience_years as number) : null,
      pan,
      gstin,
      JSON.stringify(docs),
    );
    // Alert platform super-admins that a workspace submitted KYC for review.
    void this.notifications.notifySuperAdmins(workspaceId, {
      type: 'verification:submitted',
      title: '📋 Verification submitted',
      body: `${input.legal_name?.trim() || 'A practitioner'} submitted verification documents for review.`,
      url: '/admin/verifications',
      tag: `verification-${workspaceId}`,
    });
    return this.toView(row);
  }

  async createDocUploadTicket(
    workspaceId: string,
    fileName: string,
  ): Promise<{ uploadUrl: string; storageKey: string; token: string }> {
    const safe = (fileName || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const key = `verification/${workspaceId}/${Date.now()}-${randomBytes(6).toString('hex')}-${safe}`;
    return this.uploadTicket(key);
  }

  // ── Super admin side ────────────────────────────────────────────────

  async list(status?: string): Promise<Array<WorkspaceVerification & { workspace_name: string | null }>> {
    const filter = status && ['unsubmitted', 'pending', 'verified', 'rejected'].includes(status) ? status : null;
    const rows = await this.prisma.$queryRawUnsafe<Array<Row & { workspace_name: string | null }>>(
      `SELECT v.workspace_id, v.status, v.legal_name, v.professional_title, v.qualifications,
              v.registration_number, v.experience_years, v.pan, v.gstin, v.documents,
              v.review_notes, v.reviewed_at, v.created_at, v.updated_at,
              w.name AS workspace_name
         FROM public.workspace_verifications v
         LEFT JOIN public.workspaces w ON w.id = v.workspace_id
        WHERE ($1::text IS NULL OR v.status = $1)
        ORDER BY (v.status = 'pending') DESC, (v.status = 'unsubmitted') DESC, v.updated_at DESC
        LIMIT 200`,
      filter,
    );
    return rows.map((r) => ({ ...this.toView(r), workspace_name: r.workspace_name }));
  }

  async decide(
    workspaceId: string,
    reviewerId: string,
    decision: 'verified' | 'rejected',
    notes?: string,
  ): Promise<WorkspaceVerification> {
    // Can't approve/reject a workspace whose owner hasn't submitted anything yet.
    const current = await this.getForWorkspace(workspaceId);
    if (current.status === 'unsubmitted') {
      throw new BadRequestException(
        'This workspace has not submitted verification details yet — nothing to review.',
      );
    }
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE public.workspace_verifications
          SET status = $1, review_notes = $2, reviewed_by = $3::uuid, reviewed_at = now(), updated_at = now()
        WHERE workspace_id = $4::uuid
       RETURNING workspace_id, status, legal_name, professional_title, qualifications,
                 registration_number, experience_years, pan, gstin, documents,
                 review_notes, reviewed_at, created_at, updated_at`,
      decision,
      notes?.trim() || null,
      reviewerId,
      workspaceId,
    );
    if (!row) throw new NotFoundException('No verification submission for that workspace.');
    return this.toView(row);
  }

  async signDocument(workspaceId: string, docIndex: number): Promise<{ url: string; expiresInSeconds: number }> {
    const view = await this.getForWorkspace(workspaceId);
    const doc = view.documents[docIndex];
    if (!doc) throw new NotFoundException('Document not found.');
    return this.signObject(doc.storage_key);
  }

  // ── Storage helpers (self-contained; Supabase signed up/download) ────

  private async uploadTicket(key: string): Promise<{ uploadUrl: string; storageKey: string; token: string }> {
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const serviceKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    const resp = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/${BUCKET}/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}` },
    });
    if (!resp.ok) {
      this.logger.warn(`Sign upload failed: ${resp.status} ${await resp.text()}`);
      throw new BadRequestException('Could not prepare upload.');
    }
    const json = (await resp.json()) as { url?: string; token?: string };
    if (!json.url || !json.token) throw new BadRequestException('Storage did not return a signed upload URL.');
    const fullUrl = json.url.startsWith('http')
      ? json.url
      : `${supabaseUrl}/storage/v1${json.url.startsWith('/') ? '' : '/'}${json.url}`;
    return { uploadUrl: fullUrl, storageKey: key, token: json.token };
  }

  private async signObject(key: string): Promise<{ url: string; expiresInSeconds: number }> {
    const expiresInSeconds = 60 * 10;
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const serviceKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    const path = key.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/[^/]+\//, '').replace(new RegExp(`^${BUCKET}/`), '');
    const resp = await fetch(`${supabaseUrl}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!resp.ok) throw new BadRequestException('Could not sign document URL.');
    const json = (await resp.json()) as { signedURL?: string; signedUrl?: string };
    const signed = json.signedURL ?? json.signedUrl;
    if (!signed) throw new BadRequestException('Storage returned no URL.');
    return { url: `${supabaseUrl}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`, expiresInSeconds };
  }

  private toView(r: Row): WorkspaceVerification {
    let docs: VerificationDoc[] = [];
    try {
      docs = Array.isArray(r.documents) ? (r.documents as VerificationDoc[]) : JSON.parse(String(r.documents ?? '[]'));
    } catch { docs = []; }
    return {
      workspace_id: r.workspace_id,
      status: (r.status as VerificationStatus) ?? 'pending',
      legal_name: r.legal_name,
      professional_title: r.professional_title,
      qualifications: r.qualifications,
      registration_number: r.registration_number,
      experience_years: r.experience_years != null ? Number(r.experience_years) : null,
      pan: r.pan,
      gstin: r.gstin,
      documents: docs,
      review_notes: r.review_notes,
      reviewed_at: r.reviewed_at ? r.reviewed_at.toISOString() : null,
      submitted_at: r.created_at ? r.created_at.toISOString() : null,
    };
  }
}
