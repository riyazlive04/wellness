import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';

import { OnboardingProvider, useOnboarding, type OnboardingDraft } from '@/modules/onboarding/OnboardingContext';
import { OnboardingLayout } from '@/modules/onboarding/OnboardingLayout';
import { StepPlan } from '@/modules/onboarding/steps/StepPlan';
import { StepWorkspace } from '@/modules/onboarding/steps/StepWorkspace';
import { StepKyc, isDocValid } from '@/modules/onboarding/steps/StepKyc';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { verificationApi } from '@/modules/workspace/api/verification';
import { ApiError } from '@/lib/api';

const STEPS = [
  {
    label: 'Choose a plan',
    description: 'Free for 14 days, no card needed',
    title: 'Choose your plan',
    subtitle: 'Every plan starts with a 14-day free trial. Pick the one that fits your practice today; you can switch anytime.',
    nextLabel: 'Continue',
  },
  {
    label: 'Your practice',
    description: 'Name, logo and focus areas',
    title: 'Tell us about your practice',
    subtitle: 'This is how your clients will see you: on invites, invoices and their app.',
    nextLabel: 'Continue',
  },
  {
    label: 'Verification & tax',
    description: 'ID document, GST and address',
    title: 'Verification & tax details',
    subtitle: 'We verify every practice to keep NUSI trusted, and use your address and GSTIN for GST-compliant invoices.',
    nextLabel: 'Create my practice',
  },
] as const;

const DOC_LABEL: Record<OnboardingDraft['docType'], string> = {
  pan: 'PAN card',
  aadhaar: 'Aadhaar card',
  driving_license: 'Driving licence',
};

/** The practice now exists: attach the logo and send the ID document for review. */
async function saveExtras(draft: OnboardingDraft): Promise<string[]> {
  const failed: string[] = [];
  if (draft.logoDataUrl) {
    await workspacesApi.updateBranding({ logo_url: draft.logoDataUrl }).catch(() => failed.push('logo'));
  }
  if (draft.docFileDataUrl && draft.docFileName) {
    try {
      const blob = await (await fetch(draft.docFileDataUrl)).blob();
      const ticket = await verificationApi.uploadTicket(draft.docFileName);
      const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      await verificationApi.submit({
        pan: draft.docType === 'pan' ? draft.pan.trim() || undefined : undefined,
        gstin: draft.gstin.trim() || undefined,
        documents: [{ type: DOC_LABEL[draft.docType], file_name: draft.docFileName, storage_key: ticket.storageKey }],
      });
    } catch {
      failed.push('ID document');
    }
  }
  return failed;
}

function OnboardingInner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { draft, reset } = useOnboarding();
  const [step, setStep] = useState(1);
  const [finishing, setFinishing] = useState(false);

  const total = STEPS.length;
  const meta = STEPS[step - 1];

  // What's still missing on this step, shown next to the disabled button.
  const missing = (() => {
    switch (step) {
      case 1: return draft.planId === null ? 'Pick a plan to continue' : null;
      case 2:
        if (draft.practiceName.trim().length < 2) return 'Add your practice name';
        if (draft.specializations.length === 0) return 'Pick at least one specialization';
        return null;
      case 3:
        if (!isDocValid(draft.docType, draft.pan)) return `Enter a valid ${DOC_LABEL[draft.docType]} number`;
        if (!draft.docFileName) return `Upload your ${DOC_LABEL[draft.docType]}`;
        if (!draft.city.trim() || !draft.state.trim()) return 'Add your city and state';
        if (draft.pincode.length !== 6) return 'Add a 6-digit pincode';
        return null;
      default: return null;
    }
  })();

  async function finish() {
    setFinishing(true);
    try {
      const workspace = await workspacesApi.create({
        name:            draft.practiceName.trim(),
        city:            draft.city.trim() || undefined,
        state:           draft.state.trim() || undefined,
        pincode:         draft.pincode || undefined,
        country_code:    'IN',
        gstin:           draft.gstin.trim() || undefined,
        // Only a PAN belongs in the PAN field; Aadhaar / licence numbers aren't stored.
        pan:             draft.docType === 'pan' ? draft.pan.trim() || undefined : undefined,
        specializations: draft.specializations,
      });
      // Keep a copy locally so the Sidebar / Topbar can show the practice
      // name immediately without a second round-trip on first render.
      localStorage.setItem('sirah:workspace:draft', JSON.stringify({
        practiceName: workspace.name,
        workspaceId:  workspace.id,
      }));
      const failed = await saveExtras(draft);
      if (failed.length) {
        toast.warning(`${workspace.name} is ready, but your ${failed.join(' and ')} didn't save. You can add ${failed.length > 1 ? 'them' : 'it'} in Settings.`);
      } else {
        toast.success(`Welcome to NUSI - ${workspace.name} is ready.`);
      }
      reset();
      // The user is now tier 'workspace' — drop the stale 'unaffiliated' scope
      // so the dashboard guard sees the new workspace instead of bouncing back.
      await queryClient.invalidateQueries({ queryKey: ['scope'] });
      navigate('/dashboard');
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : 'Something went wrong creating your practice. Please try again.';
      toast.error(msg);
      console.error('[onboarding] create workspace failed', e);
    } finally {
      setFinishing(false);
    }
  }

  function handleNext() {
    if (step < total) {
      setStep((s) => s + 1);
    } else {
      void finish();
    }
  }

  return (
    <OnboardingLayout
      step={step}
      steps={STEPS.map(({ label, description }) => ({ label, description }))}
      title={meta.title}
      subtitle={meta.subtitle}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      onNext={handleNext}
      canContinue={missing === null}
      hint={missing ?? undefined}
      nextLabel={meta.nextLabel}
      loading={finishing}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === 1 && <StepPlan />}
          {step === 2 && <StepWorkspace />}
          {step === 3 && <StepKyc />}
        </motion.div>
      </AnimatePresence>
    </OnboardingLayout>
  );
}

export default function SirahOnboarding() {
  return (
    <OnboardingProvider>
      <OnboardingInner />
    </OnboardingProvider>
  );
}
