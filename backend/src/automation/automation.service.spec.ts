import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { AutomationService } from './automation.service';
import type { AutomationAction } from './automation.types';

/**
 * AutomationService — focuses on validation rules + wildcard matching.
 *
 * These are the call paths most prone to silent bugs:
 *   - validateActions: bad rules persisted = bad executions forever
 *   - findMatchingRules: wildcard expansion (any.create) needs special-casing
 */

function makePrismaMock() {
  return {
    automation_rules: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    automation_runs: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

const RULE_BASE_ROW = {
  id: 'rule-1',
  workspace_id: 'ws-1',
  created_by_user_id: 'u-1',
  name: 'rule',
  description: null,
  is_enabled: true,
  trigger_event: 'recipe.create',
  conditions: [],
  actions: [{ type: 'notify.message', title: 't', body: 'b', recipient_scope: 'workspace' }],
  fire_count: 0,
  last_fired_at: null,
  last_error: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('AutomationService', () => {
  let service: AutomationService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AutomationService);
  });

  // ─── create — input validation ────────────────────────────────────

  describe('create — validation', () => {
    it('rejects an empty name', async () => {
      await expect(
        service.create('ws-1', 'u-1', {
          name: '   ',
          trigger_event: 'recipe.create',
          actions: [validNotify()],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a missing trigger_event', async () => {
      await expect(
        service.create('ws-1', 'u-1', {
          name: 'r',
          trigger_event: '',
          actions: [validNotify()],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an empty actions array', async () => {
      await expect(
        service.create('ws-1', 'u-1', {
          name: 'r',
          trigger_event: 'recipe.create',
          actions: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects notify.message with missing title', async () => {
      await expect(
        service.create('ws-1', 'u-1', {
          name: 'r',
          trigger_event: 'recipe.create',
          actions: [{ type: 'notify.message', title: '', body: 'b', recipient_scope: 'workspace' }],
        }),
      ).rejects.toThrow(/notify\.message requires a title/);
    });

    it('rejects webhook.post with a non-http url', async () => {
      await expect(
        service.create('ws-1', 'u-1', {
          name: 'r',
          trigger_event: 'recipe.create',
          actions: [{ type: 'webhook.post', url: 'ftp://example.com' }],
        }),
      ).rejects.toThrow(/valid http\(s\) URL/);
    });

    it('rejects an unknown action type', async () => {
      const fake = { type: 'sms.send' } as unknown as AutomationAction;
      await expect(
        service.create('ws-1', 'u-1', {
          name: 'r',
          trigger_event: 'recipe.create',
          actions: [fake],
        }),
      ).rejects.toThrow(/unknown type/);
    });

    it('persists a valid rule and returns the mapped shape', async () => {
      prisma.automation_rules.create.mockResolvedValue(RULE_BASE_ROW);
      const out = await service.create('ws-1', 'u-1', {
        name: 'good rule',
        trigger_event: 'recipe.create',
        actions: [validNotify()],
      });
      expect(out.id).toBe('rule-1');
      expect(out.workspace_id).toBe('ws-1');
      expect(out.is_enabled).toBe(true);
      expect(prisma.automation_rules.create).toHaveBeenCalledTimes(1);
    });
  });

  // ─── findMatchingRules — wildcard expansion ───────────────────────

  describe('findMatchingRules', () => {
    it('queries for the exact trigger AND its any.{action} wildcard', async () => {
      prisma.automation_rules.findMany.mockResolvedValue([]);
      await service.findMatchingRules('ws-1', 'recipe.create');
      const args = prisma.automation_rules.findMany.mock.calls[0][0];
      expect(args.where.trigger_event.in).toContain('recipe.create');
      expect(args.where.trigger_event.in).toContain('any.create');
      expect(args.where.is_enabled).toBe(true);
      expect(args.where.workspace_id).toBe('ws-1');
    });

    it('returns mapped rules', async () => {
      prisma.automation_rules.findMany.mockResolvedValue([RULE_BASE_ROW]);
      const rules = await service.findMatchingRules('ws-1', 'recipe.create');
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('rule-1');
      expect(rules[0].conditions).toEqual([]);
    });
  });

  // ─── update / remove — existence + workspace scoping ──────────────

  describe('update', () => {
    it('throws NotFound when the rule is in a different workspace', async () => {
      prisma.automation_rules.findFirst.mockResolvedValue(null);
      await expect(
        service.update('ws-1', 'rule-1', { name: 'patched' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies header-only patches without validating actions', async () => {
      prisma.automation_rules.findFirst.mockResolvedValue({ id: 'rule-1' });
      prisma.automation_rules.update.mockResolvedValue(RULE_BASE_ROW);
      await service.update('ws-1', 'rule-1', { is_enabled: false });
      const args = prisma.automation_rules.update.mock.calls[0][0];
      expect(args.where.id).toBe('rule-1');
      expect(args.data.is_enabled).toBe(false);
      expect(args.data.actions).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('throws NotFound when the rule is missing', async () => {
      prisma.automation_rules.findFirst.mockResolvedValue(null);
      await expect(service.remove('ws-1', 'rule-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes only when scoped to the workspace', async () => {
      prisma.automation_rules.findFirst.mockResolvedValue({ id: 'rule-1' });
      prisma.automation_rules.delete.mockResolvedValue({ id: 'rule-1' });
      const out = await service.remove('ws-1', 'rule-1');
      expect(out).toEqual({ id: 'rule-1' });
      expect(prisma.automation_rules.delete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
    });
  });
});

function validNotify(): AutomationAction {
  return { type: 'notify.message', title: 'New {{entity_type}}', body: 'by {{actor_role}}', recipient_scope: 'workspace' };
}
