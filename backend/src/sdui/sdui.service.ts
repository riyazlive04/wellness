/**
 * Server-driven UI — resolution and authoring.
 *
 * Read path (device):  client → workspace → published rows → defaults for the
 *                      gaps → prune by plan → hash → bundle.
 * Write path (editor): validate → draft → (publish) → history row.
 *
 * The read path never trusts what is in the database. Rows outlive the code
 * that wrote them: a tree that was legal when it was published can be sitting
 * in Postgres after a rule tightened, after a route was renamed, after a
 * feature key was retired. So everything loaded is re-validated, and anything
 * that now fails quietly falls back to the built-in default for that screen —
 * a workspace gets the stock app, never a broken one.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';

import { resolveWorkspacePlan } from '../billing/resolve-plan';
import { featuresForPlan } from '../common/features';
import { PrismaService } from '../database/prisma.service';
import { defaultScreen, DEFAULTS_VERSION } from './sdui.defaults';
import { SCREEN_KEYS, SCHEMA_VERSION, type ScreenKey, type UiBundle, type UiScreen } from './sdui.types';
import { pruneForFeatures, validateScreen, type ValidationError } from './sdui.validator';

interface LayoutRow {
  screen: string;
  draft: unknown;
  published: unknown;
  published_revision: number;
  schema_version: number;
  published_at: string | null;
  updated_at: string | null;
}

export interface EditorLayout {
  screen: ScreenKey;
  /** The tree the editor should open — draft if present, else published, else default. */
  tree: UiScreen;
  /** Which of the three `tree` came from. Drives the editor's status chip. */
  origin: 'draft' | 'published' | 'default';
  hasDraft: boolean;
  isPublished: boolean;
  publishedRevision: number;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface LayoutVersion {
  revision: number;
  note: string | null;
  published_at: string;
  published_by: string | null;
}

@Injectable()
export class SduiService {
  private readonly logger = new Logger(SduiService.name);

