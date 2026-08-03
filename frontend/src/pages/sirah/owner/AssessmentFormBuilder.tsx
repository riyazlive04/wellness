import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Glass } from '@/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { clientsApi, type AssessmentFormQuestion, type AssessmentQuestionType } from '@/modules/workspace/api/clients';

const TYPE_LABEL: Record<AssessmentQuestionType, string> = {
  section: 'Section header',
  scale: 'Rating scale',
  yesno: 'Yes / No',
  number: 'Number',
  text: 'Short text',
  choice: 'Multiple choice',
  multi: 'Checkboxes',
  table: 'Table / grid',
};
const FIELD_TYPES: AssessmentQuestionType[] = ['text', 'number', 'scale', 'yesno', 'choice', 'multi', 'table'];

// Seeded when a field is first switched to `table`, so it renders as something
// recognisable (a lab panel) rather than an empty grid.
const DEFAULT_TABLE_ROWS = ['Fasting Blood Glucose', 'HbA1c'];
const DEFAULT_TABLE_COLUMNS = ['Result', 'Date', 'Reference Range'];

/** Textarea (one entry per line) ⇄ string[]. Blank lines are dropped. */
function linesToList(s: string): string[] {
  return s.split('\n').map((x) => x.trim()).filter(Boolean);
}

let _uid = 0;
function newId(): string { return `q${Date.now().toString(36)}${_uid++}`; }

// Layout is a 12-column grid. A field's `w` is its column span; sections always
// take a full row. MIN_SPAN keeps a field wide enough to stay usable.
const GRID_COLS = 12;
const MIN_SPAN = 3; // quarter width
function clampSpan(w: number): number { return Math.min(GRID_COLS, Math.max(MIN_SPAN, Math.round(w))); }
function spanOf(q: AssessmentFormQuestion): number {
  return q.type === 'section' ? GRID_COLS : clampSpan(q.w ?? GRID_COLS);
}
// Quick width presets shown in the editor.
const WIDTH_PRESETS: Array<{ label: string; w: number }> = [
  { label: '¼', w: 3 }, { label: '⅓', w: 4 }, { label: '½', w: 6 },
  { label: '⅔', w: 8 }, { label: '¾', w: 9 }, { label: 'Full', w: 12 },
];

