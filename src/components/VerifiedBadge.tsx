import { ShieldCheck } from 'lucide-react';
import type { Property } from '../lib/supabase';
import {
  formatPublicVerificationDate,
  normalizePublicVerificationSummary,
  publicVerificationLabel,
  publicVerificationReasonLabels,
  publicVerificationReasonShortLabels,
} from '../lib/propertyVerification';

export function VerifiedBadge({ property, size = 'sm' }: { property: Pick<Property, 'is_verified' | 'verification_status' | 'verification_scope_codes' | 'verified_at' | 'verified_until'>; size?: 'sm' | 'md' }) {
  const summary = normalizePublicVerificationSummary(property);
  if (!summary) return null;
  const md = size === 'md';
  const reasons = publicVerificationReasonLabels(summary.reasonCodes);
  const shortReasons = publicVerificationReasonShortLabels(summary.reasonCodes);
  const details = [
    `Phạm vi: ${reasons.join(' · ')}`,
    `Kiểm tra ngày: ${formatPublicVerificationDate(summary.verifiedAt)}`,
    `Có hiệu lực đến: ${formatPublicVerificationDate(summary.verifiedUntil)}`,
  ];
  return (
    <span
      title={details.join('\n')}
      aria-label={details.join('. ')}
      className={`inline-flex ${md ? 'flex-col items-start gap-1' : 'items-center gap-1'} rounded-full bg-emerald-50 text-emerald-700 font-semibold ${md ? 'text-xs px-2.5 py-1.5' : 'text-[10px] px-1.5 py-0.5'}`}
    >
      <span className="inline-flex items-center gap-1">
        <ShieldCheck className={md ? 'w-4 h-4' : 'w-3 h-3'} />
        {publicVerificationLabel(summary.reasonCodes)}
      </span>
      {md && (
        <>
          <span className="text-[11px] font-normal text-emerald-800">Phạm vi: {shortReasons.join(' · ')}</span>
          <span className="text-[11px] font-normal text-emerald-800">
            Kiểm tra {formatPublicVerificationDate(summary.verifiedAt)} · Hiệu lực đến {formatPublicVerificationDate(summary.verifiedUntil)}
          </span>
        </>
      )}
    </span>
  );
}
