import { ShieldCheck } from 'lucide-react';

export function VerifiedBadge({ verified, size = 'sm' }: { verified: boolean | null | undefined; size?: 'sm' | 'md' }) {
  if (!verified) return null;
  const md = size === 'md';
  return (
    <span
      title="Tin đã được quản trị viên xác minh"
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold ${md ? 'text-xs px-2.5 py-1' : 'text-[10px] px-1.5 py-0.5'}`}
    >
      <ShieldCheck className={md ? 'w-4 h-4' : 'w-3 h-3'} />
      Đã xác minh
    </span>
  );
}
