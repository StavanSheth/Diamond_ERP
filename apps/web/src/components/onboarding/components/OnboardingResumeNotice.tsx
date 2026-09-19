import React from 'react';
import type { LifecycleState } from '@diamond-erp/contracts';

interface OnboardingResumeNoticeProps {
  lifecycleState: LifecycleState;
}

const STEP_FRIENDLY_NAMES: Partial<Record<LifecycleState, string>> = {
  APP_SETUP: 'Application Setup',
  PIN_SETUP: 'Terminal PIN Setup',
  DEVICE_SETUP: 'Device Identity Registration',
  USER_DISCOVERY: 'User Configuration',
  DATABASE_DISCOVERY: 'Database Discovery',
  DATABASE_VALIDATION: 'Database Validation',
  DATABASE_SETUP: 'Database Finalization',
};

export const OnboardingResumeNotice: React.FC<OnboardingResumeNoticeProps> = ({
  lifecycleState,
}) => {
  if (lifecycleState === 'NOT_INITIALIZED' || lifecycleState === 'READY') {
    return null;
  }

  const stepName = STEP_FRIENDLY_NAMES[lifecycleState] || lifecycleState;

  return (
    <div
      id="onboarding-resume-notice"
      className="mb-5 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center justify-between"
    >
      <div className="flex items-center gap-2.5">
        <span className="material-symbols-outlined text-base text-blue-400">info</span>
        <div>
          <span className="font-semibold text-white">Resumed Onboarding: </span>
          Continuing from persisted step <span className="font-mono text-blue-200 font-semibold">{stepName}</span>. Your previous configuration is safely preserved.
        </div>
      </div>
    </div>
  );
};
