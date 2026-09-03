'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Eye, Loader2, Phone, PhoneCall, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getMyListingLeadStats, getMyListingLeads, type MyListingLeadFilters } from '../lib/api';
import { type Lead, type MyListingLead } from '../lib/supabase';
import { qk } from '../lib/queryKeys';

const SOURCE_LABELS: Record<string, string> = {
  property_phone_reveal: 'Hiện số điện thoại',
  property_callback: 'Yêu cầu gọi lại',
  property_detail_form: 'Form liên hệ',
  contact_modal: 'Form liên hệ',
  invest_page: 'Trang đầu tư',
  about_page: 'Trang giới thiệu',
  valuation_page: 'Định giá',
  ai_advisor: 'Trợ lý AI',
};

const STATUS_LABELS: Record<Lead['status'], string> = {
  new: 'Mới',
  contacted: 'Đã liên hệ',
  nurturing: 'Đang chăm sóc',
  viewing: 'Đã xem nhà',
  negotiating: 'Đang đàm phán',
  won: 'Đã chốt',
  lost: 'Không tiếp tục',
};

const STATUS_CLASSES: Record<Lead['status'], string> = {
  new: 'bg-sky-100 text-sky-700',
  contacted: 'bg-cyan-100 text-cyan-700',
  nurturing: 'bg-amber-100 text-amber-700',
  viewing: 'bg-violet-100 text-violet-700',
  negotiating: 'bg-orange-100 text-orange-700',
  won: 'bg-emerald-100 text-emerald-700',
  lost: 'bg-gray-100 text-gray-600',
};

const PAGE_SIZE = 50;

type SourceFilter = 'all' | 'property_phone_reveal' | 'property_callback';

type StatsCardProps = { label: string; value: number; icon: React.ReactNode; className: string };

function StatsCard({ label, value, icon, className }: StatsCardProps) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        {icon}{label}
      </div>
      <div className="mt-1 text-xl font-black">{value.toLocaleString('vi-VN')}</div>
    </div>
  );
}

function LeadRow({ lead }: { lead: MyListingLead }) {
  const status = lead.status as Lead['status'];
  return (
    <div className="border-t border-gray-100 py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{lead.full_name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASSES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {SOURCE_LABELS[lead.source ?? ''] ?? 'Nguồn khác'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-700">
              <Phone className="h-3.5 w-3.5" />{lead.phone}
            </a>
            <span>{new Date(lead.created_at).toLocaleString('vi-VN')}</span>
          </div>
        </div>
        {lead.follow_up_at && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
            <CalendarClock className="h-3.5 w-3.5" />{new Date(lead.follow_up_at).toLocaleString('vi-VN')}
          </span>
        )}
      </div>
      {lead.message && <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600">{lead.message}</p>}
    </div>
  );
}

export function MyListingLeadsPage() {
  const [propertyId, setPropertyId] = useState('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<Lead['status'] | 'all'>('all');
  const [offset, setOffset] = useState(0);

  const statsQuery = useQuery({
    queryKey: qk.myListingLeadStats(),
    queryFn: getMyListingLeadStats,
  });
  const filters = useMemo<MyListingLeadFilters>(() => ({
    propertyId: propertyId === 'all' ? undefined : propertyId,
    source: source === 'all' ? undefined : source,
    status: status === 'all' ? undefined : status,
    limit: PAGE_SIZE,
    offset,
  }), [offset, propertyId, source, status]);
  const leadsQuery = useQuery({
    queryKey: qk.myListingLeads(filters),
    queryFn: () => getMyListingLeads(filters),
  });

  const stats = statsQuery.data ?? [];
  const leads = leadsQuery.data ?? [];
  const totalLeads = stats.reduce((sum, row) => sum + Number(row.total_leads), 0);
  const callbackLeads = stats.reduce((sum, row) => sum + Number(row.callback_leads), 0);
  const phoneReveals = stats.reduce((sum, row) => sum + Number(row.phone_reveals), 0);
  const views = stats.reduce((sum, row) => sum + Number(row.views), 0);
  const hasNextPage = leads.length === PAGE_SIZE;

  const resetPaging = (run: () => void) => {
    setOffset(0);
    run();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-black text-xl text-gray-900">Khách quan tâm</h2>
        <p className="mt-0.5 text-xs text-gray-500">Lead phát sinh từ các tin đăng thuộc tài khoản của bạn</p>
      </div>

      {(statsQuery.isLoading || leadsQuery.isLoading) && !stats.length && !leads.length ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-100 bg-white py-16 text-sm text-gray-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang tải dữ liệu khách quan tâm...
        </div>
      ) : statsQuery.isError || leadsQuery.isError ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-5 text-sm text-red-700">
          Không tải được dữ liệu khách quan tâm. Hãy thử làm mới trang.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatsCard label="Khách quan tâm" value={totalLeads} icon={<Users className="h-4 w-4 text-blue-600" />} className="border-blue-100 bg-blue-50 text-blue-900" />
            <StatsCard label="Yêu cầu gọi lại" value={callbackLeads} icon={<CalendarClock className="h-4 w-4 text-amber-600" />} className="border-amber-100 bg-amber-50 text-amber-900" />
            <StatsCard label="Click hiện số" value={phoneReveals} icon={<PhoneCall className="h-4 w-4 text-red-600" />} className="border-red-100 bg-red-50 text-red-900" />
            <StatsCard label="Lượt xem tin" value={views} icon={<Eye className="h-4 w-4 text-emerald-600" />} className="border-emerald-100 bg-emerald-50 text-emerald-900" />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <select value={propertyId} onChange={e => resetPaging(() => setPropertyId(e.target.value))} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300">
              <option value="all">Tất cả tin đăng</option>
              {stats.map(row => <option key={row.property_id} value={row.property_id}>{row.property_title}</option>)}
            </select>
            <select value={source} onChange={e => resetPaging(() => setSource(e.target.value as SourceFilter))} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300">
              <option value="all">Mọi nguồn lead</option>
              <option value="property_phone_reveal">Click hiện số</option>
              <option value="property_callback">Yêu cầu gọi lại</option>
            </select>
            <select value={status} onChange={e => resetPaging(() => setStatus(e.target.value as Lead['status'] | 'all'))} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300">
              <option value="all">Mọi trạng thái</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>

          {leads.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center">
              <Users className="mx-auto mb-3 h-12 w-12 text-gray-200" />
              <p className="font-semibold text-gray-600">Chưa có khách quan tâm phù hợp</p>
              <p className="mt-1 text-sm text-gray-400">Khi khách xem số hoặc yêu cầu gọi lại, lead sẽ xuất hiện tại đây.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white px-4 py-2 shadow-sm">
              {leads.map(lead => <LeadRow key={lead.lead_id} lead={lead} />)}
              <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
                <button disabled={offset === 0 || leadsQuery.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Trang trước</button>
                <span>Hiển thị {offset + 1}–{offset + leads.length}</span>
                <button disabled={!hasNextPage || leadsQuery.isFetching} onClick={() => setOffset(offset + PAGE_SIZE)} className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Trang sau</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
