import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import {
  ACTIVITY_RECORDED_EVENT,
  type ActivityRecordedEvent,
} from '../activity-log/activity-log.types';
import { AutomationExecutor } from './automation-executor.service';
import { AutomationService } from './automation.service';
import { PushService } from '../clients/push.service';
import { AssistantGeminiService } from '../ai-assistant/assistant-gemini.service';
import type { AutomationRule } from './automation.types';

/**
 * AutomationExecutor — the event-driven half of the engine.
 *
 * We drive it through the public `handle()` entry point (the @OnEvent target)
 * and assert on the side effects it produces:
 *   - which events it SKIPS (the loop guards — these prevent runaway fan-out)
 *   - the run rows it records via AutomationService.recordRun
 *   - the notification activity_logs row a notify.message action writes
 *   - the outbound fetch a webhook.post action makes (and failure handling)
 *
 * The condition + template logic lives in module-private functions, so we
 * exercise them indirectly via the run records (input_payload, action_results).
 */

function makePrismaMock() {
  return {
    activity_logs: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    },
  };
}

function makeAutomationsMock() {
  return {
    findMatchingRules: jest.fn(),
    recordRun: jest.fn().mockResolvedValue(undefined),
  };
}

const BASE_EVENT: ActivityRecordedEvent = {
  id: 'act-1',
  workspace_id: 'ws-1',
  actor_user_id: 'u-1',
  actor_role: 'nutritionist',
  http_method: 'POST',
  route: '/api/v1/workspaces/me/recipes',
  entity_type: 'recipe',
  entity_id: 'rec-9',
  action: 'create',
  status_code: 201,
  latency_ms: 42,
  created_at: '2026-06-13T00:00:00.000Z',
};

