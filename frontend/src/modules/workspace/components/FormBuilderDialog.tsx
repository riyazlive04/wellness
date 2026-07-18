import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  clientsApi,
  type AssessmentFormQuestion,
  type AssessmentQuestionType,
} from '@/modules/workspace/api/clients';

/**
 * Build a workspace-level custom assessment form (reusable across all clients).
 * On save it POSTs to /workspaces/me/assessment-forms and invalidates the
 * ['assessment-forms'] query so lists refresh everywhere.
 */
export function FormBuilderDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<AssessmentFormQuestion[]>([]);
  const [qLabel, setQLabel] = useState('');
  const [qType, setQType] = useState<AssessmentQuestionType>('scale');
  const [qOpts, setQOpts] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      clientsApi.createAssessmentForm({
        name: name.trim(),
        description: description.trim() || undefined,
        questions,
      }),
    onSuccess: () => {
      toast.success('Form saved');
      qc.invalidateQueries({ queryKey: ['assessment-forms'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save the form.'),
  });

  function addQuestion() {
    const label = qLabel.trim();
    if (!label) { toast('Write the question first'); return; }
    const q: AssessmentFormQuestion = { id: `q${Date.now().toString(36)}`, question: label, type: qType };
    if (qType === 'scale') q.max = 5;
    if (qType === 'choice' || qType === 'multi') {
      q.options = (qOpts || 'Option A, Option B').split(',').map((s) => s.trim()).filter(Boolean);
    }
    setQuestions((s) => [...s, q]);
    setQLabel(''); setQOpts('');
  }

  const inputCls = 'w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none';
  // Same look as inputCls, minus the bits SelectTrigger already provides (its
  // own border width + focus ring). h-auto lets the padding set the height,
  // exactly as it did on the native <select>.
  const triggerCls = 'h-auto w-full rounded-xl border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60';
  const needsOptions = qType === 'choice' || qType === 'multi';
  const canSave = name.trim().length > 1 && questions.length > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
        style={{ maxHeight: '86vh' }}
      >
        <header className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div className="text-base font-semibold">Build assessment form</div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]" aria-label="Close">✕</button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/70">Form name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. New-client wellness intake" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/70">Intro (optional)</div>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Shown at the top of the form" />
          </div>

          {questions.length > 0 && (
            <div className="space-y-2">
              {questions.map((qq, i) => (
                <div
                  key={qq.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${qq.type === 'section' ? 'border-teal-400/30 bg-teal-400/[0.07]' : 'border-foreground/[0.08] bg-foreground/[0.02]'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm ${qq.type === 'section' ? 'font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300' : 'font-medium'}`}>{qq.question}</div>
                    {qq.type !== 'section' && (
                      <div className="text-[11px] text-foreground/45">{qq.type}{qq.options ? `: ${qq.options.join(', ')}` : ''}</div>
                    )}
                  </div>
                  <button type="button" onClick={() => setQuestions((s) => s.filter((_, idx) => idx !== i))} className="text-foreground/40 hover:text-rose-500" aria-label="Remove">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-3">
            <div className="text-[11px] text-foreground/50">Add a <b>section header</b> to group fields (like Patient Information / Anthropometric), then add the fields under it.</div>
            <input value={qLabel} onChange={(e) => setQLabel(e.target.value)} className={inputCls} placeholder={qType === 'section' ? 'Section title (e.g. Clinical assessment)' : 'Question text'} />
            <div className="flex gap-2">
              <Select value={qType} onValueChange={(v) => setQType(v as AssessmentQuestionType)}>
                <SelectTrigger aria-label="Question type" className={`${triggerCls} flex-1`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="section" className="text-sm">- Section header -</SelectItem>
                  <SelectItem value="scale" className="text-sm">Scale (1-5)</SelectItem>
                  <SelectItem value="yesno" className="text-sm">Yes / No</SelectItem>
                  <SelectItem value="number" className="text-sm">Number</SelectItem>
                  <SelectItem value="text" className="text-sm">Short text</SelectItem>
                  <SelectItem value="choice" className="text-sm">Multiple choice</SelectItem>
                  <SelectItem value="multi" className="text-sm">Checkboxes</SelectItem>
                </SelectContent>
              </Select>
              <button type="button" onClick={addQuestion} className="inline-flex items-center gap-1.5 rounded-xl border border-foreground/10 px-3 text-sm font-medium hover:bg-foreground/[0.05]">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            {needsOptions && (
              <input value={qOpts} onChange={(e) => setQOpts(e.target.value)} className={inputCls} placeholder="Options, comma-separated" />
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
          <div className="text-[11px] text-foreground/55">{questions.length} question{questions.length === 1 ? '' : 's'}</div>
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={!canSave || createMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save form
          </button>
        </footer>
      </div>
    </div>
  );
}
