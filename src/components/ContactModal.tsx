import { useState } from 'react';
import { X, Phone, MessageSquare, ChevronDown, ShieldCheck, Clock, Award } from 'lucide-react';
import { submitLead } from '../lib/api';
import { useSetting } from '../lib/cms';

// Kiểu tối giản cho ContactModal — chỉ cần id, title, price_label
interface ContactTarget {
  id: string;
  title: string;
  price_label?: string | null;
}

interface ContactModalProps {
  property: ContactTarget | null;
  onClose: () => void;
}

export function ContactModal({ property, onClose }: ContactModalProps) {
  const [form, setForm] = useState({ full_name: '', phone: '', area_interest: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Trust signals cạnh điểm chuyển đổi — giảm ma sát để lại SĐT. Số liệu lấy từ
  // cài đặt admin (dùng chung khóa với section stats trang chủ), có default hợp lý.
  const experience = useSetting('stat3_number', '7 năm');
  const responseTime = useSetting('lead_response_time', '30 phút');

  if (!property) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError('Vui lòng nhập họ tên và số điện thoại.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await submitLead({
        full_name: form.full_name,
        phone: form.phone,
        area_interest: form.area_interest || undefined,
        message: form.message || undefined,
        property_id: property.id,
        source: 'contact_modal',
      });
      setSuccess(true);
    } catch {
      setError('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 animate-slide-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-5 h-5" />
        </button>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Đã nhận thông tin!</h3>
            <p className="text-gray-500">Tư vấn viên sẽ liên hệ với bạn trong vòng {responseTime}.</p>
            <button onClick={onClose} className="mt-6 w-full bg-amber-500 text-white font-semibold py-3 rounded-xl hover:bg-amber-600 transition-colors">
              Đóng
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-1">Đăng ký tư vấn</p>
              <h3 className="text-lg font-bold text-gray-900 leading-snug line-clamp-2">{property.title}</h3>
              <p className="text-amber-600 font-bold text-xl mt-1">{property.price_label}</p>
            </div>

            {/* Trust signals — giảm ma sát ngay tại điểm để lại SĐT */}
            <div className="flex items-center gap-3 mb-4 py-2.5 px-3 bg-gray-50 rounded-xl border border-gray-100">
              <span className="flex items-center gap-1.5 text-[11px] text-gray-600 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />Pháp lý minh bạch
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-600 font-medium">
                <Award className="w-4 h-4 text-amber-500 flex-shrink-0" />{experience} kinh nghiệm
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-600 font-medium">
                <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />Phản hồi {responseTime}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Họ và tên *"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              <input
                type="tel"
                placeholder="Số điện thoại *"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              <div className="relative">
                <select
                  value={form.area_interest}
                  onChange={e => setForm(f => ({ ...f, area_interest: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 appearance-none bg-white text-gray-700"
                >
                  <option value="">Khu vực quan tâm</option>
                  <option>TP. Hồ Chí Minh</option>
                  <option>Bình Dương</option>
                  <option>Đồng Nai</option>
                  <option>Bình Phước</option>
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <textarea
                placeholder="Nội dung cần tư vấn (không bắt buộc)"
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Phone className="w-4 h-4" />
                {loading ? 'Đang gửi...' : 'Gửi yêu cầu tư vấn'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
