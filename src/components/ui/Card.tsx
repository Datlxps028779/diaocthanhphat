import type { HTMLAttributes, ReactNode } from 'react';

// ─── Card primitive (Sprint 2) ───────────────────────────────────────────────
// Container chuẩn: bo góc + shadow token. Thay cho `bg-white rounded-2xl shadow`
// lặp khắp nơi. Trang cũ giữ nguyên, primitive cho code mới.

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  hover?: boolean;
  children: ReactNode;
}

export function Card({ padded = true, hover = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`bg-white rounded-card shadow-card ${hover ? 'transition-shadow hover:shadow-card-hover' : ''} ${padded ? 'p-5' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className = '', children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`font-bold text-neutral-900 text-base ${className}`} {...props}>
      {children}
    </h3>
  );
}
