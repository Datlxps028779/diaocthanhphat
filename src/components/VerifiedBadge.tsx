import { ShieldCheck } from 'lucide-react';
import type { Property } from '../lib/supabase';
import {
  normalizePublicVerificationSummary,
  publicVerificationLabel,
  publicVerificationReasonLabels,
} from '../lib/propertyVerification';

export function VerifiedBadge({ property, size = 'sm' }: { property: Pick<Property, 'is_verified' | 'verification_status' | 'verification_scope_codes' | 'verified_at' | 'verified_until'>; size?: 'sm' | 'md' }) {
  const summary = normalizePublicVerificationSummary(property);
  if (!summary) return null;
  const md = size === 'md';
  const reasons = publicVerificationReasonLabels(summary.reasonCodes);
  return (
    <span
      title={reasons.join(' · ')}
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold ${md ? 'text-xs px-2.5 py-1' : 'text-[10px] px-1.5 py-0.5'}`}
    >
      <ShieldCheck className={md ? 'w-4 h-4' : 'w-3 h-3'} />
      {publicVerificationLabel(summary.reasonCodes)}
    </span>
  );
}
