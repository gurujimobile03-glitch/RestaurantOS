import React from 'react';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  children,
  dot = false
}) => {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs'
  }[size];

  const variantClasses = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/60',
    danger: 'bg-rose-50 text-rose-700 border-rose-200/60',
    info: 'bg-sky-50 text-sky-700 border-sky-200/60',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200/60'
  }[variant];

  const dotClasses = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-sky-500',
    neutral: 'bg-slate-400'
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses} ${variantClasses} whitespace-nowrap`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotClasses}`} />}
      {children}
    </span>
  );
};
