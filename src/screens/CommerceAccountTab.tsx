'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  LockKeyhole,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import {
  getCommerceWalletCatalog,
  getMyCommerceWallet,
  type CommerceMinorAmount,
  type CommerceWalletFeeReservation,
  type CommerceWalletMovement,
} from '../lib/api/commerce';

const topupStatusLabels: Record<string, string> = {
  draft: 'Đã tạo',
  awaiting_payment: 'Chờ thanh toán',
  credited: 'Đã cộng tiền',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
  chargeback_review: 'Đang rà soát',
};

const feeStatusLabels: Record<CommerceWalletFeeReservation['status'], string> = {
  reserved: 'Đang giữ chỗ',
  captured: 'Đã thu phí',
  released: 'Đã hoàn về ví',
  expired: 'Đã hết hạn',
};

const movementLabels: Record<CommerceWalletMovement['operation'], string> = {
  topup_credit: 'Cộng tiền nạp ví',
  fee_reserve: 'Giữ chỗ phí tin đăng',
  fee_capture: 'Thu phí tin đăng',
  fee_release: 'Hoàn giữ chỗ về ví',
  admin_credit: 'Điều chỉnh tăng',
  admin_debit: 'Điều chỉnh giảm',
  chargeback_debit: 'Điều chỉnh chargeback',
};

