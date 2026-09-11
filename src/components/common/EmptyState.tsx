import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction
}) => {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-12 text-center flex flex-col items-center justify-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-4 shadow-xs">
        {icon}
      </div>
      <h3 className="text-base font-bold text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      <div className="flex items-center gap-3">
        {secondaryActionLabel && onSecondaryAction && (
          <Button variant="secondary" size="md" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </Button>
        )}
        {actionLabel && onAction && (
          <Button variant="primary" size="md" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
};
