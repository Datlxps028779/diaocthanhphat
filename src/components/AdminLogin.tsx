import { useState } from 'react';
import { Mail, Lock, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAdminRole } from '../lib/api';

interface AdminLoginProps {
  onSuccess: () => void;
}

export function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError('Email hoặc mật khẩu không đúng.');
      setLoading(false);
      return;
    }
    const isAdmin = await getAdminRole().catch(() => false);
    if (!isAdmin) {
      await supabase.auth.signOut();
      setError('Tài khoản không có quyền quản trị.');
      setLoading(false);
      return;
    }
    onSuccess();
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500 rounded-2xl mb-4">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Quản Trị Hệ Thống</h1>
          <p className="text-gray-500 text-xs mt-1 font-mono tracking-wider">/ q u a n t r i h e t h o n g</p>
          <p className="text-gray-400 text-sm mt-2">Chỉ quản trị viên được phép truy cập</p>
        </div>

        <form onSubmit={handleLogin} className="bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-800">
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="admin@bdsbinhduong.vn"
                autoComplete="username"
              />
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Mật khẩu</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/30 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors text-sm disabled:opacity-60"
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập quản trị'}
          </button>
        </form>

        <p className="text-gray-700 text-xs text-center mt-4">
          Trang quản trị ẩn — không hiển thị trên website công khai
        </p>
      </div>
    </div>
  );
}
