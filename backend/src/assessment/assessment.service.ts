import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AnthropometryCalculator, type AnthroMetrics, type Gender } from './anthropometry.calculator';

const IN_TO_CM = 2.54;

export interface MeasurementRow {
  id: string;
  recorded_at: string;
  weight_kg: number | null;
  arm_inches: number | null;
  chest_inches: number | null;
  waist_inches: number | null;
  hip_inches: number | null;
  thigh_inches: number | null;
  notes: string | null;
}

export interface RecordMeasurementInput {
  weight_kg?: number | null;
  arm_inches?: number | null;
  chest_inches?: number | null;
  waist_inches?: number | null;
  hip_inches?: number | null;
  thigh_inches?: number | null;
  notes?: string | null;
}

export interface Assessment {
  profile: { age: number | null; gender: Gender | null; height_cm: number | null; weight_kg: number | null; activity_level: string | null };
  latest_measurement: MeasurementRow | null;
  metrics: AnthroMetrics;
}

interface ClientRow {
  id: string; workspace_id: string | null; age: number | null; gender: string | null;
  height_cm: number | null; activity_level: string | null; last_weight: string | number | null;
}

@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: AnthropometryCalculator,
  ) {}

  // ── Client (self) ───────────────────────────────────────────────
  async forUser(userId: string): Promise<Assessment> {
    return this.assemble(await this.clientByUser(userId));
  }
  async listForUser(userId: string, limit = 30): Promise<MeasurementRow[]> {
    const c = await this.clientByUser(userId);
    return this.listMeasurements(c.id, limit);
  }
  async recordForUser(userId: string, input: RecordMeasurementInput): Promise<Assessment> {
    const c = await this.clientByUser(userId);
    return this.record(c.id, input);
  }

  // ── Owner / nutritionist (by client id, workspace-scoped) ───────
  async forClient(workspaceId: string, clientId: string): Promise<Assessment> {
    return this.assemble(await this.clientInWorkspace(clientId, workspaceId));
  }
  async listForClient(workspaceId: string, clientId: string, limit = 30): Promise<MeasurementRow[]> {
    const c = await this.clientInWorkspace(clientId, workspaceId);
    return this.listMeasurements(c.id, limit);
  }
  async recordForClient(workspaceId: string, clientId: string, input: RecordMeasurementInput): Promise<Assessment> {
    const c = await this.clientInWorkspace(clientId, workspaceId);
    return this.record(c.id, input);
  }

  // ── internals ───────────────────────────────────────────────────
  private async clientByUser(userId: string): Promise<ClientRow> {
    const [c] = await this.prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT id, workspace_id, age, gender::text AS gender, height_cm, activity_level, last_weight
         FROM public.clients WHERE user_id = $1::uuid LIMIT 1`, userId);
    if (!c) throw new NotFoundException('No client profile linked to this user.');
    return c;
  }

  private async clientInWorkspace(clientId: string, workspaceId: string | undefined): Promise<ClientRow> {
    if (!workspaceId) throw new ForbiddenException('No workspace in context.');
    const [c] = await this.prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT id, workspace_id, age, gender::text AS gender, height_cm, activity_level, last_weight
         FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`, clientId, workspaceId);
    if (!c) throw new NotFoundException('Client not found in this workspace.');
    return c;
  }

  private async clientById(clientId: string): Promise<ClientRow> {
    const [c] = await this.prisma.$queryRawUnsafe<ClientRow[]>(
      `SELECT id, workspace_id, age, gender::text AS gender, height_cm, activity_level, last_weight
         FROM public.clients WHERE id = $1::uuid LIMIT 1`, clientId);
    if (!c) throw new NotFoundException('Client not found.');
    return c;
  }

  private async latestMeasurement(clientId: string): Promise<MeasurementRow | null> {
    const [m] = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, recorded_at, arm_inches, chest_inches, waist_inches, hip_inches, thigh_inches, notes
         FROM public.client_measurements WHERE client_id = $1::uuid ORDER BY recorded_at DESC LIMIT 1`, clientId);
    return m ? normalizeMeasurement(m) : null;
  }

  private async listMeasurements(clientId: string, limit: number): Promise<MeasurementRow[]> {
    const lim = Math.min(200, Math.max(1, limit));
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, recorded_at, arm_inches, chest_inches, waist_inches, hip_inches, thigh_inches, notes
         FROM public.client_measurements WHERE client_id = $1::uuid ORDER BY recorded_at DESC LIMIT ${lim}`, clientId);
    return rows.map(normalizeMeasurement);
  }

  private async assemble(client: ClientRow): Promise<Assessment> {
    const latest = await this.latestMeasurement(client.id);
    const weight = num(client.last_weight);
    const metrics = this.calc.compute({
      weight_kg: weight,
      height_cm: client.height_cm ?? null,
      age: client.age ?? null,
      gender: (client.gender as Gender | null) ?? null,
      activity_level: client.activity_level ?? null,
      waist_cm: cm(latest?.waist_inches),
      hip_cm: cm(latest?.hip_inches),
      neck_cm: null, // neck circumference not yet captured — body-fat unlocks when it is
    });
    return {
      profile: { age: client.age ?? null, gender: (client.gender as Gender | null) ?? null, height_cm: client.height_cm ?? null, weight_kg: weight, activity_level: client.activity_level ?? null },
      latest_measurement: latest,
      metrics,
    };
  }

  private async record(clientId: string, input: RecordMeasurementInput): Promise<Assessment> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.client_measurements
         (client_id, arm_inches, chest_inches, waist_inches, hip_inches, thigh_inches, notes)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
      clientId,
      input.arm_inches ?? null, input.chest_inches ?? null, input.waist_inches ?? null,
      input.hip_inches ?? null, input.thigh_inches ?? null,
      input.notes ? input.notes.slice(0, 500) : null);

    // Weight lives on the client profile (there's no per-row weight column yet);
    // keep it fresh so BMI/BMR reflect the latest reading.
    if (input.weight_kg != null && input.weight_kg > 0) {
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.clients SET last_weight = $2 WHERE id = $1::uuid`, clientId, input.weight_kg);
    }
    return this.assemble(await this.clientById(clientId));
  }
}

// ─── helpers ──────────────────────────────────────────────────────
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function cm(inches: number | null | undefined): number | null {
  return inches == null ? null : Math.round(inches * IN_TO_CM * 100) / 100;
}
function normalizeMeasurement(m: Record<string, unknown>): MeasurementRow {
  return {
    id: String(m.id),
    recorded_at: m.recorded_at instanceof Date ? m.recorded_at.toISOString() : String(m.recorded_at),
    weight_kg: null,
    arm_inches: num(m.arm_inches),
    chest_inches: num(m.chest_inches),
    waist_inches: num(m.waist_inches),
    hip_inches: num(m.hip_inches),
    thigh_inches: num(m.thigh_inches),
    notes: (m.notes as string) ?? null,
  };
}