function makeRule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: 'rule-1',
    workspace_id: 'ws-1',
    created_by_user_id: 'u-1',
    name: 'Notify on recipe',
    description: null,
    is_enabled: true,
    trigger_event: 'recipe.create',
    conditions: [],
    actions: [
      {
        type: 'notify.message',
        title: 'New {{entity_type}} by {{actor_role}}',
        body: 'id {{entity_id}}',
        recipient_scope: 'workspace',
      },
    ],
    fire_count: 0,
    last_fired_at: null,
    last_error: null,
    created_at: '2026-06-13T00:00:00.000Z',
    updated_at: '2026-06-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('AutomationExecutor', () => {
  let executor: AutomationExecutor;
  let prisma: ReturnType<typeof makePrismaMock>;
  let automations: ReturnType<typeof makeAutomationsMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    automations = makeAutomationsMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationExecutor,
        { provide: AutomationService, useValue: automations },
        { provide: PrismaService, useValue: prisma },
        // Module-11 action deps — not exercised by these notify/webhook tests,
        // so no-op stubs are enough to satisfy DI.
        { provide: PushService, useValue: { sendToClient: jest.fn(), sendToWorkspace: jest.fn() } },
        { provide: AssistantGeminiService, useValue: { generate: jest.fn() } },
      ],
    }).compile();
    executor = module.get(AutomationExecutor);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── skip guards — these never even look up rules ──────────────────

  describe('skip guards', () => {
    it('skips platform-level activity (no workspace_id)', async () => {
      await executor.handle({ ...BASE_EVENT, workspace_id: null });
      expect(automations.findMatchingRules).not.toHaveBeenCalled();
    });

    it('skips failed requests (status_code >= 400)', async () => {
      await executor.handle({ ...BASE_EVENT, status_code: 422 });
      expect(automations.findMatchingRules).not.toHaveBeenCalled();
    });

    it('skips when entity_type is null', async () => {
      await executor.handle({ ...BASE_EVENT, entity_type: null });
      expect(automations.findMatchingRules).not.toHaveBeenCalled();
    });

    it('skips notification entities — infinite fan-out guard', async () => {
      await executor.handle({ ...BASE_EVENT, entity_type: 'notification' });
      expect(automations.findMatchingRules).not.toHaveBeenCalled();
    });

    it('does nothing when no rules match', async () => {
      automations.findMatchingRules.mockResolvedValue([]);
      await executor.handle(BASE_EVENT);
      expect(prisma.activity_logs.findUnique).not.toHaveBeenCalled();
      expect(automations.recordRun).not.toHaveBeenCalled();
    });

    it('derives the trigger as entity_type.action', async () => {
      automations.findMatchingRules.mockResolvedValue([]);
      await executor.handle(BASE_EVENT);
      expect(automations.findMatchingRules).toHaveBeenCalledWith('ws-1', 'recipe.create');
    });
  });

  // ─── conditions ────────────────────────────────────────────────────

  describe('condition evaluation', () => {
    beforeEach(() => {
      prisma.activity_logs.findUnique.mockResolvedValue({
        payload: { plan: 'pro', tags: ['vegan'] },
        route: BASE_EVENT.route,
        status_code: 201,
      });
    });

    it('records a skipped run when a condition is false', async () => {
      automations.findMatchingRules.mockResolvedValue([
        makeRule({ conditions: [{ field: 'actor_role', operator: 'eq', value: 'owner' }] }),
      ]);
      await executor.handle(BASE_EVENT);

      expect(prisma.activity_logs.create).not.toHaveBeenCalled();
      const run = automations.recordRun.mock.calls[0][0];
      expect(run.status).toBe('skipped');
      expect(run.input_payload).toMatchObject({ reason: 'conditions_false' });
    });

    it('runs actions when all conditions hold', async () => {
      automations.findMatchingRules.mockResolvedValue([
        makeRule({
          conditions: [
            { field: 'actor_role', operator: 'eq', value: 'nutritionist' },
            { field: 'payload.plan', operator: 'eq', value: 'pro' },
            { field: 'payload.tags', operator: 'contains', value: 'vegan' },
            { field: 'entity_id', operator: 'exists' },
          ],
        }),
      ]);
      await executor.handle(BASE_EVENT);

      const run = automations.recordRun.mock.calls[0][0];
      expect(run.status).toBe('success');
    });

    it('treats a missing nested field as not matching eq', async () => {
      automations.findMatchingRules.mockResolvedValue([
        makeRule({ conditions: [{ field: 'payload.missing.deep', operator: 'eq', value: 'x' }] }),
      ]);
      await executor.handle(BASE_EVENT);
      expect(automations.recordRun.mock.calls[0][0].status).toBe('skipped');
    });
  });

  // ─── notify.message action ─────────────────────────────────────────

  describe('notify.message', () => {
    beforeEach(() => {
      prisma.activity_logs.findUnique.mockResolvedValue({
        payload: null,
        route: BASE_EVENT.route,
        status_code: 201,
      });
    });

    it('writes a notification row with rendered handlebars title + body', async () => {
      automations.findMatchingRules.mockResolvedValue([makeRule()]);
      await executor.handle(BASE_EVENT);

      expect(prisma.activity_logs.create).toHaveBeenCalledTimes(1);
      const data = prisma.activity_logs.create.mock.calls[0][0].data;
      expect(data.entity_type).toBe('notification');
      expect(data.actor_role).toBe('system');
      expect(data.workspace_id).toBe('ws-1');
      expect(data.payload.title).toBe('New recipe by nutritionist');
      expect(data.payload.body).toBe('id rec-9');
      expect(data.payload.source_activity_log_id).toBe('act-1');

      const run = automations.recordRun.mock.calls[0][0];
      expect(run.status).toBe('success');
      expect(run.action_results[0]).toMatchObject({ type: 'notify.message', status: 'success' });
    });

    it('leaves unknown placeholders intact for authoring visibility', async () => {
      automations.findMatchingRules.mockResolvedValue([
        makeRule({
          actions: [
            {
              type: 'notify.message',
              title: 'Hello {{nope}}',
              body: 'b',
              recipient_scope: 'workspace',
            },
          ],
        }),
      ]);
      await executor.handle(BASE_EVENT);
      const data = prisma.activity_logs.create.mock.calls[0][0].data;
      expect(data.payload.title).toBe('Hello {{nope}}');
    });
  });

  // ─── webhook.post action ───────────────────────────────────────────

  describe('webhook.post', () => {
    beforeEach(() => {
      prisma.activity_logs.findUnique.mockResolvedValue({
        payload: null,
        route: BASE_EVENT.route,
        status_code: 201,
      });
    });

    it('POSTs to the url and records success on a 2xx', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, status: 200 } as Response);
      automations.findMatchingRules.mockResolvedValue([
        makeRule({ actions: [{ type: 'webhook.post', url: 'https://hook.example.com/x' }] }),
      ]);

      await executor.handle(BASE_EVENT);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://hook.example.com/x');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['x-sirah-source']).toBe('automation/rule-1');
      const run = automations.recordRun.mock.calls[0][0];
      expect(run.status).toBe('success');
      expect(run.action_results[0]).toMatchObject({ type: 'webhook.post', status: 'success' });
    });

    it('records a failed run when the webhook returns non-2xx', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
      automations.findMatchingRules.mockResolvedValue([
        makeRule({ actions: [{ type: 'webhook.post', url: 'https://hook.example.com/x' }] }),
      ]);

      await executor.handle(BASE_EVENT);

      const run = automations.recordRun.mock.calls[0][0];
      expect(run.status).toBe('failed');
      expect(run.error_message).toMatch(/HTTP 500/);
      expect(run.action_results[0]).toMatchObject({ type: 'webhook.post', status: 'failed' });
    });

    it('records a failed run when fetch throws (network/timeout)', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('aborted'));
      automations.findMatchingRules.mockResolvedValue([
        makeRule({ actions: [{ type: 'webhook.post', url: 'https://hook.example.com/x' }] }),
      ]);

      await executor.handle(BASE_EVENT);

      const run = automations.recordRun.mock.calls[0][0];
      expect(run.status).toBe('failed');
      expect(run.error_message).toMatch(/aborted/);
    });
  });

  // ─── partial success across multiple actions ───────────────────────

  it('continues running actions after one fails (partial success)', async () => {
    prisma.activity_logs.findUnique.mockResolvedValue({
      payload: null,
      route: BASE_EVENT.route,
      status_code: 201,
    });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
    automations.findMatchingRules.mockResolvedValue([
      makeRule({
        actions: [
          { type: 'webhook.post', url: 'https://hook.example.com/x' },
          { type: 'notify.message', title: 'still runs', body: 'b', recipient_scope: 'workspace' },
        ],
      }),
    ]);

    await executor.handle(BASE_EVENT);

    // notify still wrote its row even though the webhook before it failed.
    expect(prisma.activity_logs.create).toHaveBeenCalledTimes(1);
    const run = automations.recordRun.mock.calls[0][0];
    expect(run.status).toBe('failed');
    expect(run.action_results).toHaveLength(2);
    expect(run.action_results[0].status).toBe('failed');
    expect(run.action_results[1].status).toBe('success');
  });

  // ─── multiple matching rules run independently ─────────────────────

  it('runs every matching rule even if one crashes', async () => {
    prisma.activity_logs.findUnique.mockResolvedValue({
      payload: null,
      route: BASE_EVENT.route,
      status_code: 201,
    });
    // First rule's recordRun rejects; second must still record.
    automations.recordRun
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(undefined);
    automations.findMatchingRules.mockResolvedValue([
      makeRule({ id: 'rule-a' }),
      makeRule({ id: 'rule-b' }),
    ]);

    await executor.handle(BASE_EVENT);

    expect(automations.recordRun).toHaveBeenCalledTimes(2);
  });

  it('subscribes to the activity.recorded channel', () => {
    expect(ACTIVITY_RECORDED_EVENT).toBe('activity.recorded');
  });
});
