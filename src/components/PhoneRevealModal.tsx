import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Phone, ShieldCheck, UserRound, X } from 'lucide-react';
import { revealPropertyPhone } from '../lib/api';
import { isValidVnPhone } from '../lib/phone';
import { formatPropertyPrice } from '../lib/listingPrice';
import type { PropertyPhoneRevealResult } from '../lib/supabase';

interface PhoneRevealModalProps {
  property: { id: string; title: string; price?: number | null; price_unit?: string | null; price_per_month?: number | null; price_label?: string | null } | null;
  onClose: () => void;
  onRevealed: (result: PropertyPhoneRevealResult) => void;
}

export function PhoneRevealModal({ property, onClose, onRevealed }: PhoneRevealModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!property) return;
    setName('');
    setPhone('');
    setError('');
    setLoading(false);
  }, [property]);

  if (!property) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidVnPhone(phone)) {
      setError('Số điện thoại chưa hợp lệ. Vui lòng nhập số di động Việt Nam, ví dụ 0901234567.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await revealPropertyPhone(property.id, phone, name);
      onRevealed(result);
    } catch {
      setError('Không thể hiện số lúc này. Vui lòng kiểm tra lại thông tin hoặc thử lại sau.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="phone-reveal-title">
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-2xl">
        <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-4 top-4 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
          <X className="h-5 w-5" />
        </button>
        <div className="pr-8">
          <p className="text-xs font-bold uppercase tracking-wider text-red-600">Hiện số điện thoại</p>
          <h2 id="phone-reveal-title" className="mt-1 line-clamp-2 text-lg font-black text-gray-900">{property.title}</h2>
          <p className="mt-1 text-base font-bold text-red-600">{formatPropertyPrice(property)}</p>
        </div>
        <div className="mt-4 flex gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <span>Nhập số điện thoại để xem số liên hệ của tin đăng. Thông tin được chuyển tới bộ phận tư vấn cho đúng tin này.</span>
        </div>
        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Số điện thoại *</span>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={phone} onChange={event => setPhone(event.target.value)} type="tel" inputMode="tel" autoFocus required
                pattern="(\\+?84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}"
                placeholder="0901234567" className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Họ tên <span className="font-normal text-gray-400">(không bắt buộc)</span></span>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={name} onChange={event => setName(event.target.value)} type="text" maxLength={120}
                placeholder="Nguyễn Văn A" className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          </label>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Đang xác nhận...</> : <><CheckCircle className="h-4 w-4" />Hiện số điện thoại</>}
          </button>
          <p className="text-center text-[11px] text-gray-400">Bạn có thể yêu cầu tư vấn riêng nếu chưa muốn gọi trực tiếp.</p>
        </form>
      </div>
    </div>
  );
}
