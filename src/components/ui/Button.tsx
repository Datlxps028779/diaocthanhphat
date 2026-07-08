import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

// ─── Button primitive (Sprint 2) ─────────────────────────────────────────────
// Dùng token semantic (primary/danger...). Trang cũ không bắt buộc đổi sang đây —
// primitive này để code MỚI (admin Sprint 3) khỏi lặp class button khắp nơi.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-400',
  secondary: 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 focus-visible:ring-neutral-400',
  ghost: 'bg-transparent text-neutral-600 hover:bg-neutral-100 focus-visible:ring-neutral-300',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-400',
  outline: 'bg-white text-primary-600 border border-primary-200 hover:bg-primary-50 focus-visible:ring-primary-400',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, disabled, className = '', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-field font-medium transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
      )}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
