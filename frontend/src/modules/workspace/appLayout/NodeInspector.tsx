import { Trash2, Copy, ArrowUp, ArrowDown, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  childSlotsOf,
  type AnyNode,
  type Catalog,
  type ChildSlot,
  type NodeSpec,
  type PropSpec,
  type ScreenKey,
} from '@/modules/workspace/api/appLayout';

/**
 * The property panel — generated from the server's node catalog.
 *
 * Nothing here knows what a `row` or a `ring` is. It reads the spec for the
 * selected node's type and renders one control per declared prop. That is what
 * keeps the editor and the validator in agreement: a prop the backend does not
 * declare has no control, and a control cannot produce a value the backend
 * would reject, because both read the same `values` and `min`/`max`.
 */
export interface InspectorProps {
  node: AnyNode;
  screen: ScreenKey;
  catalog: Catalog;
  errors: string[];
  onChange: (next: AnyNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (delta: number) => void;
  onAddChild: (slot: ChildSlot, type: string) => void;
  /** Root cannot be deleted or moved. */
  isRoot: boolean;
}

export function NodeInspector({
  node,
  screen,
  catalog,
  errors,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  onAddChild,
  isRoot,
}: InspectorProps) {
  const spec = catalog.nodes[node.type];

  if (!spec) {
    return (
      <p className="text-sm text-muted-foreground">
        This node has type <code className="font-mono">{node.type}</code>, which this server does
        not recognise. Delete it, or upgrade the backend.
      </p>
    );
  }

  const set = (prop: string, value: unknown) => {
    const next = { ...node };
    // Clearing an optional prop removes it rather than storing "", so the saved
    // tree stays the minimum the author actually specified.
    if (value === '' || value === undefined) delete next[prop];
    else next[prop] = value;
    onChange(next);
  };

  const slots = childSlotsOf(node, spec);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{spec.label}</h3>
          <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {node.id}
          </code>
        </div>
        <p className="text-xs text-muted-foreground">{spec.hint}</p>
      </header>

      {errors.length ? (
        <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {!isRoot ? (
        <div className="flex flex-wrap gap-1.5">
          <ToolButton icon={ArrowUp} label="Move up" onClick={() => onMove(-1)} />
          <ToolButton icon={ArrowDown} label="Move down" onClick={() => onMove(1)} />
          <ToolButton icon={Copy} label="Duplicate" onClick={onDuplicate} />
          <ToolButton icon={Trash2} label="Delete" onClick={onDelete} destructive />
        </div>
      ) : null}

      {/* ── Visibility ───────────────────────────────────────────── */}
      <ConditionField
        label="Only show when"
        hint="Leave off to always show."
        value={node.when as Record<string, unknown> | undefined}
        catalog={catalog}
        onChange={(v) => set('when', v)}
      />

      {/* ── Declared props ───────────────────────────────────────── */}
      {Object.entries(spec.props)
        .filter(([, p]) => p.kind !== 'nodes')
        .map(([name, propSpec]) => (
          <PropField
            key={name}
            name={name}
            spec={propSpec}
            value={node[name]}
            catalog={catalog}
            screen={screen}
            onChange={(v) => set(name, v)}
          />
        ))}

      {/* ── Children ─────────────────────────────────────────────── */}
      {slots.map((slot) => (
        <div key={slot} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {slot === 'children' ? 'Contents' : slot}
            </span>
            <span className="text-xs text-muted-foreground">
              {((node[slot] as AnyNode[] | undefined) ?? []).length} item(s)
            </span>
          </div>
          <AddNodeSelect
            catalog={catalog}
            screen={screen}
            parentType={node.type}
            onPick={(type) => onAddChild(slot, type)}
          />
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Prop controls
// ────────────────────────────────────────────────────────────────────

function PropField({
  name,
  spec,
  value,
  catalog,
  screen,
  onChange,
}: {
  name: string;
  spec: PropSpec;
  value: unknown;
  catalog: Catalog;
  screen: ScreenKey;
  onChange: (v: unknown) => void;
}) {
  const label = spec.label ?? humanize(name);

  switch (spec.kind) {
    case 'template':
    case 'string':
      return (
        <Labelled label={label} hint={spec.hint ?? (spec.kind === 'template' ? BINDING_HINT : undefined)} required={spec.required}>
          <input
            className={inputCls}
            value={(value as string) ?? ''}
            maxLength={catalog.limits.maxStringLength}
            onChange={(e) => onChange(e.target.value)}
          />
        </Labelled>
      );

    case 'number':
      return (
        <Labelled label={label} hint={spec.hint} required={spec.required}>
          <input
            type="number"
            className={inputCls}
            value={value === undefined ? '' : (value as number)}
            min={spec.min}
            max={spec.max}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </Labelled>
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked ? true : undefined)}
            className="h-4 w-4 rounded border-foreground/20"
          />
          {label}
        </label>
      );

    case 'enum':
      return (
        <Labelled label={label} hint={spec.hint} required={spec.required}>
          <select className={inputCls} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
            {!spec.required ? <option value="">—</option> : null}
            {(spec.values ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Labelled>
      );

    case 'icon':
      return (
        <Labelled label={label} hint="An Ionicons name, e.g. heart-outline." required={spec.required}>
          <input
            className={inputCls}
            value={(value as string) ?? ''}
            placeholder="heart-outline"
            onChange={(e) => onChange(e.target.value)}
          />
        </Labelled>
      );

    case 'action':
      return (
        <ActionField
          label={label}
          value={value as Record<string, unknown> | undefined}
          catalog={catalog}
          screen={screen}
          onChange={onChange}
        />
      );

    case 'condition':
      return (
        <ConditionField
          label={label}
          hint={spec.hint}
          value={value as Record<string, unknown> | undefined}
          catalog={catalog}
          onChange={onChange}
        />
      );

    case 'options':
      return <OptionsField label={label} value={(value as Opt[]) ?? []} onChange={onChange} />;

    case 'json':
      return (
        <Labelled label={label} hint="JSON object passed to the built-in block.">
          <JsonField value={value} onChange={onChange} />
        </Labelled>
      );

    default:
      return null;
  }
}

const BINDING_HINT = 'Use {{home.profile.name}} to insert live data. Add ?? for a fallback.';

function ActionField({
  label,
  value,
  catalog,
  screen,
  onChange,
}: {
  label: string;
  value: Record<string, unknown> | undefined;
  catalog: Catalog;
  screen: ScreenKey;
  onChange: (v: unknown) => void;
}) {
  const kind = (value?.kind as string) ?? 'none';

  // The two onboarding-only kinds are hidden elsewhere: the validator rejects
  // them off that screen, so offering them would only produce a save error.
  const kinds = [
    'none',
    'navigate',
    'openUrl',
    'back',
    'refresh',
    'signOut',
    'logHabit',
    'logMood',
    ...(screen === 'onboarding' ? ['step', 'submitOnboarding'] : []),
  ];

  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });

  return (
    <Labelled label={label}>
      <div className="space-y-2">
        <select
          className={inputCls}
          value={kind}
          onChange={(e) => onChange({ kind: e.target.value })}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {humanize(k)}
            </option>
          ))}
        </select>

        {kind === 'navigate' ? (
          <select
            className={inputCls}
            value={(value?.href as string) ?? ''}
            onChange={(e) => set({ href: e.target.value })}>
            <option value="">Choose a screen…</option>
            {catalog.routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : null}

        {kind === 'openUrl' ? (
          <input
            className={inputCls}
            placeholder="https://…"
            value={(value?.url as string) ?? ''}
            onChange={(e) => set({ url: e.target.value })}
          />
        ) : null}

        {kind === 'logHabit' ? (
          <div className="grid grid-cols-2 gap-2">
            <select
              className={inputCls}
              value={(value?.metric as string) ?? 'water_ml'}
              onChange={(e) => set({ metric: e.target.value })}>
              {['water_ml', 'sleep_hours', 'exercise_minutes'].map((m) => (
                <option key={m} value={m}>
                  {humanize(m)}
                </option>
              ))}
            </select>
            <input
              type="number"
              className={inputCls}
              placeholder="Add (e.g. 250)"
              value={(value?.delta as number) ?? ''}
              onChange={(e) =>
                set({ delta: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>
        ) : null}

        {kind === 'logMood' ? (
          <input
            type="number"
            min={1}
            max={5}
            className={inputCls}
            placeholder="1–5"
            value={(value?.value as number) ?? ''}
            onChange={(e) => set({ value: Number(e.target.value) })}
          />
        ) : null}

        {kind === 'step' ? (
          <input
            type="number"
            className={inputCls}
            placeholder="+1 for next, -1 for back"
            value={(value?.by as number) ?? ''}
            onChange={(e) => set({ by: Number(e.target.value) })}
          />
        ) : null}
      </div>
    </Labelled>
  );
}

const SIMPLE_OPS = ['truthy', 'empty', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;

function ConditionField({
  label,
  hint,
  value,
  catalog,
  onChange,
}: {
  label: string;
  hint?: string;
  value: Record<string, unknown> | undefined;
  catalog: Catalog;
  onChange: (v: unknown) => void;
}) {
  const op = (value?.op as string) ?? '';

  return (
    <Labelled label={label} hint={hint}>
      <div className="space-y-2">
        <select
          className={inputCls}
          value={op}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) return onChange(undefined);
            if (next === 'feature') return onChange({ op: 'feature', feature: '' });
            onChange({ op: next, left: (value?.left as string) ?? '' });
          }}>
          <option value="">Always show</option>
          <option value="feature">Plan includes feature…</option>
          {SIMPLE_OPS.map((o) => (
            <option key={o} value={o}>
              {humanize(o)}
            </option>
          ))}
        </select>

        {op === 'feature' ? (
          <input
            className={inputCls}
            placeholder="e.g. community"
            value={(value?.feature as string) ?? ''}
            onChange={(e) => onChange({ op: 'feature', feature: e.target.value })}
          />
        ) : null}

        {SIMPLE_OPS.includes(op as (typeof SIMPLE_OPS)[number]) ? (
          <>
            <input
              className={inputCls}
              placeholder="{{home.snapshot.score}}"
              value={(value?.left as string) ?? ''}
              onChange={(e) => onChange({ ...value, left: e.target.value })}
            />
            {op !== 'truthy' && op !== 'empty' ? (
              <input
                className={inputCls}
                placeholder="Compare to…"
                value={(value?.right as string | number) ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = Number(raw);
                  onChange({ ...value, right: raw !== '' && Number.isFinite(n) ? n : raw });
                }}
              />
            ) : null}
          </>
        ) : null}

        {/* `and` / `or` / `not` are valid in the schema but are not offered
            here: nested boolean trees need a builder of their own, and the
            screens this editor targets have not needed one. Authored trees that
            contain them still validate, save and publish untouched. */}
        <p className="text-[11px] text-muted-foreground">
          Plan gates are resolved before the layout reaches a phone — a hidden
          feature is never sent to a device.
          {catalog.schemaVersion ? '' : ''}
        </p>
      </div>
    </Labelled>
  );
}

interface Opt {
  value: string;
  label: string;
}

function OptionsField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Opt[];
  onChange: (v: unknown) => void;
}) {
  const set = (i: number, patch: Partial<Opt>) =>
    onChange(value.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  return (
    <Labelled label={label}>
      <div className="space-y-2">
        {value.map((opt, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Label"
              value={opt.label}
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Stored value"
              value={opt.value}
              onChange={(e) => set(i, { value: e.target.value })}
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-lg px-2 text-destructive hover:bg-destructive/10"
              aria-label="Remove option">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...value, { value: '', label: '' }])}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-foreground/20 px-3 py-1.5 text-xs hover:bg-foreground/5">
          <Plus className="h-3.5 w-3.5" /> Add option
        </button>
      </div>
    </Labelled>
  );
}

/**
 * Raw JSON for `native` props.
 *
 * Parse failures are held locally rather than propagated: clearing the parent's
 * value on every intermediate keystroke would delete the author's work as they
 * typed the first `{`.
 */
function JsonField({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const text = value === undefined ? '' : JSON.stringify(value, null, 2);
  return (
    <textarea
      className={cn(inputCls, 'min-h-[100px] font-mono text-xs')}
      defaultValue={text}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        if (!raw) return onChange(undefined);
        try {
          onChange(JSON.parse(raw));
        } catch {
          /* leave the previous value; the textarea keeps showing what they typed */
        }
      }}
    />
  );
}

function AddNodeSelect({
  catalog,
  screen,
  parentType,
  onPick,
}: {
  catalog: Catalog;
  screen: ScreenKey;
  parentType: string;
  onPick: (type: string) => void;
}) {
  const allowed = Object.entries(catalog.nodes).filter(([, spec]) => {
    if (spec.screens && !spec.screens.includes(screen)) return false;
    if (spec.parents && !spec.parents.includes(parentType)) return false;
    return true;
  });

  const groups = ['structure', 'content', 'interactive', 'logic', 'screen'] as const;

  return (
    <select
      className={inputCls}
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}>
      <option value="">Add a block…</option>
      {groups.map((group) => {
        const inGroup = allowed.filter(([, spec]) => spec.group === group);
        if (!inGroup.length) return null;
        return (
          <optgroup key={group} label={humanize(group)}>
            {inGroup.map(([type, spec]) => (
              <option key={type} value={type}>
                {spec.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

// ────────────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-foreground/15 bg-background px-3 py-1.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30';

function Labelled({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Trash2;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border border-foreground/15 px-2.5 py-1.5 text-xs transition-colors hover:bg-foreground/5',
        destructive && 'text-destructive hover:bg-destructive/10',
      )}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function humanize(s: string): string {
  return s.replace(/[_.]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}