  /**
   * Set the first time the layouts table cannot be read, so the warning is
   * logged once rather than on every request from every client.
   */
  private layoutsUnavailable = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read the published layout rows, tolerating the table not being there.
   *
   * The SDUI tables arrive in a migration, and a backend deploy can reach an
   * environment before that migration does. Without this the endpoint 500s on
   * every request until someone notices. With it, the workspace simply gets the
   * built-in layouts — which is what it would get anyway before anybody has
   * published — and one line says why.
   *
   * This also covers the table being dropped, permissions changing, or the
   * database being briefly unreachable. In every one of those cases the right
   * answer is the stock app, not an error.
   */
  private async readPublishedRows<T>(workspaceId: string, sql: string): Promise<T[]> {
    try {
      return await this.prisma.$queryRawUnsafe<T[]>(sql, workspaceId);
    } catch (err) {
      if (!this.layoutsUnavailable) {
        this.layoutsUnavailable = true;
        this.logger.warn(
          `[sdui] Cannot read workspace_ui_layouts (${(err as Error).message}). ` +
            'Serving built-in layouts. Has 20260923120000_workspace_ui_layouts.sql been applied?',
        );
      }
      return [];
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Read path — what devices get
  // ────────────────────────────────────────────────────────────────

  /**
   * The full UI bundle for the caller's client account.
   *
   * All four screens travel together in one request. Fetching them separately
   * would mean a cold launch racing four round-trips before it can draw the tab
   * bar, and it would let a device end up with a home screen from one revision
   * and a tab bar from the next.
   */
  async bundleForUser(userId: string): Promise<UiBundle> {
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ workspace_id: string | null }>>(
      `SELECT workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );

    // No client row yet (invited but not linked): the stock app is correct.
    if (!client?.workspace_id) return this.bundleFrom({}, [], fingerprint('', []));

    const plan = await resolveWorkspacePlan(this.prisma, client.workspace_id);
    const features = featuresForPlan(plan);

    const rows = await this.readPublishedRows<LayoutRow>(
      client.workspace_id,
      `SELECT screen, published, published_revision, schema_version
         FROM public.workspace_ui_layouts
        WHERE workspace_id = $1::uuid AND published IS NOT NULL`,
    );

    const etag = fingerprint(
      plan,
      rows.map((r) => [r.screen, r.published_revision] as const),
    );

    const published: Partial<Record<ScreenKey, UiScreen>> = {};
    for (const row of rows) {
      const key = row.screen as ScreenKey;
      if (!SCREEN_KEYS.includes(key)) continue;

      // A tree authored against a newer schema than this server knows is not
      // something to guess at — serve the default instead.
      if (row.schema_version > SCHEMA_VERSION) {
        this.logger.warn(
          `[sdui] ${client.workspace_id}/${key} targets schema v${row.schema_version}; serving default.`,
        );
        continue;
      }

      const check = validateScreen(row.published, key);
      if (!check.ok || !check.value) {
        this.logger.error(
          `[sdui] Published ${key} for workspace ${client.workspace_id} no longer validates ` +
            `(${check.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join('; ')}). Serving default.`,
        );
        continue;
      }
      published[key] = { ...check.value, revision: row.published_revision };
    }

    return this.bundleFrom(published, features, etag);
  }

  /**
   * The bundle's ETag WITHOUT building the bundle.
   *
   * The served payload is a pure function of (defaults, published trees, plan,
   * schema version), so a hash of those inputs identifies it exactly. That
   * matters because the app polls this on an interval and on every foreground:
   * hashing the rendered payload instead would make a "cheap" few-byte response
   * cost a full load-validate-prune on every poll from every client.
   *
   * `published_revision` moves only on publish, and unpublishing drops the row
   * from this set — so both directions change the hash. Editing the `published`
   * column by hand without bumping the revision would not, which is a fair
   * trade for turning an O(trees) endpoint into one indexed read.
   */
  async revisionForUser(userId: string): Promise<{ etag: string; version: number }> {
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ workspace_id: string | null }>>(
      `SELECT workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!client?.workspace_id) {
      return { etag: fingerprint('', []), version: SCHEMA_VERSION };
    }

    const plan = await resolveWorkspacePlan(this.prisma, client.workspace_id);
    // Same tolerance as the bundle, and for the same reason. Both endpoints
    // degrade to "nothing published", so their hashes still agree.
    const rows = await this.readPublishedRows<{ screen: string; published_revision: number }>(
      client.workspace_id,
      `SELECT screen, published_revision
         FROM public.workspace_ui_layouts
        WHERE workspace_id = $1::uuid AND published IS NOT NULL`,
    );

    return {
      etag: fingerprint(
        plan,
        rows.map((r) => [r.screen, r.published_revision] as const),
      ),
      version: SCHEMA_VERSION,
    };
  }

  /** Fill the gaps with defaults and prune by plan. */
  private bundleFrom(
    published: Partial<Record<ScreenKey, UiScreen>>,
    features: readonly string[],
    etag: string,
  ): UiBundle {
    const screens: Partial<Record<ScreenKey, UiScreen>> = {};
    for (const key of SCREEN_KEYS) {
      const tree = published[key] ?? defaultScreen(key);
      screens[key] = pruneForFeatures(tree, features);
    }
    return { version: SCHEMA_VERSION, etag, screens };
  }

  // ────────────────────────────────────────────────────────────────
  // Authoring
  // ────────────────────────────────────────────────────────────────

  /** Every screen's editor state for a workspace. */
  async listForWorkspace(workspaceId: string): Promise<EditorLayout[]> {
    const rows = await this.prisma.$queryRawUnsafe<LayoutRow[]>(
      `SELECT screen, draft, published, published_revision, schema_version,
              published_at::text AS published_at, updated_at::text AS updated_at
         FROM public.workspace_ui_layouts
        WHERE workspace_id = $1::uuid`,
      workspaceId,
    );
    const byScreen = new Map(rows.map((r) => [r.screen, r]));

    return SCREEN_KEYS.map((key) => {
      const row = byScreen.get(key);
      const hasDraft = !!row?.draft;
      const isPublished = !!row?.published;

      // Prefer the draft so the editor reopens where the author left off.
      const source = row?.draft ?? row?.published ?? null;
      let tree = defaultScreen(key);
      let origin: EditorLayout['origin'] = 'default';

      if (source) {
        const check = validateScreen(source, key);
        if (check.ok && check.value) {
          tree = check.value;
          origin = row?.draft ? 'draft' : 'published';
        } else {
          // Surfaced as "default" rather than handing the editor a tree it
          // cannot save. The stored row is left alone — the author may still
          // want to roll back to a known-good published revision.
          this.logger.warn(`[sdui] Stored ${key} for ${workspaceId} failed validation; editor gets the default.`);
        }
      }

      return {
        screen: key,
        tree,
        origin,
        hasDraft,
        isPublished,
        publishedRevision: row?.published_revision ?? 0,
        publishedAt: row?.published_at ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    });
  }

  async getScreen(workspaceId: string, screen: ScreenKey): Promise<EditorLayout> {
    const all = await this.listForWorkspace(workspaceId);
    const found = all.find((l) => l.screen === screen);
    if (!found) throw new NotFoundException(`Unknown screen "${screen}".`);
    return found;
  }

  /** Validate without storing — powers the editor's live error list. */
  validate(tree: unknown, screen: ScreenKey): { ok: boolean; errors: ValidationError[] } {
    const result = validateScreen(tree, screen);
    return { ok: result.ok, errors: result.errors };
  }

  /**
   * Store a draft. Rejected outright if invalid: a draft that cannot be
   * published is not worth persisting, and saving it would let the editor
   * accumulate an unsalvageable tree the author cannot get out of.
   */
  async saveDraft(
    workspaceId: string,
    screen: ScreenKey,
    tree: unknown,
    userId: string,
  ): Promise<EditorLayout> {
    const check = validateScreen(tree, screen);
    if (!check.ok || !check.value) throw new ValidationFailed(check.errors);

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.workspace_ui_layouts (workspace_id, screen, draft, schema_version, updated_at, updated_by)
       VALUES ($1::uuid, $2, $3::jsonb, $4, now(), $5::uuid)
       ON CONFLICT (workspace_id, screen)
       DO UPDATE SET draft = EXCLUDED.draft,
                     schema_version = EXCLUDED.schema_version,
                     updated_at = now(),
                     updated_by = EXCLUDED.updated_by`,
      workspaceId,
      screen,
      JSON.stringify(check.value),
      SCHEMA_VERSION,
      userId,
    );
    return this.getScreen(workspaceId, screen);
  }

  /** Throw away the draft and go back to whatever is live. */
  async discardDraft(workspaceId: string, screen: ScreenKey): Promise<EditorLayout> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.workspace_ui_layouts SET draft = NULL, updated_at = now()
        WHERE workspace_id = $1::uuid AND screen = $2`,
      workspaceId,
      screen,
    );
    return this.getScreen(workspaceId, screen);
  }

  /**
   * Make the draft live.
   *
   * Re-validates rather than trusting that saveDraft already did: the rules may
   * have tightened since, and this is the last gate before the tree is on
   * somebody's phone. The old tree is written to history in the same
   * transaction as the swap, so a rollback target always exists.
   */
  async publish(
    workspaceId: string,
    screen: ScreenKey,
    userId: string,
    note?: string,
  ): Promise<EditorLayout> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<LayoutRow>>(
      `SELECT screen, draft, published, published_revision, schema_version
         FROM public.workspace_ui_layouts
        WHERE workspace_id = $1::uuid AND screen = $2
        LIMIT 1`,
      workspaceId,
      screen,
    );

    const candidate = row?.draft ?? null;
    if (!candidate) throw new BadRequestException('There are no unpublished changes on this screen.');

    const check = validateScreen(candidate, screen);
    if (!check.ok || !check.value) throw new ValidationFailed(check.errors);

    const nextRevision = (row?.published_revision ?? 0) + 1;
    const tree: UiScreen = { ...check.value, revision: nextRevision };

    await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(
        `UPDATE public.workspace_ui_layouts
            SET published = $3::jsonb,
                draft = NULL,
                published_revision = $4,
                schema_version = $5,
                published_at = now(),
                published_by = $6::uuid,
                updated_at = now(),
                updated_by = $6::uuid
          WHERE workspace_id = $1::uuid AND screen = $2`,
        workspaceId,
        screen,
        JSON.stringify(tree),
        nextRevision,
        SCHEMA_VERSION,
        userId,
      ),
      this.prisma.$executeRawUnsafe(
        `INSERT INTO public.workspace_ui_layout_versions
           (workspace_id, screen, revision, tree, schema_version, note, published_by)
         VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7::uuid)`,
        workspaceId,
        screen,
        nextRevision,
        JSON.stringify(tree),
        SCHEMA_VERSION,
        note?.slice(0, 300) ?? null,
        userId,
      ),
    ]);

    this.logger.log(`[sdui] ${workspaceId}/${screen} published as r${nextRevision} by ${userId}`);
    return this.getScreen(workspaceId, screen);
  }

  /**
   * Stop serving a custom tree and go back to the built-in default.
   *
   * History is kept: "revert to stock" should not destroy the work, because the
   * usual reason for it is an incident, and the usual next step is to fix the
   * layout and publish it again.
   */
  async unpublish(workspaceId: string, screen: ScreenKey): Promise<EditorLayout> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.workspace_ui_layouts
          SET published = NULL, published_at = NULL, updated_at = now()
        WHERE workspace_id = $1::uuid AND screen = $2`,
      workspaceId,
      screen,
    );
    return this.getScreen(workspaceId, screen);
  }

  async history(workspaceId: string, screen: ScreenKey): Promise<LayoutVersion[]> {
    return this.prisma.$queryRawUnsafe<LayoutVersion[]>(
      `SELECT revision, note, published_at::text AS published_at, published_by::text AS published_by
         FROM public.workspace_ui_layout_versions
        WHERE workspace_id = $1::uuid AND screen = $2
        ORDER BY revision DESC
        LIMIT 50`,
      workspaceId,
      screen,
    );
  }

  /**
   * Load a historical revision back into the draft.
   *
   * Deliberately NOT straight to published. A rollback still goes through the
   * publish gate so it gets a fresh revision number and its own history row —
   * "we rolled back to r4" stays visible as an event rather than making the
   * revision counter jump backwards and confuse every cached client.
   */
  async restore(
    workspaceId: string,
    screen: ScreenKey,
    revision: number,
    userId: string,
  ): Promise<EditorLayout> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ tree: unknown }>>(
      `SELECT tree FROM public.workspace_ui_layout_versions
        WHERE workspace_id = $1::uuid AND screen = $2 AND revision = $3
        LIMIT 1`,
      workspaceId,
      screen,
      revision,
    );
    if (!row) throw new NotFoundException(`No revision ${revision} for ${screen}.`);
    return this.saveDraft(workspaceId, screen, row.tree, userId);
  }

  /** Load the stock layout into the draft so the author can diff against it. */
  async resetDraftToDefault(
    workspaceId: string,
    screen: ScreenKey,
    userId: string,
  ): Promise<EditorLayout> {
    return this.saveDraft(workspaceId, screen, defaultScreen(screen), userId);
  }
}

/**
 * Identify a served bundle from its inputs alone.
 *
 * Sorted so two workspaces with the same published set hash the same regardless
 * of the order Postgres handed the rows back.
 */
function fingerprint(plan: string, revisions: readonly (readonly [string, number])[]): string {
  const parts = [...revisions].sort((a, b) => a[0].localeCompare(b[0])).map(([s, r]) => `${s}:${r}`);
  const input = `v${SCHEMA_VERSION}|d${DEFAULTS_VERSION}|p${plan}|${parts.join(',')}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

/** 400 carrying the per-node errors the editor highlights inline. */
export class ValidationFailed extends BadRequestException {
  constructor(errors: ValidationError[]) {
    super({
      error: {
        code: 'sdui_invalid_layout',
        message:
          errors.length === 1
            ? errors[0].message
            : `${errors.length} problems in this layout.`,
        details: JSON.stringify(errors.slice(0, 50)),
      },
      issues: errors.slice(0, 50),
    });
  }
}
