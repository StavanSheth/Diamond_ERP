import React from 'react';
import type { LifecycleState } from '@diamond-erp/contracts';

interface OnboardingProgressProps {
  currentStep: LifecycleState;
  completedSteps?: string[];
}

interface StepMeta {
  key: LifecycleState;
  label: string;
  order: number;
}

const STEPS: StepMeta[] = [
  { key: 'APP_SETUP', label: 'App Setup', order: 1 },
  { key: 'PIN_SETUP', label: 'PIN Setup', order: 2 },
  { key: 'DEVICE_SETUP', label: 'Device Setup', order: 3 },
  { key: 'USER_DISCOVERY', label: 'User Discovery', order: 4 },
  { key: 'DATABASE_DISCOVERY', label: 'DB Discovery', order: 5 },
  { key: 'DATABASE_VALIDATION', label: 'DB Validation', order: 6 },
  { key: 'DATABASE_SETUP', label: 'DB Setup', order: 7 },
  { key: 'READY', label: 'Complete', order: 8 },
];

const ORDER_MAP: Record<LifecycleState, number> = {
  NOT_INITIALIZED: 1,
  APP_SETUP: 1,
  PIN_SETUP: 2,
  DEVICE_SETUP: 3,
  USER_DISCOVERY: 4,
  DATABASE_DISCOVERY: 5,
  DATABASE_VALIDATION: 6,
  DATABASE_SETUP: 7,
  READY: 8,
};

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
  currentStep,
  completedSteps = [],
}) => {
  const currentOrder = ORDER_MAP[currentStep] ?? 1;

  return (
    <div className="w-full mb-6" id="onboarding-progress-container">
      <div className="flex items-center justify-between relative">
        {/* Track bar background */}
        <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 bg-slate-800 rounded-full z-0" />
        
        {/* Active progress fill */}
        <div
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 z-0"
          style={{
            width: `${Math.max(0, Math.min(100, ((currentOrder - 1) / (STEPS.length - 1)) * 100))}%`,
          }}
        />

        {STEPS.map((step) => {
          const isCompleted =
            step.order < currentOrder ||
            currentStep === 'READY' ||
            completedSteps.includes(step.key);
          const isCurrent = step.order === currentOrder && currentStep !== 'READY';

          return (
            <div
              key={step.key}
              className="flex flex-col items-center relative z-10 group"
              title={step.label}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                  isCompleted
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : isCurrent
                    ? 'bg-blue-500 text-white ring-4 ring-blue-500/20 animate-pulse'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}
              >
                {isCompleted ? (
                  <span className="material-symbols-outlined text-sm font-black">check</span>
                ) : (
                  step.order
                )}
              </div>
              <span
                className={`text-[10px] mt-1.5 font-medium whitespace-nowrap transition-colors ${
                  isCurrent
                    ? 'text-blue-400 font-semibold'
                    : isCompleted
                    ? 'text-slate-300'
                    : 'text-slate-600'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
