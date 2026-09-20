'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X, Phone, MessageSquare, ChevronDown, ShieldCheck, Clock } from 'lucide-react';
import { submitLead } from '../lib/api';
import { useSetting } from '../lib/cms';
import { track, EVENTS } from '../lib/analytics';
import { isValidVnPhone } from '../lib/phone';
import { formatPropertyPrice } from '../lib/listingPrice';

// Kiểu tối giản cho ContactModal — chỉ cần id, title, price_label
interface ContactTarget {
  id: string;
  title: string;
  price?: number | null;
  price_unit?: string | null;
  price_per_month?: number | null;
  price_label?: string | null;
}

interface ContactModalProps {
  property: ContactTarget | null;
  onClose: () => void;
  onSubmitted?: () => void;   // gửi lead thành công → trang cha ghi tín hiệu "contact"
  preview?: boolean;
}

const EMPTY_FORM = { full_name: '', phone: '', area_interest: '', message: '' };

// showModal() mặc định trao focus cho control đầu tiên — ở nhánh thường đó là nút
// X, nên khách vừa bấm phím là đóng modal. Đưa focus vào ô nhập đầu tiên thay thế.
export const CONTACT_AUTOFOCUS_SELECTOR = "input[name='full_name']";

// Một lần gửi chỉ được ghi kết quả nếu chưa có lần gửi/mục tiêu nào chen ngang.
// Tách thành hàm thuần để kiểm được bằng test tĩnh (không cần DOM).
export function isSubmitCurrent(submitGeneration: number, currentGeneration: number): boolean {
  return submitGeneration === currentGeneration;
}

// Điểm bấm có nằm NGOÀI khung panel? <dialog> phủ kín màn hình nên phải so với
// khung panel, không phải khung dialog — nếu không sẽ không bao giờ đóng được.
export function isOutsidePanel(
  point: { x: number; y: number },
  box: { left: number; right: number; top: number; bottom: number },
): boolean {
  return point.x < box.left || point.x > box.right || point.y < box.top || point.y > box.bottom;
}

// Vỏ <dialog> dùng chung cho cả nhánh xem trước và nhánh thường: modal native
// (showModal → đóng bằng Esc qua onCancel, nội dung ngoài bị inert ở tầng trình
// duyệt), khoá cuộn nền, trả focus về nút mở, và bẫy Tab trong lúc mở.
//
// autoFocusTarget: showModal() mặc định trao focus cho control đầu tiên — với
// nhánh thường đó là nút X, tức là đóng modal ngay khi khách vừa bấm Enter. Ta
// chủ động đưa focus vào ô đầu tiên của biểu mẫu (hoặc để mặc định ở nhánh chỉ
// có nút đóng).
function ContactDialog({ titleId, onClose, autoFocusTarget, children }: { titleId: string; onClose: () => void; autoFocusTarget?: string; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    // showModal() đã trao focus cho nút X; chuyển sang ô nhập đầu tiên.
    if (autoFocusTarget) element.querySelector<HTMLElement>(autoFocusTarget)?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [autoFocusTarget]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      data-testid="contact-modal"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClose={onClose}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')).filter(element => element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = panel.current?.getBoundingClientRect();
        if (!box) return;
        if (isOutsidePanel({ x: event.clientX, y: event.clientY }, box)) onClose();
      }}
      className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-slate-900 backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-4"
    >
      <div
        ref={panel}
        data-testid="contact-modal-panel"
        className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-6 shadow-2xl animate-slide-up sm:relative sm:inset-auto sm:mx-auto sm:w-full sm:max-w-md sm:rounded-2xl sm:animate-none"
      >
        {children}
      </div>
    </dialog>
  );
}

