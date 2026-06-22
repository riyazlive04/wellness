import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';

import { OnboardingProvider, useOnboarding } from '@/modules/onboarding/OnboardingContext';
import { OnboardingLayout } from '@/modules/onboarding/OnboardingLayout';
import { StepPlan } from '@/modules/onboarding/steps/StepPlan';
import { StepWorkspace } from '@/modules/onboarding/steps/StepWorkspace';
import { StepKyc } from '@/modules/onboarding/steps/StepKyc';
import { StepInvite } from '@/modules/onboarding/steps/StepInvite';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { ApiError } from '@/lib/api';

const STEP_META = [
  {
    title: 'Choose your plan',
    subtitle:
      'Start with a 30-day free trial — no payment until day 31. Switch plans anytime as your practice grows.',
    nextLabel: 'Start free trial',
    illustration: '/illustrations/onboarding-plan.png',
    illustrationAlt: 'Three subscription tier cards floating in a rising staircase',
  },
  {
    title: 'Set up your workspace',
    subtitle:
      'Your practice identity. This shows up on invoices, client invites, and your client portal.',
    nextLabel: 'Continue',
    illustration: '/illustrations/onboarding-workspace.png',
    illustrationAlt: 'Cozy isometric desk with laptop, plant, and a window with warm sunset light',
  },
  {
    title: 'Tax & invoicing details',
    subtitle:
      'For GST-compliant invoices. You can skip GSTIN now and add it before your first invoice.',
    nextLabel: 'Continue',
    illustration: '/illustrations/onboarding-tax.png',
    illustrationAlt: 'A friendly invoice document with a check stamp and floating rupee symbols',
  },
  {
    title: 'Invite your first client',
    subtitle:
      'Send a personalized link via WhatsApp or email. Or skip — you can do this anytime from your dashboard.',
    nextLabel: 'Finish onboarding',
    illustration: '/illustrations/onboarding-invite.png',
    illustrationAlt: 'Two avatar bubbles connected by a flowing arc with a paper plane flying between them',
  },
] as const;

function OnboardingInner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      const workspace = await workspacesApi.create({
        name:          draft.practiceName.trim(),
        city:          draft.city.trim() || undefined,
        country_code:  'IN',
        gstin:         draft.gstin.trim() || undefined,
        pan:           draft.pan.trim() || undefined,
      });
      // Keep a copy locally so the Sidebar / Topbar can show the practice
      // name immediately without a second round-trip on first render.
      localStorage.setItem('sirah:workspace:draft', JSON.stringify({
        practiceName: workspace.name,
        workspaceId:  workspace.id,
      }));
      toast.success(`Welcome to SIRAH LIFE — ${workspace.name} is ready.`);
      // The user is now tier 'workspace' — drop the stale 'unaffiliated' scope
      // so the dashboard guard sees the new workspace instead of bouncing back.
      await queryClient.invalidateQueries({ queryKey: ['scope'] });
      navigate('/dashboard');
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : 'Something went wrong finalising your workspace.';
      toast.error(msg);
      console.error('[onboarding] create workspace failed', e);
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
      illustration={meta.illustration}
      illustrationAlt={meta.illustrationAlt}
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
