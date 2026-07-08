import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';

// ─── Input / Select primitive (Sprint 2) ─────────────────────────────────────
// Field chuẩn có label + lỗi + icon trái. Dùng token (rounded-field, focus ring
// primary). Cho form admin Sprint 3 khỏi lặp class input.

const FIELD_BASE =
  'w-full rounded-field border border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors ' +
  'disabled:opacity-50 disabled:bg-neutral-50';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, leftIcon, className = '', id, ...props },
  ref
) {
  const inputId = id ?? props.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">{leftIcon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${FIELD_BASE} ${leftIcon ? 'pl-10 pr-3' : 'px-3'} py-2 text-sm ${error ? 'border-danger-400 focus:ring-danger-400' : ''} ${className}`}
          aria-invalid={error ? true : undefined}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className = '', id, children, ...props },
  ref
) {
  const selectId = id ?? props.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`${FIELD_BASE} px-3 py-2 text-sm ${error ? 'border-danger-400 focus:ring-danger-400' : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});
