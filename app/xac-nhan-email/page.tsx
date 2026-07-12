'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Trang tiếp nhận link xác nhận email từ Supabase. signUp đặt emailRedirectTo về
// đây; link có thể ở 3 dạng tuỳ cấu hình: ?code= (PKCE), ?token_hash=&type= (verify
// OTP), hoặc #access_token= (implicit — client tự nuốt qua detectSessionInUrl).
// Thử lần lượt rồi kiểm tra session; xong thì đưa về trang chủ (đã đăng nhập).
type Status = 'processing' | 'success' | 'error';

export default function XacNhanEmailPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('processing');
  const [message, setMessage] = useState('Đang xác nhận email...');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const tokenHash = url.searchParams.get('token_hash');
        const type = url.searchParams.get('type');
        const errDesc = url.searchParams.get('error_description');

        if (errDesc) throw new Error(errDesc);

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as 'signup' | 'email' | 'recovery' | 'email_change',
          });
          if (error) throw error;
        }
        // Dạng implicit (#access_token=): detectSessionInUrl của client đã tự xử lý
        // trước khi tới đây — chỉ cần kiểm tra session.

        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          setStatus('success');
          setMessage('Xác nhận thành công! Đang chuyển về trang chủ...');
          setTimeout(() => router.replace('/'), 1500);
        } else {
          throw new Error('Không thiết lập được phiên đăng nhập. Liên kết có thể đã hết hạn hoặc đã dùng.');
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setStatus('error');
        setMessage(e instanceof Error ? e.message : 'Xác nhận email thất bại.');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center">
        {status === 'processing' && <Loader2 className="w-14 h-14 text-red-500 mx-auto mb-4 animate-spin" />}
        {status === 'success' && <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />}
        {status === 'error' && <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />}
        <h1 className="font-black text-gray-900 text-xl mb-2">
          {status === 'success' ? 'Đã xác nhận email' : status === 'error' ? 'Không xác nhận được' : 'Xác nhận email'}
        </h1>
        <p className="text-gray-500 text-sm">{message}</p>
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
