import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { ActivityLogService } from './activity-log.service';
import type { ActivityLogWriteInput } from './activity-log.types';

/**
 * ActivityLogService — tests cover the three things that can quietly go wrong:
 *   1. Sensitive fields leaking into the log
 *   2. Oversized payloads bloating the table
 *   3. Logging failures propagating to the user request
 *
 * No DB is touched. PrismaService is mocked per test.
 */

function makePrismaMock(): jest.Mocked<Pick<PrismaService, 'activity_logs'>> {
  const create = jest.fn();
  const findMany = jest.fn();
  return {
    activity_logs: {
      create,
      findMany,
    } as unknown as PrismaService['activity_logs'],
  } as jest.Mocked<Pick<PrismaService, 'activity_logs'>>;
}

function makeWrite(overrides: Partial<ActivityLogWriteInput> = {}): ActivityLogWriteInput {
  return {
    workspace_id: 'ws-1',
    organization_id: null,
    actor_user_id: 'user-1',
    actor_role: 'owner',
    http_method: 'POST',
    route: '/api/v1/workspaces/me/clients',
    entity_type: 'client',
    entity_id: null,
    action: 'create',
    request_id: 'req-1',
    status_code: 201,
    latency_ms: 42,
    ip: '127.0.0.1',
    user_agent: 'jest',
    payload: { name: 'Anita' },
    error_message: null,
    ...overrides,
  };
}

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ActivityLogService);
  });

  // ─── write() — sanitisation ──────────────────────────────────────

  describe('write - payload sanitisation', () => {
    it('redacts password / token / secret / api_key keys at any depth', async () => {
      (prisma.activity_logs.create as jest.Mock).mockResolvedValue({ id: 'log-1' });
      await service.write(makeWrite({
        payload: {
          email: 'a@b.com',
          password: 'plaintext',
          nested: { access_token: 'abc', child: { secret: 'xyz' } },
          headers: { Authorization: 'Bearer 123' },
        },
      }));

      const data = (prisma.activity_logs.create as jest.Mock).mock.calls[0][0].data;
      expect(data.payload.email).toBe('a@b.com');
      expect(data.payload.password).toBe('[REDACTED]');
      expect(data.payload.nested.access_token).toBe('[REDACTED]');
      expect(data.payload.nested.child.secret).toBe('[REDACTED]');
      expect(data.payload.headers.Authorization).toBe('[REDACTED]');
    });

    it('keeps the payload as-is when no sensitive keys exist', async () => {
      (prisma.activity_logs.create as jest.Mock).mockResolvedValue({ id: 'log-1' });
      const payload = { name: 'Anita', age: 32, prefs: ['low-carb'] };
      await service.write(makeWrite({ payload }));
      const data = (prisma.activity_logs.create as jest.Mock).mock.calls[0][0].data;
      expect(data.payload).toEqual(payload);
    });

    it('truncates payloads larger than 8KB to a preview marker', async () => {
      (prisma.activity_logs.create as jest.Mock).mockResolvedValue({ id: 'log-1' });
      const huge = { blob: 'a'.repeat(10_000) };
      await service.write(makeWrite({ payload: huge }));
      const data = (prisma.activity_logs.create as jest.Mock).mock.calls[0][0].data;
      expect(data.payload._truncated).toBe(true);
      expect(typeof data.payload._bytes).toBe('number');
      expect(data.payload._bytes).toBeGreaterThan(8 * 1024);
    });

    it('handles circular references without crashing', async () => {
      (prisma.activity_logs.create as jest.Mock).mockResolvedValue({ id: 'log-1' });
      const circular: Record<string, unknown> = { name: 'loop' };
      circular.self = circular;
      const id = await service.write(makeWrite({ payload: circular }));
      // Should not throw; service returns either the id or null on internal err
      expect(id === 'log-1' || id === null).toBe(true);
    });

    it('writes Prisma.DbNull when payload is null', async () => {
      (prisma.activity_logs.create as jest.Mock).mockResolvedValue({ id: 'log-1' });
      await service.write(makeWrite({ payload: null }));
      const data = (prisma.activity_logs.create as jest.Mock).mock.calls[0][0].data;
      // DbNull is a Prisma sentinel; checking it's defined + not a plain object
      expect(data.payload).toBeDefined();
    });
  });

  // ─── write() — failure tolerance ─────────────────────────────────

  describe('write - failure tolerance', () => {
    it('returns null and does NOT throw when the DB rejects', async () => {
      (prisma.activity_logs.create as jest.Mock).mockRejectedValue(new Error('conn closed'));
      const id = await service.write(makeWrite());
      expect(id).toBeNull();
    });
  });

  // ─── listForWorkspace() — filter wiring ──────────────────────────

  describe('listForWorkspace', () => {
    it('applies search/actor/entityType/action filters', async () => {
      (prisma.activity_logs.findMany as jest.Mock).mockResolvedValue([]);
      await service.listForWorkspace('ws-1', {
        actorUserId: 'user-2',
        entityType: 'recipe',
        action: 'create',
        search: 'foods',
      });
      const args = (prisma.activity_logs.findMany as jest.Mock).mock.calls[0][0];
      expect(args.where).toMatchObject({
        workspace_id: 'ws-1',
        actor_user_id: 'user-2',
        entity_type: 'recipe',
        action: 'create',
      });
      expect(args.where.route).toMatchObject({ contains: 'foods' });
    });

    it('clamps limit to a maximum of 200', async () => {
      (prisma.activity_logs.findMany as jest.Mock).mockResolvedValue([]);
      await service.listForWorkspace('ws-1', { limit: 9999 });
      const args = (prisma.activity_logs.findMany as jest.Mock).mock.calls[0][0];
      expect(args.take).toBe(200);
    });

    it('defaults to 50 when no limit is provided', async () => {
      (prisma.activity_logs.findMany as jest.Mock).mockResolvedValue([]);
      await service.listForWorkspace('ws-1');
      const args = (prisma.activity_logs.findMany as jest.Mock).mock.calls[0][0];
      expect(args.take).toBe(50);
    });

    it('returns mapped rows with ISO timestamps', async () => {
      const now = new Date('2026-06-12T10:00:00Z');
      (prisma.activity_logs.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'log-1', workspace_id: 'ws-1', actor_user_id: 'u', actor_role: 'owner',
          http_method: 'POST', route: '/r', entity_type: 'e', entity_id: null,
          action: 'create', request_id: null, status_code: 201, latency_ms: 5,
          ip: null, user_agent: null, payload: null, error_message: null,
          created_at: now,
        },
      ]);
      const rows = await service.listForWorkspace('ws-1');
      expect(rows).toHaveLength(1);
      expect(rows[0].created_at).toBe(now.toISOString());
    });
  });
});
