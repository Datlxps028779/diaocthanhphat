import { useState } from 'react';
import { X, Mail, Lock, User, Phone, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { signIn, signUp, requestPasswordReset, signOut, getCurrentRole } from '../lib/api';
import { interpretSignUpResult } from '../lib/authFlow';
import { isElevatedRole } from '../lib/authGuard';

interface UserAuthModalProps {
  mode: 'login' | 'register';
  onClose: () => void;
  onSuccess: () => void;
  onSwitchMode: (m: 'login' | 'register') => void;
}

export function UserAuthModal({ mode, onClose, onSuccess, onSwitchMode }: UserAuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // Đăng ký xong mà chưa có session = Supabase bật "Confirm email" → phải xác nhận
  // qua mail trước khi đăng nhập. Hiện màn "kiểm tra email" thay vì "đang đăng nhập".
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  // Luồng quên mật khẩu: forgotMode = đang ở form nhập email; resetSent = đã gửi mail.
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        // Chặn tài khoản quản trị đăng nhập qua cổng người dùng: cắt phiên ngay và
        // hướng về /quantrihethong. Thu hẹp bề mặt tấn công lên tài khoản quyền cao.
        const role = await getCurrentRole().catch(() => null);
        if (isElevatedRole(role)) {
          await signOut();
          setError('Tài khoản quản trị vui lòng đăng nhập tại trang /quantrihethong.');
          setLoading(false);
          return;
        }
        onSuccess();
      } else {
        if (!displayName.trim()) { setError('Vui lòng nhập họ tên.'); setLoading(false); return; }
        if (password.length < 6) { setError('Mật khẩu tối thiểu 6 ký tự.'); setLoading(false); return; }
        const data = await signUp(email, password, displayName, phone);
        const outcome = interpretSignUpResult(data);
        if (outcome === 'logged_in') {
          // Confirm email TẮT → đã đăng nhập luôn.
          setSuccess(true);
          setTimeout(onSuccess, 1500);
        } else if (outcome === 'already_registered') {
          // Supabase chống dò email: KHÔNG gửi mail cho email đã tồn tại. Báo rõ +
          // chuyển sang tab Đăng nhập, giữ email đã nhập để user đăng nhập luôn.
          setError('Email này đã được đăng ký. Vui lòng đăng nhập.');
          onSwitchMode('login');
        } else {
          // Confirm email BẬT, đăng ký mới → chờ user bấm link trong mail.
          setNeedsEmailConfirm(true);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('Email này đã được đăng ký. Vui lòng đăng nhập.');
      } else if (msg.includes('Invalid login credentials')) {
        setError('Email hoặc mật khẩu không đúng.');
      } else {
        setError(msg);
      }
    } finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Vui lòng nhập email.'); return; }
    setLoading(true);
    try {
      await requestPasswordReset(email);
      // Luôn báo "đã gửi" dù email có tồn tại hay không (chống dò email).
      setResetSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không gửi được email đặt lại mật khẩu.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 animate-slide-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-5 h-5" />
        </button>

        {needsEmailConfirm ? (
          <div className="text-center py-6">
            <Mail className="w-14 h-14 text-red-500 mx-auto mb-3" />
            <h3 className="font-black text-gray-900 text-xl mb-1">Kiểm tra email của bạn</h3>
            <p className="text-gray-500 text-sm">
              Chúng tôi vừa gửi liên kết xác nhận đến <span className="font-semibold text-gray-700">{email}</span>.
              Mở email và bấm vào liên kết để kích hoạt tài khoản, sau đó đăng nhập.
            </p>
            <p className="text-gray-400 text-xs mt-3">Không thấy email? Kiểm tra mục Spam/Quảng cáo.</p>
            <button onClick={onClose}
              className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors">
              Đã hiểu
            </button>
          </div>
        ) : success ? (
          <div className="text-center py-6">
            <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
            <h3 className="font-black text-gray-900 text-xl mb-1">Đăng ký thành công!</h3>
            <p className="text-gray-500 text-sm">Đang đăng nhập...</p>
          </div>
        ) : resetSent ? (
          <div className="text-center py-6">
            <Mail className="w-14 h-14 text-red-500 mx-auto mb-3" />
            <h3 className="font-black text-gray-900 text-xl mb-1">Kiểm tra email của bạn</h3>
            <p className="text-gray-500 text-sm">
              Nếu <span className="font-semibold text-gray-700">{email}</span> đã đăng ký, chúng tôi vừa gửi
              liên kết đặt lại mật khẩu. Mở email và bấm vào liên kết để tạo mật khẩu mới.
            </p>
            <p className="text-gray-400 text-xs mt-3">Không thấy email? Kiểm tra mục Spam/Quảng cáo.</p>
            <button onClick={onClose}
              className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors">
              Đã hiểu
            </button>
          </div>
        ) : forgotMode ? (
          <>
            <button onClick={() => { setForgotMode(false); setError(''); }}
              className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-xs mb-3 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Quay lại đăng nhập
            </button>
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-black text-gray-900 text-xl">Quên mật khẩu</h3>
              <p className="text-gray-500 text-xs mt-1">Nhập email để nhận liên kết đặt lại mật khẩu</p>
            </div>
            <form onSubmit={handleForgot} className="space-y-3">
              <InputField icon={<Mail className="w-4 h-4" />} type="email" placeholder="Email *"
                value={email} onChange={setEmail} required />
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
              )}
              <button type="submit" disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors disabled:opacity-60">
                {loading ? 'Đang gửi...' : 'Gửi liên kết đặt lại'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-black text-gray-900 text-xl">
                {mode === 'login' ? 'Đăng nhập tài khoản' : 'Tạo tài khoản mới'}
              </h3>
              <p className="text-gray-500 text-xs mt-1">
                {mode === 'login' ? 'Đăng nhập để đăng tin bất động sản' : 'Đăng ký miễn phí để đăng tin'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'register' && (
                <>
                  <InputField icon={<User className="w-4 h-4" />} type="text" placeholder="Họ và tên *"
                    value={displayName} onChange={setDisplayName} />
                  <InputField icon={<Phone className="w-4 h-4" />} type="tel" placeholder="Số điện thoại"
                    value={phone} onChange={setPhone} />
                </>
              )}
              <InputField icon={<Mail className="w-4 h-4" />} type="email" placeholder="Email *"
                value={email} onChange={setEmail} required />
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Mật khẩu *" required
                  className="w-full border border-gray-200 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {mode === 'login' && (
                <div className="text-right -mt-1">
                  <button type="button" onClick={() => { setForgotMode(true); setError(''); }}
                    className="text-red-600 text-xs font-semibold hover:underline">
                    Quên mật khẩu?
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors disabled:opacity-60">
                {loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký ngay'}
              </button>
            </form>

            <p className="text-center text-xs text-gray-500 mt-4">
              {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
              <button onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
                className="text-red-600 font-semibold hover:underline">
                {mode === 'login' ? 'Đăng ký miễn phí' : 'Đăng nhập'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function InputField({ icon, type, placeholder, value, onChange, required }: {
  icon: React.ReactNode; type: string; placeholder: string;
  value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div className="relative">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">{icon}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
    </div>
  );
}