export function ContactModal({ property, onClose, onSubmitted, preview = false }: ContactModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const uid = useId();
  const titleId = `contact-modal-title-${uid}`;
  const nameId = `contact-modal-name-${uid}`;
  const phoneId = `contact-modal-phone-${uid}`;
  const areaId = `contact-modal-area-${uid}`;
  const messageId = `contact-modal-message-${uid}`;
  const errorId = `contact-modal-error-${uid}`;

  // Thời gian phản hồi do Admin cấu hình; không suy diễn năng lực hay bảo đảm pháp lý.
  const responseTime = useSetting('lead_response_time', '30 phút');

  const targetId = property?.id ?? null;

  // Thế hệ của lần gửi: mỗi khi đổi mục tiêu tư vấn (hoặc modal unmount) thì
  // tăng số này. Một request đang bay của tin cũ khi resolve sẽ thấy số lệch và
  // tự bỏ — nếu chỉ reset state, response cũ vẫn kịp ghi success/onSubmitted cho
  // tin mới, làm sai tín hiệu ghi nhận của khách.
  const submitGeneration = useRef(0);

  useEffect(() => {
    submitGeneration.current += 1;
    setForm(EMPTY_FORM);
    setLoading(false);
    setSuccess(false);
    setError('');
    return () => { submitGeneration.current += 1; };
  }, [targetId]);

  // Đo mở modal liên hệ — bước trung gian quan trọng của phễu thu lead.
  useEffect(() => {
    if (property && !preview) track(EVENTS.CONTACT_OPEN, { listingId: property.id, source: 'contact_modal' });
  }, [property, preview]);

  if (!property) return null;

  if (preview) {
    return (
      <ContactDialog titleId={titleId} onClose={onClose}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bản xem trước"
          data-testid="contact-modal-close"
          className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="py-6 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-amber-500" aria-hidden="true" />
          <h2 id={titleId} className="text-lg font-bold text-gray-900">Bản xem trước không nhận yêu cầu tư vấn</h2>
          <p className="mt-2 text-sm text-gray-500">Khi tin được xuất bản, khách mới có thể gửi thông tin liên hệ từ biểu mẫu này.</p>
          <button onClick={onClose} className="mt-5 min-h-11 w-full rounded-xl bg-gray-900 py-3 font-semibold text-white transition-colors hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900">Đóng</button>
        </div>
      </ContactDialog>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError('Vui lòng nhập họ tên và số điện thoại.');
      return;
    }
    if (!isValidVnPhone(form.phone)) {
      setError('Số điện thoại chưa hợp lệ. Vui lòng nhập số di động Việt Nam (VD: 0901234567).');
      return;
    }
    setLoading(true);
    setError('');
    const generation = submitGeneration.current;
    const submittedTargetId = property.id;
    try {
      await submitLead({
        full_name: form.full_name,
        phone: form.phone,
        area_interest: form.area_interest || undefined,
        message: form.message || undefined,
        property_id: property.id,
        source: 'contact_modal',
      });
      // Khách đã đổi tin hoặc đóng modal trong lúc chờ → kết quả này thuộc về
      // tin cũ, không được ghi tín hiệu "contact" cho tin đang mở.
      if (!isSubmitCurrent(generation, submitGeneration.current)) return;
      track(EVENTS.LEAD_SUBMIT, { listingId: submittedTargetId, source: 'contact_modal', hasMessage: !!form.message.trim() });
      onSubmitted?.();
      setSuccess(true);
    } catch {
      if (!isSubmitCurrent(generation, submitGeneration.current)) return;
      setError('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      if (isSubmitCurrent(generation, submitGeneration.current)) setLoading(false);
    }
  };

  return (
    <ContactDialog titleId={titleId} onClose={onClose} autoFocusTarget="input[name='full_name']">
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng biểu mẫu liên hệ"
        data-testid="contact-modal-close"
        className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      {success ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <MessageSquare className="h-8 w-8 text-emerald-500" aria-hidden="true" />
          </div>
          <h2 id={titleId} className="mb-2 text-xl font-bold text-gray-900">Đã nhận thông tin!</h2>
          <p role="status" className="text-gray-500">Tư vấn viên sẽ liên hệ với bạn trong vòng {responseTime}.</p>
          <button onClick={onClose} className="mt-6 min-h-11 w-full rounded-xl bg-amber-500 py-3 font-semibold text-white transition-colors hover:bg-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500">
            Đóng
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 pr-12">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-600">Đăng ký tư vấn</p>
            <h2 id={titleId} className="line-clamp-2 text-lg font-bold leading-snug text-gray-900">{property.title}</h2>
            <p className="mt-1 text-xl font-bold text-amber-600">{formatPropertyPrice(property)}</p>
          </div>

          {/* Thông tin hỗ trợ có nguồn cấu hình, không phải bảo đảm pháp lý. */}
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden="true" />Hỏi thêm thông tin trước khi quyết định
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
              <Clock className="h-4 w-4 flex-shrink-0 text-blue-500" aria-hidden="true" />Mục tiêu phản hồi {responseTime}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor={nameId} className="sr-only">Họ và tên (bắt buộc)</label>
              <input
                id={nameId}
                name="full_name"
                type="text"
                autoComplete="name"
                placeholder="Họ và tên *"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor={phoneId} className="sr-only">Số điện thoại (bắt buộc)</label>
              <input
                id={phoneId}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                pattern="(\+?84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}"
                title="Nhập số di động Việt Nam, ví dụ 0901234567"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                placeholder="Số điện thoại *"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400 sm:text-sm"
              />
            </div>
            <div className="relative">
              <label htmlFor={areaId} className="sr-only">Khu vực quan tâm</label>
              <select
                id={areaId}
                name="area_interest"
                value={form.area_interest}
                onChange={e => setForm(f => ({ ...f, area_interest: e.target.value }))}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 sm:text-sm"
              >
                <option value="">Khu vực quan tâm</option>
                <option>Bình Dương</option>
                <option>Đồng Nai</option>
                <option>Bình Phước</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            </div>
            <div>
              <label htmlFor={messageId} className="sr-only">Nội dung cần tư vấn (không bắt buộc)</label>
              <textarea
                id={messageId}
                name="message"
                placeholder="Nội dung cần tư vấn (không bắt buộc)"
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-400 sm:text-sm"
              />
            </div>
            {error && <p id={errorId} role="alert" className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              {loading ? 'Đang gửi...' : 'Gửi yêu cầu tư vấn'}
            </button>
          </form>
        </>
      )}
    </ContactDialog>
  );
}
