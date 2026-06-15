import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  automationApi,
  CONDITION_FIELDS,
  OPERATOR_LABEL,
  TRIGGER_EVENTS,
  type AutomationAction,
  type AutomationCondition,
  type AutomationRule,
  type ConditionOperator,
} from '@/modules/workspace/api/automation';

/**
 * RuleEditor — sheet for creating / editing an automation rule.
 *
 * Sections:
 *   - Identity     name + description + enabled toggle
 *   - Trigger      pick one event from TRIGGER_EVENTS
 *   - Conditions   add/remove rows (field + operator + value)
 *   - Actions      add/remove rows; type-specific fields
 *
 * Save POSTs (new) or PATCHes (edit). On 2xx, parent refetches via onSaved().
 */
interface RuleEditorProps {
  initial: AutomationRule | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RuleEditor({ initial, onClose, onSaved }: RuleEditorProps) {
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isEnabled, setIsEnabled] = useState(initial?.is_enabled ?? true);
  const [trigger, setTrigger] = useState(initial?.trigger_event ?? TRIGGER_EVENTS[0].value);
  const [conditions, setConditions] = useState<AutomationCondition[]>(initial?.conditions ?? []);
  const [actions, setActions] = useState<AutomationAction[]>(
    initial?.actions ?? [{ type: 'notify.message', title: '', body: '', recipient_scope: 'workspace' }],
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        is_enabled: isEnabled,
        trigger_event: trigger,
        conditions,
        actions,
      };
      if (isEdit && initial) return automationApi.updateRule(initial.id, payload);
      return automationApi.createRule(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Rule updated' : 'Rule created');
      onSaved();
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  function handleSave() {
    if (!name.trim()) return toast.error('Name is required.');
    if (actions.length === 0) return toast.error('Add at least one action.');
    for (const [i, a] of actions.entries()) {
      if (a.type === 'notify.message' && (!a.title.trim() || !a.body.trim())) {
        return toast.error(`Action ${i + 1}: title and body are required.`);
      }
      if (a.type === 'webhook.post' && !a.url.trim()) {
        return toast.error(`Action ${i + 1}: URL is required.`);
      }
      if (a.type === 'message.send' && !a.content.trim()) {
        return toast.error(`Action ${i + 1}: message content is required.`);
      }
      if (a.type === 'push.send' && (!a.title.trim() || !a.body.trim())) {
        return toast.error(`Action ${i + 1}: push title and body are required.`);
      }
      if (a.type === 'ai.summarize' && !a.prompt.trim()) {
        return toast.error(`Action ${i + 1}: AI prompt is required.`);
      }
    }
    saveMut.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ">
      <Glass className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
          <h3 className="text-sm font-medium">{isEdit ? 'Edit rule' : 'New automation rule'}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-foreground/45 hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {/* Identity */}
          <div className="space-y-3">
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Notify when client logs a meal"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Description (optional)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What does this rule do?"
                className={INPUT_CLASS}
              />
            </Field>
            <label className="flex items-center gap-2 text-xs text-foreground/65">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-violet-500"
              />
              Enabled (uncheck to pause without deleting)
            </label>
          </div>

          {/* Trigger */}
          <div>
            <SectionLabel>Trigger</SectionLabel>
            <p className="mt-1 text-[11px] text-foreground/55">Fire this rule when…</p>
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              className={cn(INPUT_CLASS, 'mt-2')}
            >
              {TRIGGER_EVENTS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Conditions */}
          <div>
            <SectionLabel>Conditions (optional)</SectionLabel>
            <p className="mt-1 text-[11px] text-foreground/55">
              All conditions must be true. Leave empty to fire on every trigger event.
            </p>
            <div className="mt-2 space-y-2">
              {conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/[0.08] p-2">
                  <select
                    value={c.field}
                    onChange={(e) => setConditions(updateAt(conditions, i, { ...c, field: e.target.value }))}
                    className={cn(INPUT_CLASS, 'h-8 w-40 py-0')}
                  >
                    {CONDITION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select
                    value={c.operator}
                    onChange={(e) => setConditions(updateAt(conditions, i, { ...c, operator: e.target.value as ConditionOperator }))}
                    className={cn(INPUT_CLASS, 'h-8 w-32 py-0')}
                  >
                    {(Object.keys(OPERATOR_LABEL) as ConditionOperator[]).map((op) => (
                      <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>
                    ))}
                  </select>
                  {c.operator !== 'exists' && c.operator !== 'not_exists' && (
                    <input
                      type="text"
                      value={typeof c.value === 'string' || typeof c.value === 'number' ? String(c.value) : ''}
                      onChange={(e) => setConditions(updateAt(conditions, i, { ...c, value: e.target.value }))}
                      placeholder="value"
                      className={cn(INPUT_CLASS, 'h-8 flex-1 py-0')}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setConditions(conditions.filter((_, j) => j !== i))}
                    className="rounded-md p-1.5 text-foreground/40 hover:bg-rose-500/10 hover:text-rose-500"
                    aria-label="Remove condition"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setConditions([
                  ...conditions,
                  { field: 'actor_role', operator: 'eq', value: 'client' },
                ])}
                className="inline-flex items-center gap-1 text-xs text-foreground/55 hover:text-foreground/85"
              >
                <Plus className="h-3 w-3" />
                Add condition
              </button>
            </div>
          </div>

          {/* Actions */}
          <div>
            <SectionLabel>Actions</SectionLabel>
            <p className="mt-1 text-[11px] text-foreground/55">
              Run in order. {`Use {{placeholders}} like {{entity_type}}, {{actor_role}}.`}
            </p>
            <div className="mt-2 space-y-3">
              {actions.map((a, i) => (
                <div key={i} className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.015] p-3">
                  <div className="flex items-center justify-between">
                    <select
                      value={a.type}
                      onChange={(e) => setActions(updateAt(actions, i, defaultAction(e.target.value as AutomationAction['type'])))}
                      className={cn(INPUT_CLASS, 'h-8 w-56 py-0 text-xs')}
                    >
                      <option value="notify.message">In-app notification</option>
                      <option value="message.send">Message the client</option>
                      <option value="push.send">Push notification</option>
                      <option value="ai.summarize">AI note</option>
                      <option value="webhook.post">Webhook (HTTP POST)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setActions(actions.filter((_, j) => j !== i))}
                      className="rounded-md p-1.5 text-foreground/40 hover:bg-rose-500/10 hover:text-rose-500"
                      aria-label="Remove action"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {a.type === 'notify.message' && (
                    <div className="mt-3 space-y-2">
                      <input type="text" value={a.title} onChange={(e) => setActions(updateAt(actions, i, { ...a, title: e.target.value }))}
                        placeholder="Title (e.g. New {{entity_type}} created)" className={cn(INPUT_CLASS, 'text-xs')} />
                      <textarea value={a.body} onChange={(e) => setActions(updateAt(actions, i, { ...a, body: e.target.value }))} rows={2}
                        placeholder="Body (e.g. {{actor_role}} just added entity {{entity_id}})" className={cn(INPUT_CLASS, 'text-xs')} />
                    </div>
                  )}
                  {a.type === 'message.send' && (
                    <div className="mt-3 space-y-2">
                      <textarea value={a.content} onChange={(e) => setActions(updateAt(actions, i, { ...a, content: e.target.value }))} rows={2}
                        placeholder="Message to the client (e.g. Welcome aboard! Let's get started 🌿)" className={cn(INPUT_CLASS, 'text-xs')} />
                      <p className="text-[10px] text-foreground/45">Sends a chat message + push to the client this event is about (needs a client trigger).</p>
                    </div>
                  )}
                  {a.type === 'push.send' && (
                    <div className="mt-3 space-y-2">
                      <select value={a.recipient} onChange={(e) => setActions(updateAt(actions, i, { ...a, recipient: e.target.value as 'trigger_client' | 'workspace_staff' }))} className={cn(INPUT_CLASS, 'h-8 py-0 text-xs')}>
                        <option value="trigger_client">To the client</option>
                        <option value="workspace_staff">To workspace staff</option>
                      </select>
                      <input type="text" value={a.title} onChange={(e) => setActions(updateAt(actions, i, { ...a, title: e.target.value }))} placeholder="Push title" className={cn(INPUT_CLASS, 'text-xs')} />
                      <input type="text" value={a.body} onChange={(e) => setActions(updateAt(actions, i, { ...a, body: e.target.value }))} placeholder="Push body" className={cn(INPUT_CLASS, 'text-xs')} />
                    </div>
                  )}
                  {a.type === 'ai.summarize' && (
                    <div className="mt-3 space-y-2">
                      <textarea value={a.prompt} onChange={(e) => setActions(updateAt(actions, i, { ...a, prompt: e.target.value }))} rows={2}
                        placeholder="Ask the AI (e.g. Summarize what just happened and flag anything to follow up)" className={cn(INPUT_CLASS, 'text-xs')} />
                      <p className="text-[10px] text-foreground/45">The AI response is posted as an in-app note in your Activity feed.</p>
                    </div>
                  )}
                  {a.type === 'webhook.post' && (
                    <div className="mt-3 space-y-2">
                      <input type="url" value={a.url} onChange={(e) => setActions(updateAt(actions, i, { ...a, url: e.target.value }))}
                        placeholder="https://your-service.example.com/hooks/sirah" className={cn(INPUT_CLASS, 'text-xs font-mono')} />
                      <p className="text-[10px] text-foreground/45">POSTed with JSON body. Headers: X-Sirah-Source = automation/{`{rule_id}`}.</p>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setActions([
                  ...actions,
                  { type: 'notify.message', title: '', body: '', recipient_scope: 'workspace' },
                ])}
                className="inline-flex items-center gap-1 text-xs text-foreground/55 hover:text-foreground/85"
              >
                <Plus className="h-3 w-3" />
                Add action
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 hover:border-foreground/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMut.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-600',
              saveMut.isPending && 'opacity-60',
            )}
          >
            {saveMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      </Glass>
    </div>
  );
}

// ─── Helpers / bits ──────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm placeholder:text-foreground/35 focus:border-violet-500/40 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{children}</span>
  );
}

function updateAt<T>(arr: T[], i: number, next: T): T[] {
  return arr.map((v, j) => (j === i ? next : v));
}

function defaultAction(type: AutomationAction['type']): AutomationAction {
  switch (type) {
    case 'message.send': return { type: 'message.send', recipient: 'trigger_client', content: '' };
    case 'push.send':    return { type: 'push.send', recipient: 'trigger_client', title: '', body: '' };
    case 'ai.summarize': return { type: 'ai.summarize', prompt: '' };
    case 'webhook.post': return { type: 'webhook.post', url: '' };
    case 'notify.message':
    default:             return { type: 'notify.message', title: '', body: '', recipient_scope: 'workspace' };
  }
}
