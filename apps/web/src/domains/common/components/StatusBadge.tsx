import React from 'react';

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: 'bg-status-success', text: 'text-on-primary', dot: 'bg-status-success' },
  PARTIAL: { bg: 'bg-status-partial', text: 'text-on-primary', dot: 'bg-status-partial' },
  SOLD_OUT: { bg: 'bg-status-sold-out', text: 'text-on-primary', dot: 'bg-status-sold-out' },
  ARCHIVED: { bg: 'bg-status-archived', text: 'text-on-primary', dot: 'bg-status-archived' },
};

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const config = statusConfig[status] || statusConfig.ACTIVE;
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-caption';

  return (
    <span className={`inline-flex items-center rounded ${config.bg} ${config.text} ${sizeClass} font-semibold`}>
      {status.replace('_', ' ')}
    </span>
  );
};

interface StatusDotProps {
  status: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status }) => {
  const config = statusConfig[status] || statusConfig.ACTIVE;
  return <span className={`w-2 h-2 rounded-full ${config.dot}`} />;
};
