import { Slot } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
  outline: 'border border-border-strong bg-background text-foreground hover:bg-surface-2',
  ghost: 'text-foreground hover:bg-surface-2',
  destructive: 'bg-destructive text-white hover:opacity-90',
  link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
} as const;

const sizes = {
  sm: 'h-8 px-3 text-label',
  md: 'h-10 px-4 text-label',
  lg: 'h-12 px-5 text-body-strong',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  block?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, asChild, className, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-size={size}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-sm font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="size-4" />}
          {children}
        </>
      )}
    </Comp>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 스크린리더용 이름 (필수) */
  label: string;
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex items-center justify-center rounded-sm text-foreground transition-colors hover:bg-surface-2 disabled:opacity-40',
        size === 'md' ? 'size-11' : 'size-9',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
