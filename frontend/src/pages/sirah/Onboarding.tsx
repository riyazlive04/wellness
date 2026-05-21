import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';

import { OnboardingProvider, useOnboarding } from '@/modules/onboarding/OnboardingContext';
import { OnboardingLayout } from '@/modules/onboarding/OnboardingLayout';
import { StepPlan } from '@/modules/onboarding/steps/StepPlan';
import { StepWorkspace } from '@/modules/onboarding/steps/StepWorkspace';
import { StepKyc } from '@/modules/onboarding/steps/StepKyc';
import { StepInvite } from '@/modules/onboarding/steps/StepInvite';

const STEP_META = [
  {
    title: 'Choose your plan',
    subtitle:
      'Start with a 30-day free trial — no payment until day 31. Switch plans anytime as your practice grows.',
    nextLabel: 'Start free trial',
  },
  {
    title: 'Set up your workspace',
    subtitle:
      'Your practice identity. This shows up on invoices, client invites, and your client portal.',
    nextLabel: 'Continue',
  },
  {
    title: 'Tax & invoicing details',
    subtitle:
      'For GST-compliant invoices. You can skip GSTIN now and add it before your first invoice.',
    nextLabel: 'Continue',
  },
  {
    title: 'Invite your first client',
    subtitle:
      'Send a personalized link via WhatsApp or email. Or skip — you can do this anytime from your dashboard.',
    nextLabel: 'Finish onboarding',
  },
] as const;

function OnboardingInner() {
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const [step, setStep] = useState(1);
  const [finishing, setFinishing] = useState(false);

  const totalSteps = STEP_META.length;
  const meta = STEP_META[step - 1];

  const canContinue = (() => {
    switch (step) {
      case 1: return draft.planId !== null;
      case 2: return draft.practiceName.trim().length > 1 && draft.specializations.length > 0;
      case 3: return draft.pan.length === 10 && draft.city.trim() && draft.state.trim() && draft.pincode.length === 6;
      case 4: return true; // invite step is always advanceable; can also skip
      default: return false;
    }
  })();

  const skippableOnInvite = step === 4;

  async function finish() {
    setFinishing(true);
    try {
      // Backend isn't booted yet — this is where we'd POST /api/v1/workspaces.
      // For now, persist the draft locally and welcome them in.
      localStorage.setItem('sirah:workspace:draft', JSON.stringify(draft));
      toast.success('Workspace ready. Welcome to SIRAH LIFE.');
      navigate('/sirah/dashboard');
    } catch (e) {
      toast.error('Something went wrong finalising your workspace.');
      console.error(e);
    } finally {
      setFinishing(false);
    }
  }

  function handleNext() {
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }

  function handleSkip() {
    if (step === 4) finish();
  }

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      title={meta.title}
      subtitle={meta.subtitle}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      onNext={handleNext}
      onSkip={skippableOnInvite ? handleSkip : undefined}
      canContinue={canContinue}
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
          {step === 4 && <StepInvite />}
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