export default function AssessmentFormBuilder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ws = readWorkspace();
  const { logoUrl } = useWorkspaceBrand();
  const { id } = useParams();
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [intro, setIntro] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [items, setItems] = useState<AssessmentFormQuestion[]>(
    isEdit
      ? []
      : [
          { id: newId(), question: 'Patient information', type: 'section' },
          { id: newId(), question: 'Full name', type: 'text' },
        ],
  );

  // Edit mode: pull the existing form (no get-by-id endpoint, so read the list
  // and pick it out) and hydrate the builder exactly once.
  const [hydrated, setHydrated] = useState(!isEdit);
  const formsQ = useQuery({
    queryKey: ['assessment-forms'],
    queryFn: () => clientsApi.listAssessmentForms(),
    enabled: isEdit,
  });
  useEffect(() => {
    if (!isEdit || hydrated || !formsQ.data) return;
    const form = formsQ.data.find((f) => f.id === id);
    if (form) {
      setName(form.name);
      setIntro(form.description ?? '');
      setStatus(form.status ?? 'published');
      setItems(form.questions.length ? form.questions : [{ id: newId(), question: '', type: 'text' }]);
      setHydrated(true);
    } else if (!formsQ.isLoading) {
      toast.error('That form no longer exists.');
      navigate('/assessments');
    }
  }, [isEdit, hydrated, formsQ.data, formsQ.isLoading, id, navigate]);

  const saveMut = useMutation({
    mutationFn: (nextStatus: 'draft' | 'published') => {
      const payload = {
        name: name.trim(),
        description: intro.trim() || undefined,
        status: nextStatus,
        questions: items
          .map((q) => ({
            id: q.id,
            question: q.question.trim(),
            type: q.type,
            ...(q.type === 'choice' || q.type === 'multi'
              ? { options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }
              : {}),
            ...(q.type === 'scale' ? { max: q.max ?? 5 } : {}),
            ...(q.type !== 'section' && q.required ? { required: true } : {}),
            ...(q.type !== 'section' && q.w && q.w !== 12 ? { w: clampSpan(q.w) } : {}),
          }))
          .filter((q) => q.question.length > 0),
      };
      return isEdit
        ? clientsApi.updateAssessmentForm(id!, payload)
        : clientsApi.createAssessmentForm(payload);
    },
    onSuccess: (_data, nextStatus) => {
      setStatus(nextStatus);
      toast.success(nextStatus === 'draft' ? 'Draft saved' : 'Form published');
      qc.invalidateQueries({ queryKey: ['assessment-forms'] });
      navigate('/assessments');
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save the form.'),
  });

  function update(i: number, patch: Partial<AssessmentFormQuestion>) {
    setItems((s) => s.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function move(i: number, dir: -1 | 1) {
    setItems((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const c = [...s];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }
  function remove(i: number) {
    setItems((s) => s.filter((_, idx) => idx !== i));
  }
  function add(type: AssessmentQuestionType) {
    setItems((s) => [...s, { id: newId(), question: '', type }]);
  }
  function updateOption(i: number, oi: number, value: string) {
    setItems((s) => s.map((q, idx) => (idx === i ? { ...q, options: (q.options ?? []).map((o, k) => (k === oi ? value : o)) } : q)));
  }
  function addOption(i: number) {
    setItems((s) => s.map((q, idx) => (idx === i ? { ...q, options: [...(q.options ?? []), ''] } : q)));
  }
  function removeOption(i: number, oi: number) {
    setItems((s) => s.map((q, idx) => (idx === i ? { ...q, options: (q.options ?? []).filter((_, k) => k !== oi) } : q)));
  }

  // Drag-and-drop reordering of fields.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  function handleDrop(target: number) {
    setItems((s) => {
      if (dragIndex === null || dragIndex === target) return s;
      const c = [...s];
      const [moved] = c.splice(dragIndex, 1);
      c.splice(target, 0, moved);
      return c;
    });
    setDragIndex(null);
    setOverIndex(null);
  }

  // Smooth drag-to-reorder on the layout canvas (dnd-kit). A small activation
  // distance means a click/resize doesn't accidentally start a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  function onCanvasDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((s) => {
      const from = s.findIndex((q) => q.id === active.id);
      const to = s.findIndex((q) => q.id === over.id);
      if (from === -1 || to === -1) return s;
      return arrayMove(s, from, to);
    });
  }

  // Drag-to-resize a field's column span on the layout canvas.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{ index: number; startX: number; startW: number; colW: number } | null>(null);
  useEffect(() => {
    if (!resizing) return;
    const { index, startX, startW, colW } = resizing;
    function onMove(e: PointerEvent) {
      const deltaCols = Math.round((e.clientX - startX) / Math.max(1, colW));
      update(index, { w: clampSpan(startW + deltaCols) });
    }
    function onUp() { setResizing(null); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  // Drag-and-drop reordering of options within a choice/checkbox field.
  const [optDrag, setOptDrag] = useState<{ f: number; o: number } | null>(null);
  const [optOver, setOptOver] = useState<{ f: number; o: number } | null>(null);
  function moveOption(f: number, from: number, to: number) {
    if (from === to) return;
    setItems((s) => s.map((q, idx) => {
      if (idx !== f) return q;
      const opts = [...(q.options ?? [])];
      const [m] = opts.splice(from, 1);
      opts.splice(to, 0, m);
      return { ...q, options: opts };
    }));
    setOptDrag(null);
    setOptOver(null);
  }

  const fieldCount = items.filter((q) => q.type !== 'section' && q.question.trim()).length;
  const canSave = name.trim().length > 1 && fieldCount > 0;

  // While the form being edited is still loading, show a spinner rather than a
  // flash of empty builder fields.
  if (isEdit && !hydrated) {
    return (
      <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials} topbarContext="Edit form">
        <div className="grid place-items-center py-24 text-foreground/50">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </OwnerLayout>
    );
  }

  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials} topbarContext={isEdit ? 'Edit form' : 'New form'}>
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/assessments" className="inline-flex items-center gap-1.5 text-sm text-foreground/60 transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Assessment forms
          </Link>
          <div className="flex items-center gap-2">
            {isEdit && (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${status === 'draft' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>
                {status === 'draft' ? 'Draft' : 'Published'}
              </span>
            )}
            <button
              type="button"
              disabled={!canSave || saveMut.isPending}
              onClick={() => saveMut.mutate('draft')}
              className="inline-flex items-center gap-2 rounded-full border border-foreground/12 px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
            >
              {saveMut.isPending && saveMut.variables === 'draft' && <Loader2 className="h-4 w-4 animate-spin" />}
              Save as draft
            </button>
            <button
              type="button"
              disabled={!canSave || saveMut.isPending}
              onClick={() => saveMut.mutate('published')}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50 disabled:hover:scale-100"
            >
              {saveMut.isPending && saveMut.variables === 'published' && <Loader2 className="h-4 w-4 animate-spin" />}
              {status === 'published' && isEdit ? 'Save changes' : 'Publish'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* ── Builder ── */}
          <div className="space-y-4">
            <Glass className="space-y-3 p-5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Form name - e.g. New-client wellness intake"
                className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-foreground/30"
                autoFocus
              />
              <input
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                placeholder="Add an intro shown at the top of the form (optional)"
                className="w-full bg-transparent text-sm text-foreground/70 outline-none placeholder:text-foreground/30"
              />
            </Glass>

            <div className="space-y-3">
              {items.map((q, i) => (
                <div
                  key={q.id}
                  onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setOverIndex(i); } }}
                  onDrop={() => handleDrop(i)}
                  className={`rounded-2xl transition ${overIndex === i && dragIndex !== null && dragIndex !== i ? 'ring-2 ring-teal-400/50' : ''} ${dragIndex === i ? 'opacity-50' : ''}`}
                >
                <Glass className={`p-3 ${q.type === 'section' ? 'border-l-2 border-teal-400/50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
                      onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                      className="grid h-7 w-5 flex-shrink-0 cursor-grab place-items-center rounded-md text-foreground/30 hover:text-foreground/60 active:cursor-grabbing"
                      aria-label="Drag to reorder"
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <Select
                      value={q.type}
                      onValueChange={(v) => {
                        const nt = v as AssessmentQuestionType;
                        const patch: Partial<AssessmentFormQuestion> = { type: nt };
                        if ((nt === 'choice' || nt === 'multi') && !(q.options && q.options.length)) patch.options = ['', ''];
                        if (nt === 'table') {
                          if (!q.rows?.length) patch.rows = [...DEFAULT_TABLE_ROWS];
                          if (!q.columns?.length) patch.columns = [...DEFAULT_TABLE_COLUMNS];
                          patch.w = 12; // a grid never reads well in a part-width column
                        }
                        update(i, patch);
                      }}
                    >
                      <SelectTrigger
                        aria-label="Field type"
                        className="h-auto w-[144px] flex-shrink-0 rounded-lg border-foreground/10 bg-foreground/[0.03] px-2 py-1.5 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="section" className="text-xs">Section</SelectItem>
                        {FIELD_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">{TYPE_LABEL[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {q.type === 'scale' && (
                      <label className="ml-1 flex select-none items-center gap-1.5 text-xs text-foreground/60" title="Highest number on the rating scale">
                        Rate 1 -
                        <input
                          type="number"
                          min={2}
                          max={10}
                          value={q.max ?? 5}
                          onChange={(e) => update(i, { max: Math.min(10, Math.max(2, Math.round(Number(e.target.value) || 5))) })}
                          className="w-14 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 py-1 text-xs outline-none focus:border-teal-400/60"
                        />
                      </label>
                    )}
                    {q.type !== 'section' && (
                      <label className="ml-1 flex cursor-pointer select-none items-center gap-1.5 text-xs text-foreground/60">
                        <input type="checkbox" checked={!!q.required} onChange={(e) => update(i, { required: e.target.checked })} className="accent-rose-500" />
                        Required
                      </label>
                    )}
                    {q.type !== 'section' && (
                      <div className="ml-1 flex items-center gap-0.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-0.5" title="Field width">
                        {WIDTH_PRESETS.map((p) => (
                          <button
                            key={p.w}
                            type="button"
                            onClick={() => update(i, { w: p.w })}
                            className={`rounded-md px-1.5 py-0.5 text-[11px] leading-none transition ${spanOf(q) === p.w ? 'bg-teal-500/20 font-semibold text-teal-700 dark:text-teal-300' : 'text-foreground/50 hover:text-foreground'}`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-0.5">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30" aria-label="Move up"><ChevronUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30" aria-label="Move down"><ChevronDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => remove(i)} className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-rose-500/10 hover:text-rose-500" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <input
                    value={q.question}
                    onChange={(e) => update(i, { question: e.target.value })}
                    placeholder={q.type === 'section' ? 'Section title (e.g. Anthropometric assessment)' : 'Field label (e.g. Weight)'}
                    className={`mt-2 w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm outline-none focus:border-teal-400/60 ${q.type === 'section' ? 'font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300' : ''}`}
                  />
                  {(q.type === 'choice' || q.type === 'multi') && (
                    <div className="mt-2 space-y-1.5">
                      {(q.options ?? []).map((opt, oi) => (
                        <div
                          key={oi}
                          onDragOver={(e) => { if (optDrag && optDrag.f === i) { e.preventDefault(); setOptOver({ f: i, o: oi }); } }}
                          onDrop={() => { if (optDrag && optDrag.f === i) moveOption(i, optDrag.o, oi); }}
                          className={`flex items-center gap-2 rounded-lg transition ${optOver && optOver.f === i && optOver.o === oi && optDrag && optDrag.o !== oi ? 'ring-2 ring-teal-400/40' : ''} ${optDrag && optDrag.f === i && optDrag.o === oi ? 'opacity-40' : ''}`}
                        >
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) => { setOptDrag({ f: i, o: oi }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(oi)); }}
                            onDragEnd={() => { setOptDrag(null); setOptOver(null); }}
                            className="grid h-6 w-4 flex-shrink-0 cursor-grab place-items-center text-foreground/25 hover:text-foreground/50 active:cursor-grabbing"
                            aria-label="Drag option"
                            title="Drag to reorder"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                          <span className={`h-3.5 w-3.5 flex-shrink-0 border border-foreground/25 ${q.type === 'choice' ? 'rounded-full' : 'rounded'}`} />
                          <input
                            value={opt}
                            onChange={(e) => updateOption(i, oi, e.target.value)}
                            placeholder={`Option ${oi + 1}`}
                            className="flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-sm outline-none focus:border-teal-400/60"
                          />
                          <button type="button" onClick={() => removeOption(i, oi)} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-foreground/35 hover:bg-rose-500/10 hover:text-rose-500" aria-label="Remove option">✕</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addOption(i)} className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-300">
                        <Plus className="h-3.5 w-3.5" /> Add option
                      </button>
                    </div>
                  )}
                  {q.type === 'table' && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-foreground/50">
                          Rows - one per line
                        </span>
                        <textarea
                          value={(q.rows ?? []).join('\n')}
                          onChange={(e) => update(i, { rows: linesToList(e.target.value) })}
                          rows={5}
                          placeholder={'Fasting Blood Glucose\nHbA1c\nVitamin D'}
                          className="w-full resize-y rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm outline-none focus:border-teal-400/60"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-foreground/50">
                          Columns - one per line
                        </span>
                        <textarea
                          value={(q.columns ?? []).join('\n')}
                          onChange={(e) => update(i, { columns: linesToList(e.target.value) })}
                          rows={5}
                          placeholder={'Result\nDate\nReference Range'}
                          className="w-full resize-y rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm outline-none focus:border-teal-400/60"
                        />
                      </label>
                      <p className="text-[11px] text-foreground/45 sm:col-span-2">
                        {(q.rows?.length ?? 0)} rows × {(q.columns?.length ?? 0)} columns ={' '}
                        {(q.rows?.length ?? 0) * (q.columns?.length ?? 0)} cells for the client to fill.
                        Max 40 rows and 6 columns. Answers are keyed by these labels, so renaming a row
                        after clients have replied orphans that row's existing answers.
                      </p>
                    </div>
                  )}
                </Glass>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => add('text')} className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-4 py-2 text-sm font-medium hover:bg-foreground/[0.05]"><Plus className="h-4 w-4" /> Add field</button>
              <button type="button" onClick={() => add('section')} className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/[0.06] px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-400/[0.12] dark:text-teal-300"><Plus className="h-4 w-4" /> Add section</button>
            </div>
          </div>

          {/* ── Layout canvas (live preview + drag-to-arrange) ── */}
          <div>
            <div className="sticky top-6">
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                <span>Layout · what the client sees</span>
                <span className="normal-case tracking-normal text-foreground/40">drag ⠿ to reorder · drag edge to resize</span>
              </div>
              <Glass variant="heavy" className="overflow-hidden">
                {/* Practice branding — the client sees who this form is from. */}
                <div className="flex items-center gap-2.5 border-b border-foreground/[0.06] bg-foreground/[0.02] px-6 py-3">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-xs font-bold text-white">
                      {ws.initials}
                    </span>
                  )}
                  <span className="text-sm font-bold tracking-tight">{ws.practiceName}</span>
                </div>
                <div className="border-b border-foreground/[0.06] px-6 py-5">
                  <div className="text-lg font-semibold">{name.trim() || 'Untitled form'}</div>
                  {intro.trim() && <div className="mt-1 text-xs text-foreground/60">{intro}</div>}
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCanvasDragEnd}>
                  <SortableContext items={items.map((q) => q.id)} strategy={rectSortingStrategy}>
                    <div
                      ref={canvasRef}
                      className={`grid max-h-[68vh] grid-cols-12 content-start gap-3 overflow-y-auto p-6 ${resizing ? 'select-none' : ''}`}
                    >
                      {items.filter((q) => q.question.trim()).length === 0 ? (
                        <div className="col-span-12 py-12 text-center text-sm text-foreground/40">Add fields to see the layout.</div>
                      ) : (
                        items.map((q, i) => (
                          <SortableFieldBlock
                            key={q.id}
                            q={q}
                            span={spanOf(q)}
                            onResizeStart={q.type === 'section' ? undefined : (e) => {
                              e.preventDefault();
                              const cw = canvasRef.current?.clientWidth ?? 600;
                              setResizing({ index: i, startX: e.clientX, startW: spanOf(q), colW: cw / GRID_COLS });
                            }}
                          >
                            <PreviewField q={q.type === 'section' || q.question.trim() ? q : { ...q, question: 'Untitled field' }} />
                          </SortableFieldBlock>
                        ))
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </Glass>
            </div>
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}

/**
 * One block on the layout canvas — smoothly draggable (dnd-kit) to reorder, and
 * resizable by its right edge. The drag handle carries the sortable listeners;
 * the resize handle is a separate pointer interaction.
 */
function SortableFieldBlock({ q, span, onResizeStart, children }: {
  q: AssessmentFormQuestion;
  span: number;
  onResizeStart?: (e: ReactPointerEvent) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const style: CSSProperties = {
    gridColumn: `span ${span} / span ${span}`,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl ${isDragging ? 'opacity-90 shadow-2xl ring-2 ring-teal-400/70' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1 z-10 hidden h-6 w-5 cursor-grab touch-none place-items-center rounded-md bg-popover/90 text-foreground/45 shadow-sm group-hover:grid active:cursor-grabbing"
        title="Drag to move"
        aria-label="Drag to move"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <div className="h-full rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-3 py-2.5">
        {children}
      </div>

      {onResizeStart && (
        <>
          <div
            onPointerDown={onResizeStart}
            className="absolute -right-1 top-0 z-10 flex h-full w-3 cursor-ew-resize touch-none items-center justify-center opacity-0 group-hover:opacity-100"
            title="Drag to resize width"
          >
            <div className="h-8 w-1 rounded-full bg-teal-400/70" />
          </div>
          <div className="pointer-events-none absolute bottom-1 right-2 rounded bg-popover/85 px-1 text-[9px] tabular-nums text-foreground/45 opacity-0 group-hover:opacity-100">
            {span}/12
          </div>
        </>
      )}
    </div>
  );
}

function PreviewField({ q }: { q: AssessmentFormQuestion }) {
  if (q.type === 'section') {
    return (
      <div className="flex items-center gap-3 pt-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">{q.question}</div>
        <div className="h-px flex-1 bg-foreground/[0.10]" />
      </div>
    );
  }
  const boxCls = 'w-full rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3.5 py-2.5 text-sm text-foreground/45';
  const opts = (q.options ?? []).filter(Boolean);
  return (
    <div>
      <div className="mb-2 text-sm font-semibold leading-snug text-foreground">{q.question}{q.required && <span className="text-rose-500"> *</span>}</div>
      {q.type === 'scale' ? (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: Math.max(2, q.max ?? 5) }, (_, i) => i + 1).map((n) => (
            <span key={n} className="grid h-8 w-8 place-items-center rounded-full border border-foreground/15 text-xs text-foreground/50">{n}</span>
          ))}
        </div>
      ) : q.type === 'yesno' ? (
        <div className="flex gap-2">{['Yes', 'No'].map((o) => <span key={o} className="rounded-lg border border-foreground/10 px-4 py-1.5 text-sm text-foreground/50">{o}</span>)}</div>
      ) : q.type === 'number' ? (
        <div className={boxCls}>0</div>
      ) : q.type === 'choice' || q.type === 'multi' ? (
        <div className="space-y-2">
          {opts.length === 0 ? (
            <div className="text-xs text-foreground/35">Add options…</div>
          ) : opts.map((o) => (
            <label key={o} className="flex items-start gap-2.5 rounded-lg border border-foreground/[0.07] bg-foreground/[0.02] px-2.5 py-1.5 text-sm text-foreground/80">
              <span className={`mt-[3px] h-4 w-4 flex-shrink-0 border border-foreground/30 bg-card ${q.type === 'choice' ? 'rounded-full' : 'rounded'}`} />
              <span className="leading-snug">{o}</span>
            </label>
          ))}
        </div>
      ) : q.type === 'table' ? (
        (q.rows ?? []).length === 0 || (q.columns ?? []).length === 0 ? (
          <div className="text-xs text-foreground/35">Add rows and columns…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-foreground/10 bg-foreground/[0.04] px-2 py-1" />
                  {(q.columns ?? []).map((c) => (
                    <th key={c} className="border border-foreground/10 bg-foreground/[0.04] px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-foreground/50">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(q.rows ?? []).map((r) => (
                  <tr key={r}>
                    <td className="border border-foreground/10 px-2 py-1 text-[12px] text-foreground/70">{r}</td>
                    {(q.columns ?? []).map((c) => (
                      <td key={c} className="border border-foreground/10 px-2 py-1">
                        <div className="h-5 rounded border border-foreground/10 bg-foreground/[0.03]" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className={`${boxCls} h-16`} />
      )}
    </div>
  );
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}
