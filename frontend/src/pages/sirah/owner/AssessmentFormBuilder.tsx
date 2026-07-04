import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { clientsApi, type AssessmentFormQuestion, type AssessmentQuestionType } from '@/modules/workspace/api/clients';

const TYPE_LABEL: Record<AssessmentQuestionType, string> = {
  section: 'Section header',
  scale: 'Rating scale',
  yesno: 'Yes / No',
  number: 'Number',
  text: 'Short text',
  choice: 'Multiple choice',
  multi: 'Checkboxes',
};
const FIELD_TYPES: AssessmentQuestionType[] = ['text', 'number', 'scale', 'yesno', 'choice', 'multi'];

let _uid = 0;
function newId(): string { return `q${Date.now().toString(36)}${_uid++}`; }

export default function AssessmentFormBuilder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ws = readWorkspace();

  const [name, setName] = useState('');
  const [intro, setIntro] = useState('');
  const [items, setItems] = useState<AssessmentFormQuestion[]>([
    { id: newId(), question: 'Patient information', type: 'section' },
    { id: newId(), question: 'Full name', type: 'text' },
  ]);

  const createMut = useMutation({
    mutationFn: () =>
      clientsApi.createAssessmentForm({
        name: name.trim(),
        description: intro.trim() || undefined,
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
          }))
          .filter((q) => q.question.length > 0),
      }),
    onSuccess: () => {
      toast.success('Form saved');
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
  const visible = items.filter((q) => q.question.trim());

  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials} topbarContext="New form">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/assessments" className="inline-flex items-center gap-1.5 text-sm text-foreground/60 transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Assessment forms
          </Link>
          <button
            type="button"
            disabled={!canSave || createMut.isPending}
            onClick={() => createMut.mutate()}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          >
            {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save form
          </button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* ── Builder ── */}
          <div className="space-y-4">
            <Glass className="space-y-3 p-5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Form name — e.g. New-client wellness intake"
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
                  className={`rounded-2xl transition ${overIndex === i && dragIndex !== null && dragIndex !== i ? 'ring-2 ring-violet-400/50' : ''} ${dragIndex === i ? 'opacity-50' : ''}`}
                >
                <Glass className={`p-3 ${q.type === 'section' ? 'border-l-2 border-violet-400/50' : ''}`}>
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
                    <select
                      value={q.type}
                      onChange={(e) => {
                        const nt = e.target.value as AssessmentQuestionType;
                        const patch: Partial<AssessmentFormQuestion> = { type: nt };
                        if ((nt === 'choice' || nt === 'multi') && !(q.options && q.options.length)) patch.options = ['', ''];
                        update(i, patch);
                      }}
                      className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 py-1.5 text-xs outline-none"
                    >
                      <option value="section">Section</option>
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                    {q.type === 'scale' && (
                      <label className="ml-1 flex select-none items-center gap-1.5 text-xs text-foreground/60" title="Highest number on the rating scale">
                        Rate 1 –
                        <input
                          type="number"
                          min={2}
                          max={10}
                          value={q.max ?? 5}
                          onChange={(e) => update(i, { max: Math.min(10, Math.max(2, Math.round(Number(e.target.value) || 5))) })}
                          className="w-14 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 py-1 text-xs outline-none focus:border-violet-400/60"
                        />
                      </label>
                    )}
                    {q.type !== 'section' && (
                      <label className="ml-1 flex cursor-pointer select-none items-center gap-1.5 text-xs text-foreground/60">
                        <input type="checkbox" checked={!!q.required} onChange={(e) => update(i, { required: e.target.checked })} className="accent-rose-500" />
                        Required
                      </label>
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
                    className={`mt-2 w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm outline-none focus:border-violet-400/60 ${q.type === 'section' ? 'font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300' : ''}`}
                  />
                  {(q.type === 'choice' || q.type === 'multi') && (
                    <div className="mt-2 space-y-1.5">
                      {(q.options ?? []).map((opt, oi) => (
                        <div
                          key={oi}
                          onDragOver={(e) => { if (optDrag && optDrag.f === i) { e.preventDefault(); setOptOver({ f: i, o: oi }); } }}
                          onDrop={() => { if (optDrag && optDrag.f === i) moveOption(i, optDrag.o, oi); }}
                          className={`flex items-center gap-2 rounded-lg transition ${optOver && optOver.f === i && optOver.o === oi && optDrag && optDrag.o !== oi ? 'ring-2 ring-violet-400/40' : ''} ${optDrag && optDrag.f === i && optDrag.o === oi ? 'opacity-40' : ''}`}
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
                            className="flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-sm outline-none focus:border-violet-400/60"
                          />
                          <button type="button" onClick={() => removeOption(i, oi)} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-foreground/35 hover:bg-rose-500/10 hover:text-rose-500" aria-label="Remove option">✕</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addOption(i)} className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline dark:text-violet-300">
                        <Plus className="h-3.5 w-3.5" /> Add option
                      </button>
                    </div>
                  )}
                </Glass>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => add('text')} className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-4 py-2 text-sm font-medium hover:bg-foreground/[0.05]"><Plus className="h-4 w-4" /> Add field</button>
              <button type="button" onClick={() => add('section')} className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-400/[0.06] px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-400/[0.12] dark:text-violet-300"><Plus className="h-4 w-4" /> Add section</button>
            </div>
          </div>

          {/* ── Live preview ── */}
          <div>
            <div className="sticky top-6">
              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">Live preview · what the client sees</div>
              <Glass variant="heavy" className="overflow-hidden">
                <div className="border-b border-foreground/[0.06] px-6 py-5">
                  <div className="text-lg font-semibold">{name.trim() || 'Untitled form'}</div>
                  {intro.trim() && <div className="mt-1 text-xs text-foreground/60">{intro}</div>}
                </div>
                <div className="max-h-[68vh] space-y-4 overflow-y-auto p-6">
                  {visible.length === 0 ? (
                    <div className="py-12 text-center text-sm text-foreground/40">Add fields to see the preview.</div>
                  ) : (
                    visible.map((q) => <PreviewField key={q.id} q={q} />)
                  )}
                </div>
              </Glass>
            </div>
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}

function PreviewField({ q }: { q: AssessmentFormQuestion }) {
  if (q.type === 'section') {
    return (
      <div className="flex items-center gap-3 pt-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">{q.question}</div>
        <div className="h-px flex-1 bg-foreground/[0.10]" />
      </div>
    );
  }
  const boxCls = 'w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm text-foreground/45';
  const opts = (q.options ?? []).filter(Boolean);
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-foreground/90">{q.question}{q.required && <span className="text-rose-500"> *</span>}</div>
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
        <div className="space-y-1.5">
          {opts.length === 0 ? (
            <div className="text-xs text-foreground/35">Add options…</div>
          ) : opts.map((o) => (
            <div key={o} className="flex items-center gap-2 text-sm text-foreground/60">
              <span className={`h-4 w-4 border border-foreground/25 ${q.type === 'choice' ? 'rounded-full' : 'rounded'}`} />
              {o}
            </div>
          ))}
        </div>
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
