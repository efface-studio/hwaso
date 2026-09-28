import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const alertTone = {
  info: { cls: 'border-border bg-background-soft', icon: 'text-muted', Icon: Info },
  success: { cls: 'border-success/30 bg-success/5', icon: 'text-success', Icon: CheckCircle2 },
  warning: { cls: 'border-warning/30 bg-warning/5', icon: 'text-warning', Icon: TriangleAlert },
  destructive: { cls: 'border-destructive/30 bg-destructive/5', icon: 'text-destructive', Icon: AlertCircle },
} as const;

interface AlertProps {
  tone?: keyof typeof alertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const { cls, icon, Icon } = alertTone[tone];
  return (
    <div
      role={tone === 'destructive' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-sm border p-3 text-foreground', cls, className)}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', icon)} aria-hidden />
      <div className="flex flex-col gap-0.5 text-small">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-muted">{children}</div>}
      </div>
    </div>
  );
}

const badgeTone = {
  neutral: 'bg-surface-2 text-foreground',
  outline: 'border border-border-strong text-muted',
  primary: 'bg-primary-soft text-primary',
  solid: 'bg-secondary text-secondary-foreground',
  live: 'bg-live text-live-foreground',
  destructive: 'bg-destructive/10 text-destructive',
} as const;

export type BadgeTone = keyof typeof badgeTone;

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-caption font-semibold whitespace-nowrap',
        badgeTone[tone],
        className,
      )}
      {...props}
    />
  );
}

const shimmer = {
  background:
    'linear-gradient(90deg, var(--skeleton-base) 25%, var(--skeleton-shine) 50%, var(--skeleton-base) 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shine 1.4s linear infinite',
};

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('rounded-sm', className)} style={shimmer} />;
}

export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className="h-full bg-primary transition-[width]" style={{ width: `${v}%` }} />
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center', className)}>
      {icon && <div className="text-faint [&>svg]:size-8">{icon}</div>}
      <p className="text-body-strong">{title}</p>
      {description && <p className="max-w-sm text-small text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
