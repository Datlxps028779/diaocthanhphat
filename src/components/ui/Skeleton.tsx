// ─── Skeleton primitive (Sprint 2) ───────────────────────────────────────────
// Dùng lại animation shimmer đã có trong index.css (.skeleton). Chuẩn hoá thành
// component + helper text/avatar/card cho loading state khắp app (Sprint 4).

export interface SkeletonProps {
  className?: string;
  rounded?: 'none' | 'sm' | 'md' | 'full' | 'card';
}

const ROUNDED: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  none: '',
  sm: 'rounded',
  md: 'rounded-lg',
  full: 'rounded-full',
  card: 'rounded-card',
};

export function Skeleton({ className = '', rounded = 'md' }: SkeletonProps) {
  return <div className={`skeleton ${ROUNDED[rounded]} ${className}`} aria-hidden />;
}

// Vài preset hay dùng
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-card shadow-card overflow-hidden ${className}`}>
      <Skeleton rounded="none" className="h-48 w-full" />
      <div className="p-5 space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}
