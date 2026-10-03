'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert, X } from 'lucide-react';
import {
  getCommerceOperationsAlertDetail,
  getCommerceOperationsAlerts,
  getCommerceOperationsQueueHealth,
  getCommerceWalletSupportDetail,
  updateCommerceOperationsAlertStatus,
  type CommerceOperationsAlert,
  type CommerceOperationsAlertDetail,
  type CommerceOperationsQueueSnapshot,
} from '../../../lib/api/commerce';

type AlertFilter = CommerceOperationsAlert['status'] | null;

const filters: Array<{ value: AlertFilter; label: string }> = [
  { value: null, label: 'Tất cả' },
  { value: 'open', label: 'Đang mở' },
  { value: 'acknowledged', label: 'Đã nhận' },
  { value: 'resolved', label: 'Đã xử lý' },
];

const codeLabels: Record<CommerceOperationsAlert['code'], string> = {
  duplicate_settlement: 'Thanh toán trùng',
  payment_failure_ignored: 'Payment fail sau settlement',
  email_delivery_dead_letter: 'Email giao dịch không gửi được',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function payloadText(payload: Record<string, unknown>): string | null {
  const orderId = typeof payload.orderId === 'string' ? payload.orderId : typeof payload.order_id === 'string' ? payload.order_id : null;
  const reason = typeof payload.reason === 'string' ? payload.reason : null;
  return [orderId ? `Order: ${orderId}` : null, reason ? `Lý do: ${reason}` : null].filter(Boolean).join(' · ') || null;
}

function formatMoney(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
}

function QueueHealth({
  label,
  snapshot,
}: {
  label: string;
  snapshot: CommerceOperationsQueueSnapshot;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-gray-900">{label}</h3>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600">Chỉ đọc</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['Pending', snapshot.pending],
          ['Processing', snapshot.processing],
          ['Retry', snapshot.retry],
          ['Dead-letter', snapshot.dead_letter],
          ['Sent', snapshot.sent],
        ].map(([status, count]) => (
          <div key={String(status)} className="rounded-lg bg-gray-50 p-3">
            <p className="text-[11px] text-gray-500">{status}</p>
            <p className="mt-1 text-lg font-black text-gray-900">{String(count)}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Oldest actionable: <span className="font-semibold text-gray-700">{snapshot.oldest_actionable_at ? formatDate(snapshot.oldest_actionable_at) : 'Không có'}</span>
      </p>
    </section>
  );
}

function WalletSupportLookup() {
  const [input, setInput] = useState('');
  const [lookup, setLookup] = useState('');
  const query = useQuery({
    queryKey: ['commerceWalletSupportDetail', lookup],
    queryFn: () => getCommerceWalletSupportDetail(lookup),
    enabled: lookup.length > 0,
  });
  const intent = query.data?.topupIntent;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-semibold text-gray-600">Tra cứu Wallet bằng top-up ID, checkout ID, provider payment ID hoặc order code<input value={input} onChange={event => setInput(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal" placeholder="Dán mã đối soát" /></label>
        <button onClick={() => setLookup(input.trim())} disabled={!input.trim() || query.isFetching} className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Tra cứu</button>
      </div>
      {query.isError && <p className="mt-3 text-xs text-red-700">Không tìm thấy giao dịch hoặc tài khoản chưa có quyền Wallet support.</p>}
      {intent && query.data && <div className="mt-4 space-y-3 text-xs">
        <div className="grid gap-2 sm:grid-cols-4"><div><span className="text-gray-500">Trạng thái</span><p className="font-bold text-gray-900">{String(intent.status ?? '—')}</p></div><div><span className="text-gray-500">Số tiền</span><p className="font-bold text-gray-900">{formatMoney(intent.requested_amount_minor)}</p></div><div><span className="text-gray-500">Checkout</span><p className="font-bold text-gray-900">{query.data.checkout ? String(query.data.checkout.status ?? '—') : 'Chưa tạo'}</p></div><div><span className="text-gray-500">Reconciliation</span><p className="font-bold text-gray-900">{query.data.reconciliation.length}</p></div></div>
        <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-gray-50 p-3"><p className="font-bold text-gray-700">Ledger</p><p className="mt-1 text-gray-500">{query.data.ledger.length} movement</p></div><div className="rounded-lg bg-gray-50 p-3"><p className="font-bold text-gray-700">Biên nhận</p><p className="mt-1 text-gray-500">{query.data.receipts.length} internal receipt</p></div><div className="rounded-lg bg-gray-50 p-3"><p className="font-bold text-gray-700">Finance case</p><p className="mt-1 text-gray-500">{query.data.financeCases.length} case</p></div></div>
        <p className="text-[11px] text-gray-400">Không hiển thị payload provider, claim token, chữ ký hoặc authorization header.</p>
      </div>}
    </section>
  );
}

function OperationsDetail({ detail, onClose }: { detail: CommerceOperationsAlertDetail; onClose: () => void }) {
  const countCards = [
    ['Payment events', detail.paymentEvents.length],
    ['Entitlements', detail.entitlements.length],
    ['Quota cycles', detail.quotaReservations.length],
    ['Listings', detail.listings.length],
    ['Properties', detail.properties.length],
    ['Notifications', detail.notifications.length],
    ['Email deliveries', detail.emailDeliveries.length],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Đóng chi tiết" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-gray-50 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <div><h3 className="font-bold text-gray-900">Chuỗi xử lý thanh toán</h3><p className="text-xs text-gray-500 mt-1 break-all">Alert: {detail.alert.id}</p></div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Order</p><p className="font-bold text-gray-900 mt-1">#{String(detail.order?.order_number ?? '—')}</p><p className="text-xs text-gray-600 mt-1">{detail.order?.status ?? 'Không tìm thấy'} · {formatMoney(detail.order?.total_minor)}</p><p className="text-[11px] text-gray-400 mt-2 break-all">Owner: {detail.order?.owner_user_id ?? '—'}</p></div>
            <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Payment attempt</p><p className="font-bold text-gray-900 mt-1">{detail.paymentAttempt?.status ?? 'Không tìm thấy'}</p><p className="text-xs text-gray-600 mt-1">{detail.paymentAttempt?.provider ?? '—'} · {formatMoney(detail.paymentAttempt?.amount_minor)}</p><p className="text-[11px] text-gray-400 mt-2 break-all">{detail.paymentAttempt?.provider_payment_id ?? 'Chưa có provider ID'}</p></div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {countCards.map(([label, count]) => <div key={String(label)} className="rounded-xl border border-gray-200 bg-white px-3 py-3"><p className="text-[11px] text-gray-500">{label}</p><p className="font-black text-gray-900 mt-1">{count}</p></div>)}
          </div>

          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3"><h4 className="font-bold text-sm text-gray-900">Entitlements và listing</h4></div>
            {detail.entitlements.length === 0 ? <p className="p-4 text-sm text-gray-500">Không có entitlement.</p> : <div className="divide-y divide-gray-100">{detail.entitlements.map(entitlement => <div key={entitlement.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-sm text-gray-900">{entitlement.benefit_kind}</p><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{entitlement.status}</span></div><p className="text-[11px] text-gray-400 mt-1 break-all">Listing: {entitlement.user_listing_id ?? 'chưa gắn'} · Property: {entitlement.property_id ?? 'chưa gắn'}</p></div>)}</div>}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3"><h4 className="font-bold text-sm text-gray-900">Quota cycles</h4></div>
            {detail.quotaReservations.length === 0 ? <p className="p-4 text-sm text-gray-500">Không có quota cycle.</p> : <div className="divide-y divide-gray-100">{detail.quotaReservations.map((reservation, index) => <div key={String(reservation.id ?? index)} className="px-4 py-3 text-xs text-gray-600"><span className="font-semibold text-gray-900">Cycle {String(reservation.submission_cycle ?? '—')}</span> · {String(reservation.status ?? '—')}<p className="text-[11px] text-gray-400 mt-1 break-all">Listing: {String(reservation.user_listing_id ?? '—')}</p></div>)}</div>}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3"><h4 className="font-bold text-sm text-gray-900">Email deliveries</h4></div>
            {detail.emailDeliveries.length === 0 ? <p className="p-4 text-sm text-gray-500">Alert này không có email delivery.</p> : <div className="divide-y divide-gray-100">{detail.emailDeliveries.map(delivery => <div key={delivery.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-sm text-gray-900">{delivery.template_kind}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${delivery.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : delivery.status === 'dead_letter' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{delivery.status}</span></div><p className="text-xs text-gray-500 mt-1">Attempts: {delivery.attempts} · Error: {delivery.last_error_code ?? '—'}</p><p className="text-[11px] text-gray-400 mt-1 break-all">Provider message: {delivery.provider_message_id ?? '—'}</p></div>)}</div>}
          </section>

          <p className="text-xs text-gray-500">Audit timeline: {detail.auditTimeline.length} sự kiện · Sinh lúc {formatDate(detail.generatedAt)}</p>
        </div>
      </aside>
    </div>
  );
}

export function CommerceOperationsTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AlertFilter>('open');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const { data: alerts = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['commerceOperationsAlerts', filter],
    queryFn: () => getCommerceOperationsAlerts(filter),
  });

  const detailQuery = useQuery({
    queryKey: ['commerceOperationsAlertDetail', selectedAlertId],
    queryFn: () => getCommerceOperationsAlertDetail(selectedAlertId!),
    enabled: selectedAlertId !== null,
  });

  const queueHealthQuery = useQuery({
    queryKey: ['commerceOperationsQueueHealth'],
    queryFn: getCommerceOperationsQueueHealth,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CommerceOperationsAlert['status'] }) =>
      updateCommerceOperationsAlertStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commerceOperationsAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['commerceOperationsAlertDetail'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Vận hành thanh toán</h2>
          <p className="text-sm text-gray-500 mt-1">Theo dõi settlement trùng và payment failure cần đối soát thủ công.</p>
        </div>
        <button onClick={() => {
          void refetch();
          void queueHealthQuery.refetch();
        }} disabled={isFetching || queueHealthQuery.isFetching} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />Làm mới
        </button>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div><p className="font-bold">SLA pilot</p><p className="text-xs mt-1">Acknowledge trong 4 giờ làm việc, reconcile hoặc khắc phục trong 1 ngày làm việc. Khóa checkout nếu backlog không còn an toàn.</p></div>
      </div>

      {queueHealthQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2"><div className="h-44 rounded-xl bg-white border border-gray-200 animate-pulse" /><div className="h-44 rounded-xl bg-white border border-gray-200 animate-pulse" /></div>
      ) : queueHealthQuery.isError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Không tải được queue health hoặc tài khoản chưa có quyền operations view.</div>
      ) : queueHealthQuery.data ? (
        <div className="space-y-2">
          <div className="grid gap-4 lg:grid-cols-2">
            <QueueHealth label="Outbox queue" snapshot={queueHealthQuery.data.outbox} />
            <QueueHealth label="Email delivery queue" snapshot={queueHealthQuery.data.email} />
          </div>
          <p className="text-[11px] text-gray-500">Số liệu aggregate chỉ đọc; dead-letter cần xử lý vận hành thủ công. Màn hình này không retry hoặc dispatch queue.</p>
        </div>
      ) : null}

      <WalletSupportLookup />

      <div className="flex gap-2 overflow-x-auto">
        {filters.map(item => (
          <button key={item.value ?? 'all'} onClick={() => setFilter(item.value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${filter === item.value ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{item.label}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-32 rounded-xl bg-white border border-gray-200 animate-pulse" />)}</div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Không tải được operations alerts hoặc tài khoản chưa có quyền xem.</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-14 text-center"><CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" /><p className="font-semibold text-gray-700 mt-3">Không có alert trong trạng thái này</p></div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => {
            const summary = payloadText(alert.alert_payload);
            return (
              <article key={alert.id} className={`rounded-xl border bg-white p-4 ${alert.severity === 'critical' ? 'border-red-200' : 'border-amber-200'}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-lg p-2 ${alert.severity === 'critical' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}><AlertTriangle className="w-5 h-5" /></div>
                    <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-gray-900 text-sm">{codeLabels[alert.code]}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${alert.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{alert.severity}</span></div><p className="text-xs text-gray-500 mt-1">{formatDate(alert.created_at)}</p>{summary && <p className="text-xs text-gray-600 mt-2 break-all">{summary}</p>}<p className="text-[11px] text-gray-400 mt-2 break-all">Alert: {alert.id}</p></div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <button onClick={() => setSelectedAlertId(alert.id)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">Xem chuỗi</button>
                    {alert.status === 'open' && canEdit && <button onClick={() => statusMutation.mutate({ id: alert.id, status: 'acknowledged' })} disabled={statusMutation.isPending} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50">Đã nhận</button>}
                    {alert.status !== 'resolved' && canEdit && <button onClick={() => statusMutation.mutate({ id: alert.id, status: 'resolved' })} disabled={statusMutation.isPending} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Đã xử lý</button>}
                    {!canEdit && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">Chỉ xem</span>}
                    {alert.status === 'resolved' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="w-4 h-4" />Đã xử lý</span>}
                    {alert.status === 'acknowledged' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock3 className="w-4 h-4" />Đã nhận</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedAlertId && detailQuery.isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="rounded-xl bg-white px-5 py-4 text-sm font-semibold text-gray-700">Đang tải chuỗi xử lý...</div></div>
      )}
      {selectedAlertId && detailQuery.isError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="w-full max-w-sm rounded-xl bg-white p-5"><p className="font-bold text-red-700">Không tải được chi tiết alert</p><button onClick={() => setSelectedAlertId(null)} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white">Đóng</button></div></div>
      )}
      {selectedAlertId && detailQuery.data && <OperationsDetail detail={detailQuery.data} onClose={() => setSelectedAlertId(null)} />}
    </div>
  );
}
