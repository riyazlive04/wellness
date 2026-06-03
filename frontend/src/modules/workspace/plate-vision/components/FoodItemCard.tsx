import { Minus, Plus, Pencil, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { DetectedItem } from '../types';

interface FoodItemCardProps {
  item: DetectedItem;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (next: DetectedItem) => void;
}

/**
 * FoodItemCard — a single detected food row. Click anywhere to highlight
 * the matching bounding box. Edit-pencil opens an inline portion editor.
 */
export function FoodItemCard({ item, selected, onSelect, onUpdate }: FoodItemCardProps) {
  const [editing, setEditing] = useState(false);
  const [tmpName, setTmpName] = useState(item.name);

  function adjustPortion(deltaG: number) {
    const next = Math.max(0, item.portionG + deltaG);
    const factor = next / item.portionG;
    onUpdate({
      ...item,
      portionG: next,
      macros: {
        calories: Math.round(item.macros.calories * factor),
        protein:  +(item.macros.protein  * factor).toFixed(1),
        carbs:    +(item.macros.carbs    * factor).toFixed(1),
        fat:      +(item.macros.fat      * factor).toFixed(1),
        fiber:    item.macros.fiber !== undefined ? +(item.macros.fiber * factor).toFixed(1) : undefined,
      },
    });
  }

  function commitName() {
    onUpdate({ ...item, name: tmpName.trim() || item.name });
    setEditing(false);
  }

  const confidenceColor =
    item.confidence >= 0.9
      ? 'text-emerald-700 dark:text-emerald-300'
      : item.confidence >= 0.75
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-rose-700 dark:text-rose-300';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      className={cn(
        'group relative cursor-pointer rounded-2xl border bg-foreground/[0.02] p-4 transition-all',
        selected
          ? 'border-emerald-400/60 bg-emerald-400/[0.04] ring-1 ring-emerald-400/30'
          : 'border-foreground/[0.06] hover:border-foreground/15 hover:bg-foreground/[0.04]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Name (editable) */}
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={tmpName}
                onChange={(e) => setTmpName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') setEditing(false);
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                className="flex-1 rounded-lg border border-violet-400/40 bg-foreground/[0.06] px-2 py-1 text-sm text-foreground focus:border-violet-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  commitName();
                }}
                className="grid h-6 w-6 place-items-center rounded-md bg-emerald-400/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-400/30"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h4 className="truncate text-sm font-medium text-foreground">{item.name}</h4>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                  setTmpName(item.name);
                }}
                className="text-foreground/30 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                aria-label="Edit name"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Source + confidence */}
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="text-foreground/75 dark:text-foreground/55">{item.source}</span>
            <span className="h-1 w-1 rounded-full bg-foreground/20" />
            <span className={confidenceColor}>{Math.round(item.confidence * 100)}% confident</span>
          </div>
        </div>

        {/* Calories pill */}
        <div className="flex-shrink-0 text-right">
          <div className="text-base font-semibold tabular-nums text-foreground">{item.macros.calories}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">kcal</div>
        </div>
      </div>

      {/* Portion + macros */}
      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        {/* Portion control */}
        <div
          className="flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-1 py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => adjustPortion(-10)}
            className="grid h-6 w-6 place-items-center rounded-full text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
            aria-label="Decrease portion"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[44px] text-center text-xs tabular-nums text-foreground">
            {item.portionG} g
          </span>
          <button
            type="button"
            onClick={() => adjustPortion(10)}
            className="grid h-6 w-6 place-items-center rounded-full text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
            aria-label="Increase portion"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Macro pills */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-foreground/80 dark:text-foreground/65">
          <span>
            <span className="text-foreground/85">{item.macros.protein}g</span> protein
          </span>
          <span>
            <span className="text-foreground/85">{item.macros.carbs}g</span> carbs
          </span>
          <span>
            <span className="text-foreground/85">{item.macros.fat}g</span> fat
          </span>
          {item.macros.fiber !== undefined && (
            <span>
              <span className="text-foreground/85">{item.macros.fiber}g</span> fiber
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
