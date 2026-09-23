import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';
import {
  childSlotsOf,
  type AnyNode,
  type Catalog,
  type ChildSlot,
} from '@/modules/workspace/api/appLayout';

/**
 * The layout tree.
 *
 * Shows structure, not a preview. An author needs to see that the Community row
 * sits inside the Connect section and can be moved out of it; a thumbnail of the
 * phone cannot express that, and a WYSIWYG canvas for a tree this shallow would
 * be a lot of machinery to make reordering six rows harder than two buttons.
 *
 * Errors are surfaced ON the node they belong to. A flat error list at the
 * bottom of a form means hunting for "root.children[2].children[0].label".
 */
export interface TreeProps {
  root: AnyNode;
  catalog: Catalog;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Node id → error messages, keyed by the editor's path-to-id resolution. */
  errorsByNode: Record<string, string[]>;
}

export function LayoutTree({ root, catalog, selectedId, onSelect, errorsByNode }: TreeProps) {
  return (
    <div className="space-y-0.5 text-sm">
      <TreeNode
        node={root}
        catalog={catalog}
        depth={0}
        selectedId={selectedId}
        onSelect={onSelect}
        errorsByNode={errorsByNode}
      />
    </div>
  );
}

function TreeNode({
  node,
  catalog,
  depth,
  selectedId,
  onSelect,
  errorsByNode,
  slotLabel,
}: {
  node: AnyNode;
  catalog: Catalog;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  errorsByNode: Record<string, string[]>;
  slotLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  const spec = catalog.nodes[node.type];
  const slots = childSlotsOf(node, spec);
  const hasChildren = slots.some((s) => (node[s] as AnyNode[] | undefined)?.length);
  const errors = errorsByNode[node.id] ?? [];
  const selected = selectedId === node.id;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.id);
          }
        }}
        className={cn(
          'group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors',
          selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-foreground/5',
          errors.length && !selected && 'bg-destructive/5',
        )}
        style={{ paddingLeft: 8 + depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-transparent" />
        )}

        <span className="truncate font-medium">{spec?.label ?? node.type}</span>

        {summaryOf(node) ? (
          <span className="truncate text-xs text-muted-foreground">{summaryOf(node)}</span>
        ) : null}

        {node.when ? (
          <span
            className="ml-auto shrink-0 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title="This node only renders when its condition passes">
            if
          </span>
        ) : null}

        {errors.length ? (
          <span
            className="ml-auto shrink-0 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
            title={errors.join('\n')}>
            {errors.length}
          </span>
        ) : null}
      </div>

      {open
        ? slots.map((slot) => {
            const kids = (node[slot] as AnyNode[] | undefined) ?? [];
            if (!kids.length) return null;
            return (
              <div key={slot}>
                {/* Only `if` has more than one slot, and there the branch
                    matters enough to label. */}
                {slot !== 'children' ? (
                  <div
                    className="px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                    style={{ paddingLeft: 26 + depth * 14 }}>
                    {slotHeading(slot)}
                  </div>
                ) : null}
                {kids.map((kid) => (
                  <TreeNode
                    key={kid.id}
                    node={kid}
                    catalog={catalog}
                    depth={depth + 1}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    errorsByNode={errorsByNode}
                  />
                ))}
              </div>
            );
          })
        : null}
    </div>
  );
}

function slotHeading(slot: ChildSlot): string {
  if (slot === 'then') return 'When true';
  if (slot === 'else') return 'Otherwise';
  if (slot === 'empty') return 'When empty';
  return '';
}

/** The most identifying prop, so the tree reads as content rather than types. */
function summaryOf(node: AnyNode): string {
  const candidates = ['label', 'title', 'value', 'component', 'route', 'key', 'each', 'url'];
  for (const key of candidates) {
    const v = node[key];
    if (typeof v === 'string' && v.trim()) return `· ${v.length > 40 ? `${v.slice(0, 40)}…` : v}`;
  }
  return '';
}