function formatMoney(value: CommerceMinorAmount): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function PaymentStateBanner({ state }: { state: string | null }) {
  if (state === 'success') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3 text-emerald-800">
        <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div><p className="font-bold text-sm">Đã quay lại từ cổng thanh toán</p><p className="text-xs mt-1">Số dư chỉ thay đổi sau khi giao dịch được hệ thống xác minh.</p></div>
      </div>
    );
  }
  if (state === 'cancelled' || state === 'failed' || state === 'pending') {
    const failed = state === 'failed';
    return (
      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${failed ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
        {failed ? <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" /> : <Clock3 className="w-5 h-5 mt-0.5 flex-shrink-0" />}
        <div><p className="font-bold text-sm">{failed ? 'Thanh toán chưa thành công' : state === 'pending' ? 'Đang đối soát thanh toán' : 'Thanh toán chưa hoàn tất'}</p><p className="text-xs mt-1">Không có khoản tiền nào được cộng vào ví khi giao dịch chưa được xác minh.</p></div>
      </div>
    );
  }
  return null;
}

export function CommerceAccountTab() {
  const [paymentState, setPaymentState] = useState<string | null>(null);

  useEffect(() => {
    setPaymentState(new URLSearchParams(window.location.search).get('payment'));
  }, []);

  const walletQuery = useQuery({
    queryKey: ['commerceWallet'],
    queryFn: getMyCommerceWallet,
  });
  const catalogQuery = useQuery({
    queryKey: ['commerceWalletCatalog'],
    queryFn: getCommerceWalletCatalog,
    staleTime: 30_000,
  });

  if (walletQuery.isLoading || catalogQuery.isLoading) {
    return <div className="space-y-3"><div className="h-28 rounded-2xl bg-white border border-gray-100 animate-pulse" /><div className="h-64 rounded-2xl bg-white border border-gray-100 animate-pulse" /></div>;
  }

  if (walletQuery.isError || catalogQuery.isError || !walletQuery.data || !catalogQuery.data) {
    return (
      <div className="space-y-4">
        <PaymentStateBanner state={paymentState} />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div><p className="font-bold">Chưa tải được dữ liệu ví</p><p className="mt-1 text-xs leading-relaxed">Trang tạm khóa mọi thao tác. Hãy làm mới và liên hệ hỗ trợ nếu số dư hiển thị không đúng.</p></div>
        </div>
      </div>
    );
  }

  const wallet = walletQuery.data;
  const catalog = catalogQuery.data;
  const totalBalance = Number(wallet.wallet.available_minor) + Number(wallet.wallet.reserved_minor);
  const topupAvailable = catalog.config !== null;

  return (
    <div className="space-y-5">
      <PaymentStateBanner state={paymentState} />

      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-start gap-3">
        <LockKeyhole className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div><p className="font-bold text-blue-900 text-sm">Ví trả trước đang ở chế độ chỉ đọc</p><p className="text-blue-700 text-xs mt-1">Số dư không hết hạn và chỉ dùng cho dịch vụ trên Chợ Nhà Việt. Nạp tiền chưa mở; không có rút tiền hoặc hoàn tiền ra phương thức thanh toán.</p></div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3"><WalletCards className="w-6 h-6 text-emerald-600" /><div><p className="text-xs text-gray-500">Số dư khả dụng</p><p className="text-xl font-black text-gray-900">{formatMoney(wallet.wallet.available_minor)}</p></div></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3"><LockKeyhole className="w-6 h-6 text-amber-500" /><div><p className="text-xs text-gray-500">Đang giữ chỗ</p><p className="text-xl font-black text-gray-900">{formatMoney(wallet.wallet.reserved_minor)}</p></div></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3"><ReceiptText className="w-6 h-6 text-red-500" /><div><p className="text-xs text-gray-500">Tổng trong ví</p><p className="text-xl font-black text-gray-900">{formatMoney(totalBalance)}</p></div></div>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div><h2 className="font-bold text-gray-900">Mệnh giá nạp dự kiến</h2><p className="text-xs text-gray-500 mt-1">Cấu hình do máy chủ kiểm soát; hiện chưa kết nối cổng nạp tiền.</p></div>
          <span className="self-start rounded-full bg-gray-100 px-3 py-1 text-[11px] font-bold text-gray-600">Nạp tiền chưa mở</span>
        </div>
        {!topupAvailable ? (
          <div className="p-6 text-center text-sm text-gray-500">Chưa có cấu hình nạp tiền được phê duyệt.</div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {catalog.topupOptions.map(option => (
                <div key={option.code} className="rounded-xl border border-gray-200 px-4 py-3"><p className="text-xs text-gray-500">{option.label}</p><p className="font-black text-gray-900 mt-1">{formatMoney(option.amount_minor)}</p></div>
              ))}
            </div>
            {catalog.config?.custom_amount_enabled && (
              <p className="text-xs text-gray-500">Mức tùy chọn dự kiến: {formatMoney(catalog.config.custom_min_minor ?? 0)} – {formatMoney(catalog.config.custom_max_minor ?? 0)}, bước {formatMoney(catalog.config.custom_step_minor ?? 0)}.</p>
            )}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Phí tin đăng</h2><p className="text-xs text-gray-500 mt-1">Phí được giữ khi gửi duyệt, thu khi tin được duyệt và trả lại số dư khả dụng nếu bị từ chối hoặc hết thời gian giữ chỗ.</p></div>
        {catalog.feeProducts.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Chưa có biểu phí được kích hoạt.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 p-4">
            {catalog.feeProducts.map(product => (
              <article key={product.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-gray-900">{product.name}</h3><p className="text-xs text-gray-500 mt-1">{product.product_kind === 'listing_basic' ? 'Phí đăng tin cơ bản' : product.sponsored_label ?? 'Tiện ích tài trợ'} · {product.duration_days ?? '—'} ngày</p></div><p className="font-black text-red-600 whitespace-nowrap">{formatMoney(product.amount_minor)}</p></div>
                {product.description && <p className="text-xs text-gray-600 mt-3 leading-relaxed">{product.description}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Phí theo tin đăng</h2><p className="text-xs text-gray-500 mt-1">Lịch sử giữ chỗ, thu phí và trả lại trong ví.</p></div>
        {wallet.feeReservations.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Chưa có khoản phí tin đăng.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {wallet.feeReservations.map(reservation => (
              <div key={reservation.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div><p className="font-semibold text-sm text-gray-900">{formatMoney(reservation.total_minor)}</p><p className="text-xs text-gray-500 mt-1">Chu kỳ {reservation.submission_cycle} · {formatDate(reservation.created_at)}</p></div>
                <span className="self-start rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">{feeStatusLabels[reservation.status]}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"><div><h2 className="font-bold text-gray-900">Lịch sử số dư</h2><p className="text-xs text-gray-500 mt-1">Dữ liệu từ sổ cái append-only.</p></div><History className="w-5 h-5 text-gray-400" /></div>
        {wallet.ledger.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Chưa có biến động số dư.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {wallet.ledger.map(movement => (
              <div key={movement.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div><p className="font-semibold text-sm text-gray-900">{movementLabels[movement.operation]}</p><p className="text-xs text-gray-500 mt-1">{formatDate(movement.occurred_at)}</p></div>
                <div className="sm:text-right"><p className="font-bold text-gray-900">{formatMoney(movement.amount_minor)}</p><p className="text-[11px] text-gray-500 mt-1">Khả dụng {formatMoney(movement.available_after)} · Giữ chỗ {formatMoney(movement.reserved_after)}</p></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"><div><h2 className="font-bold text-gray-900">Biên nhận nội bộ</h2><p className="text-xs text-gray-500 mt-1">Biên nhận xác nhận biến động ví, không phải hóa đơn thuế.</p></div><FileText className="w-5 h-5 text-gray-400" /></div>
        {wallet.receipts.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Chưa có biên nhận.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {wallet.receipts.map(receipt => (
              <div key={receipt.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div><p className="font-semibold text-sm text-gray-900">{receipt.receipt_number}</p><p className="text-xs text-gray-500 mt-1">{receipt.receipt_kind === 'wallet_topup' ? 'Nạp tiền vào ví' : 'Phí tin đăng'} · {formatDate(receipt.issued_at)}</p></div>
                <div className="sm:text-right"><p className="font-bold text-gray-900">{formatMoney(receipt.amount_minor)}</p><p className="text-[11px] text-gray-500 mt-1">{receipt.status === 'issued' ? 'Đã phát hành' : 'Đã hủy'}</p></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {wallet.topupIntents.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-bold text-gray-900">Lịch sử yêu cầu nạp</h2></div>
          <div className="divide-y divide-gray-100">
            {wallet.topupIntents.map(intent => (
              <div key={intent.id} className="px-5 py-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-sm text-gray-900">{formatMoney(intent.requested_amount_minor)}</p><p className="text-xs text-gray-500 mt-1">{formatDate(intent.created_at)}</p></div><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">{topupStatusLabels[intent.status]}</span></div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
