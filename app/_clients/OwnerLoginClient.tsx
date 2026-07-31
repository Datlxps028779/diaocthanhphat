'use client';

import { useState } from 'react';
import { AlertCircle, Lock, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function OwnerLoginClient() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError('Không thể xác thực thông tin đăng nhập.');
      setLoading(false);
      return;
    }

    const { data: owner, error: ownerError } = await supabase.rpc('is_owner');
    if (ownerError || owner !== true) {
      await supabase.auth.signOut();
      setError('Không thể xác thực thông tin đăng nhập.');
      setLoading(false);
      return;
    }

    window.location.assign('/xac-thuc-chu-he-thong');
  };

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500 rounded-2xl mb-4">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Xác thực chủ hệ thống</h1>
          <p className="text-gray-400 text-sm mt-2">Đăng nhập và xác thực đa yếu tố để tiếp tục.</p>
        </div>

        <form onSubmit={submit} className="bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-800">
          <label className="block">
            <span className="text-gray-400 text-xs font-medium block mb-1.5">Email</span>
            <span className="relative block">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoComplete="username"
                required
              />
            </span>
          </label>
          <label className="block">
            <span className="text-gray-400 text-xs font-medium block mb-1.5">Mật khẩu</span>
            <span className="relative block">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoComplete="current-password"
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
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors text-sm disabled:opacity-60"
          >
            {loading ? 'Đang xác thực…' : 'Tiếp tục'}
          </button>
        </form>
      </div>
    </main>
  );
}
