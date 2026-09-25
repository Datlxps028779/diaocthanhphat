'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, AlertCircle, Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import {
  hasActivePasswordResetSession,
  updateRecoveredPassword,
  verifyPasswordResetToken,
} from '@/lib/api';
import { friendlyAuthLinkError } from '@/lib/authFlow';

type Status = 'processing' | 'ready' | 'saving' | 'done' | 'error';

export function ResetPasswordClient() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('processing');
  const [message, setMessage] = useState('Đang xác thực liên kết...');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const tokenHash = url.searchParams.get('token_hash') ?? hash.get('token_hash');
      const type = url.searchParams.get('type') ?? hash.get('type');
      const authError = url.searchParams.get('error_description')
        ?? url.searchParams.get('error_code')
        ?? url.searchParams.get('error')
        ?? hash.get('error_description')
        ?? hash.get('error_code')
        ?? hash.get('error');

      try {
        if (authError) throw new Error(authError);

        if (tokenHash && type === 'recovery') {
          await verifyPasswordResetToken(tokenHash);
        } else if (!await hasActivePasswordResetSession()) {
          throw new Error('Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu đặt lại mật khẩu lần nữa.');
        }

        if (cancelled) return;
        url.searchParams.delete('token_hash');
        url.searchParams.delete('type');
        url.hash = '';
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
        setMessage('');
        setStatus('ready');
      } catch (e: unknown) {
        if (cancelled) return;
        setStatus('error');
        setMessage(friendlyAuthLinkError(e instanceof Error ? e.message : null));
      }
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setMessage('Mật khẩu tối thiểu 6 ký tự.'); return; }
    setStatus('saving');
    setMessage('');
    try {
      await updateRecoveredPassword(password);
      setStatus('done');
      setMessage('Đổi mật khẩu thành công! Đang chuyển về trang chủ...');
      setTimeout(() => router.replace('/'), 1500);
    } catch (e: unknown) {
      setStatus('ready');
      setMessage(e instanceof Error ? e.message : 'Không đổi được mật khẩu.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center">
        {status === 'processing' && <Loader2 className="w-14 h-14 text-red-500 mx-auto mb-4 animate-spin" />}
        {status === 'done' && <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />}
        {status === 'error' && <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />}
        {(status === 'ready' || status === 'saving') && (
          <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-white" />
          </div>
        )}

        <h1 className="font-black text-gray-900 text-xl mb-2">
          {status === 'done' ? 'Đã đổi mật khẩu' : status === 'error' ? 'Liên kết lỗi' : 'Đặt mật khẩu mới'}
        </h1>

        {(status === 'ready' || status === 'saving') ? (
          <form onSubmit={handleSave} className="mt-4 text-left">
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <Lock className="w-4 h-4" />
              </div>
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" required autoFocus
                className="w-full border border-gray-200 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {message && status === 'ready' && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2.5 mt-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{message}
              </div>
            )}
            <button type="submit" disabled={status === 'saving'}
              className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-60">
              {status === 'saving' ? 'Đang lưu...' : 'Đổi mật khẩu'}
            </button>
          </form>
        ) : (
          <p className="text-gray-500 text-sm">{message}</p>
        )}

        {status === 'error' && (
          <button onClick={() => router.replace('/')}
            className="mt-5 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors">
            Về trang chủ
          </button>
        )}
      </div>
    </div>
  );
}
