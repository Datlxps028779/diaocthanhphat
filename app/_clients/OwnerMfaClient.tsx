'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Enrollment = { factorId: string; qrCode: string } | null;

export function OwnerMfaClient() {
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<Enrollment>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data: level, error: levelError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (levelError) {
        if (mounted) setError('Không thể kiểm tra trạng thái xác thực đa yếu tố.');
        return;
      }
      if (level.currentLevel === 'aal2') {
        window.location.replace('/quantrihethong');
        return;
      }

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        if (mounted) setError('Không thể tải phương thức xác thực.');
        return;
      }
      const existing = factors.totp.find(item => item.status === 'verified');
      if (existing) {
        if (mounted) setFactorId(existing.id);
        return;
      }
      const pending = factors.all.filter(item => item.factor_type === 'totp' && item.status === 'unverified');
      await Promise.all(pending.map(item => supabase.auth.mfa.unenroll({ factorId: item.id })));

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Chủ hệ thống Chợ Nhà Việt',
        issuer: 'Chợ Nhà Việt',
      });
      if (enrollError || !enrolled || enrolled.type !== 'totp') {
        if (mounted) setError('Không thể khởi tạo xác thực đa yếu tố.');
        return;
      }
      if (mounted) {
        setEnrollment({ factorId: enrolled.id, qrCode: enrolled.totp.qr_code });
        setFactorId(enrolled.id);
      }
    };

    load().finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) return;
    setSubmitting(true);
    setError('');

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setError('Không thể tạo thử thách xác thực.');
      setSubmitting(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError('Mã xác thực không đúng hoặc đã hết hạn.');
      setSubmitting(false);
      return;
    }

    window.location.assign('/quantrihethong');
  };

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500 rounded-2xl mb-4">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Xác thực đa yếu tố</h1>
          <p className="text-gray-400 text-sm mt-2">Chỉ chủ hệ thống đã xác thực mới có thể mở console.</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 space-y-5 border border-gray-800">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-7 h-7 text-amber-500 animate-spin" /></div>
          ) : (
            <>
              {enrollment && (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-gray-200">Quét mã này bằng ứng dụng xác thực, rồi nhập mã 6 số.</p>
                  <img
                    src={`data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrCode)}`}
                    alt="Mã QR thiết lập xác thực đa yếu tố"
                    className="w-48 h-48 bg-white rounded-xl p-2 mx-auto"
                  />
                </div>
              )}
              <form onSubmit={verify} className="space-y-4">
                <label className="block">
                  <span className="text-gray-400 text-xs font-medium block mb-1.5">Mã xác thực</span>
                  <span className="relative block">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-3 text-white tracking-[0.3em] text-center text-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="000000"
                      required
                    />
                  </span>
                </label>
                {error && (
                  <div className="flex items-center gap-2 text-red-300 text-sm bg-red-950/60 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting || !factorId || code.length !== 6}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors text-sm disabled:opacity-60"
                >
                  {submitting ? 'Đang xác thực…' : 'Xác thực và mở console'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
