import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronRight, FileText, Plus, RefreshCw,
  Send, ShieldCheck, Upload, XCircle,
} from 'lucide-react';
import {
  getPropertyOptions,
  getPropertyVerificationCases,
  getPropertyVerificationEvidence,
  getPropertyVerificationEvents,
  getAiVerificationRecommendation,
  openPropertyVerificationCase,
  revokePropertyVerificationCase,
  submitPropertyVerificationCase,
  uploadPropertyVerificationEvidence,
  decidePropertyVerificationCase,
} from '../../../lib/api';
import {
  PUBLIC_VERIFICATION_REASON_LABELS,
  PUBLIC_VERIFICATION_REASON_ORDER,
  type PublicVerificationReasonCode,
} from '../../../lib/propertyVerification';
import type { AiVerificationRecommendation } from '../../../lib/aiVerificationRecommendation';
import type {
  PropertyVerificationCase,
  PropertyVerificationEvidence,
  PropertyVerificationEvidenceKind,
  PropertyVerificationEvent,
  PropertyVerificationStatus,
} from '../../../lib/supabase';

const CASE_STATUS_LABELS: Record<PropertyVerificationStatus, string> = {
  draft: 'Nháp',
  submitted: 'Chờ quyết định',
  verified: 'Đã kiểm tra',
  rejected: 'Không chấp thuận',
  revoked: 'Đã thu hồi',
  withdrawn: 'Đã rút',
  superseded: 'Đã thay thế',
};

const EVIDENCE_KIND_LABELS: Record<PropertyVerificationEvidenceKind, string> = {
  contact_confirmation: 'Xác nhận liên hệ',
  location_reference: 'Tài liệu vị trí',
  media_reference: 'Ảnh hoặc video tham chiếu',
  document_reference: 'Tài liệu tham chiếu',
  other: 'Khác',
};

function statusClass(status: PropertyVerificationStatus): string {
  if (status === 'verified') return 'bg-emerald-100 text-emerald-700';
  if (status === 'submitted') return 'bg-amber-100 text-amber-700';
  if (status === 'rejected' || status === 'revoked') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

function toLocalDateTimeInput(date: Date): string {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function defaultExpiryInput(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return toLocalDateTimeInput(date);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function eventLabel(event: PropertyVerificationEvent): string {
  const labels: Record<PropertyVerificationEvent['event_type'], string> = {
    opened: 'Mở hồ sơ',
    evidence_added: 'Thêm bằng chứng',
    submitted: 'Gửi hồ sơ',
    verified: 'Chấp thuận hồ sơ',
    rejected: 'Không chấp thuận',
    revoked: 'Thu hồi xác nhận',
    withdrawn: 'Rút hồ sơ',
    superseded: 'Thay thế hồ sơ',
  };
  return labels[event.event_type];
}

export function PropertyVerificationTab() {
  const [cases, setCases] = useState<PropertyVerificationCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<PropertyVerificationCase | null>(null);
  const [evidence, setEvidence] = useState<PropertyVerificationEvidence[]>([]);
  const [events, setEvents] = useState<PropertyVerificationEvent[]>([]);
  const [aiRecommendation, setAiRecommendation] = useState<AiVerificationRecommendation | null>(null);
  const [aiRecommendationLoading, setAiRecommendationLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PropertyVerificationStatus | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getPropertyVerificationCases(statusFilter === 'all' ? undefined : statusFilter);
      setCases(rows);
      setSelectedCase(current => rows.find(row => row.id === current?.id) ?? null);
    } catch (cause) {
      setError((cause as Error).message || 'Không tải được hồ sơ xác minh.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void loadCases(); }, [loadCases]);

  const loadDetail = useCallback(async (item: PropertyVerificationCase) => {
    setSelectedCase(item);
    setAiRecommendation(null);
    setDetailLoading(true);
    setError(null);
    try {
      const [nextEvidence, nextEvents] = await Promise.all([
        getPropertyVerificationEvidence(item.id),
        getPropertyVerificationEvents(item.id),
      ]);
      setEvidence(nextEvidence);
      setEvents(nextEvents);
    } catch (cause) {
      setError((cause as Error).message || 'Không tải được bằng chứng hoặc lịch sử hồ sơ.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshSelected = useCallback(async (caseId: string) => {
    await loadCases();
    const refreshed = (await getPropertyVerificationCases()).find(item => item.id === caseId);
    if (refreshed) await loadDetail(refreshed);
  }, [loadCases, loadDetail]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Hồ sơ kiểm tra tin</h2>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-gray-500">
            Chỉ ghi nhận phần thông tin đã được kiểm tra theo tài liệu đính kèm. Không xác nhận quyền sở hữu, tính pháp lý, quy hoạch, giá trị đầu tư hoặc an toàn giao dịch.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700">
          <Plus className="h-4 w-4" />Mở hồ sơ
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <label className="text-xs font-semibold text-gray-600" htmlFor="verification-case-status">Trạng thái</label>
        <select id="verification-case-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as PropertyVerificationStatus | 'all')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
          <option value="all">Tất cả</option>
          {(Object.keys(CASE_STATUS_LABELS) as PropertyVerificationStatus[]).map(status => <option key={status} value={status}>{CASE_STATUS_LABELS[status]}</option>)}
        </select>
        <button type="button" onClick={() => void loadCases()} disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-white disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Làm mới
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.4fr)]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Danh sách hồ sơ</div>
          {loading ? <LoadingBlock /> : cases.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400">Chưa có hồ sơ theo điều kiện này.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {cases.map(item => (
                <button type="button" key={item.id} onClick={() => void loadDetail(item)}
                  className={`w-full px-4 py-3 text-left transition-colors ${selectedCase?.id === item.id ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{item.properties?.title ?? item.property_id}</p>
                      <p className="mt-1 text-xs text-gray-500">Mở lúc {formatDate(item.created_at)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(item.status)}`}>{CASE_STATUS_LABELS[item.status]}</span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white">
          {!selectedCase ? (
            <div className="flex min-h-72 items-center justify-center px-6 text-center text-sm text-gray-400">Chọn một hồ sơ để xem bằng chứng, trạng thái và lịch sử bất biến.</div>
          ) : detailLoading ? <LoadingBlock /> : (
            <CaseDetail caseItem={selectedCase} evidence={evidence} events={events} busy={busy}
              aiRecommendation={aiRecommendation}
              aiRecommendationLoading={aiRecommendationLoading}
              onGenerateAiRecommendation={async () => {
                setAiRecommendationLoading(true); setError(null);
                try { setAiRecommendation(await getAiVerificationRecommendation(selectedCase.id)); }
                catch (cause) { setError((cause as Error).message || 'Không thể tạo gợi ý hỗ trợ kiểm tra.'); }
                finally { setAiRecommendationLoading(false); }
              }}
              onUpload={async (kind, file) => {
                setBusy(true); setError(null);
                try { await uploadPropertyVerificationEvidence(selectedCase.id, kind, file); await refreshSelected(selectedCase.id); }
                catch (cause) { setError((cause as Error).message || 'Không thể tải lên bằng chứng.'); }
                finally { setBusy(false); }
              }}
              onSubmit={async () => {
                setBusy(true); setError(null);
                try { await submitPropertyVerificationCase(selectedCase.id); await refreshSelected(selectedCase.id); }
                catch (cause) { setError((cause as Error).message || 'Không thể gửi hồ sơ.'); }
                finally { setBusy(false); }
              }}
              onDecide={async (decision, reasons, verifiedUntil, note) => {
                setBusy(true); setError(null);
                try { await decidePropertyVerificationCase(selectedCase.id, decision, reasons, verifiedUntil, note); await refreshSelected(selectedCase.id); }
                catch (cause) { setError((cause as Error).message || 'Không thể lưu quyết định.'); }
                finally { setBusy(false); }
              }}
              onRevoke={async note => {
                setBusy(true); setError(null);
                try { await revokePropertyVerificationCase(selectedCase.id, note); await refreshSelected(selectedCase.id); }
                catch (cause) { setError((cause as Error).message || 'Không thể thu hồi hồ sơ.'); }
                finally { setBusy(false); }
              }}
            />
          )}
        </section>
      </div>

      {showCreate && <CreateCaseDialog onClose={() => setShowCreate(false)} onCreated={async caseId => {
        setShowCreate(false);
        await loadCases();
        const item = (await getPropertyVerificationCases()).find(row => row.id === caseId);
        if (item) await loadDetail(item);
      }} />}
    </div>
  );
}

function LoadingBlock() {
  return <div className="space-y-3 p-4"><div className="h-5 w-1/3 animate-pulse rounded bg-gray-100" /><div className="h-14 animate-pulse rounded bg-gray-100" /><div className="h-14 animate-pulse rounded bg-gray-100" /></div>;
}

function CreateCaseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (caseId: string) => Promise<void> }) {
  const [properties, setProperties] = useState<{ id: string; title: string; price: number; price_unit: string; price_label: string | null; area_sqm: number | null }[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [scopeCodes, setScopeCodes] = useState<PublicVerificationReasonCode[]>([]);
  const [publicReasonCodes, setPublicReasonCodes] = useState<PublicVerificationReasonCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getPropertyOptions().then(setProperties).catch(cause => setError((cause as Error).message || 'Không tải được danh sách tin đang hiển thị.')).finally(() => setLoading(false));
  }, []);

  const toggleScope = (code: PublicVerificationReasonCode) => {
    setScopeCodes(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]);
    setPublicReasonCodes(current => current.filter(item => item !== code));
  };
  const togglePublicReason = (code: PublicVerificationReasonCode) => {
    setPublicReasonCodes(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]);
  };

  const submit = async () => {
    if (!propertyId || scopeCodes.length === 0) {
      setError('Chọn tin và ít nhất một phạm vi kiểm tra.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const item = await openPropertyVerificationCase({ propertyId, scopeCodes, publicReasonCodes });
      await onCreated(item.id);
    } catch (cause) {
      setError((cause as Error).message || 'Không thể mở hồ sơ.');
    } finally { setSaving(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="create-verification-case-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div><h3 id="create-verification-case-title" className="font-bold text-gray-900">Mở hồ sơ kiểm tra</h3><p className="mt-1 text-xs text-gray-500">Bằng chứng sẽ chỉ lưu trong kho riêng tư; không tạo xác nhận công khai ở bước này.</p></div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><XCircle className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 p-5">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label htmlFor="verification-property" className="mb-1 block text-xs font-semibold text-gray-700">Tin đang hiển thị *</label>
            <select id="verification-property" disabled={loading} value={propertyId} onChange={event => setPropertyId(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
              <option value="">-- Chọn tin --</option>
              {properties.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </div>
          <ScopeChecklist label="Phạm vi đã kiểm tra *" values={scopeCodes} onToggle={toggleScope} />
          <ScopeChecklist label="Nội dung có thể công bố (tùy chọn, phải thuộc phạm vi trên)" values={publicReasonCodes} onToggle={togglePublicReason} disabledCodes={PUBLIC_VERIFICATION_REASON_ORDER.filter(code => !scopeCodes.includes(code))} />
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Không ghi số giấy tờ, nội dung giấy tờ tùy thân, URL công khai hoặc nhận định pháp lý vào lý do công khai.</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4"><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Hủy</button><button type="button" disabled={saving || loading} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />{saving ? 'Đang mở...' : 'Mở hồ sơ'}</button></div>
      </div>
    </div>
  );
}

function ScopeChecklist({ label, values, onToggle, disabledCodes = [] }: { label: string; values: readonly PublicVerificationReasonCode[]; onToggle: (code: PublicVerificationReasonCode) => void; disabledCodes?: readonly PublicVerificationReasonCode[] }) {
  return <fieldset><legend className="mb-2 text-xs font-semibold text-gray-700">{label}</legend><div className="grid gap-2 sm:grid-cols-2">{PUBLIC_VERIFICATION_REASON_ORDER.map(code => <label key={code} className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${disabledCodes.includes(code) ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400' : 'cursor-pointer border-gray-200 text-gray-700 hover:border-red-200'}`}><input type="checkbox" disabled={disabledCodes.includes(code)} checked={values.includes(code)} onChange={() => onToggle(code)} className="mt-0.5 accent-red-600" />{PUBLIC_VERIFICATION_REASON_LABELS[code]}</label>)}</div></fieldset>;
}

function CaseDetail({ caseItem, evidence, events, busy, aiRecommendation, aiRecommendationLoading, onGenerateAiRecommendation, onUpload, onSubmit, onDecide, onRevoke }: {
  caseItem: PropertyVerificationCase; evidence: PropertyVerificationEvidence[]; events: PropertyVerificationEvent[]; busy: boolean;
  aiRecommendation: AiVerificationRecommendation | null;
  aiRecommendationLoading: boolean;
  onGenerateAiRecommendation: () => Promise<void>;
  onUpload: (kind: PropertyVerificationEvidenceKind, file: File) => Promise<void>;
  onSubmit: () => Promise<void>;
  onDecide: (decision: 'verified' | 'rejected', reasons: string[], verifiedUntil: string | null, note: string) => Promise<void>;
  onRevoke: (note: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<PropertyVerificationEvidenceKind>('document_reference');
  const [reasonCodes, setReasonCodes] = useState<PublicVerificationReasonCode[]>(caseItem.public_reason_codes.filter((code): code is PublicVerificationReasonCode => (PUBLIC_VERIFICATION_REASON_ORDER as readonly string[]).includes(code)));
  const [expiry, setExpiry] = useState(defaultExpiryInput);
  const [note, setNote] = useState('');
  const allowedReasons = useMemo(() => new Set(caseItem.scope_codes), [caseItem.scope_codes]);

  useEffect(() => {
    setReasonCodes(caseItem.public_reason_codes.filter((code): code is PublicVerificationReasonCode => (PUBLIC_VERIFICATION_REASON_ORDER as readonly string[]).includes(code)));
    setExpiry(caseItem.verified_until ? toLocalDateTimeInput(new Date(caseItem.verified_until)) : defaultExpiryInput());
    setNote(''); setFile(null);
  }, [caseItem]);

  const toggleReason = (code: PublicVerificationReasonCode) => setReasonCodes(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]);
  const isDraft = caseItem.status === 'draft';
  const isSubmitted = caseItem.status === 'submitted';
  const isVerified = caseItem.status === 'verified';

  return <div className="divide-y divide-gray-100">
    <div className="flex flex-wrap items-start gap-3 px-5 py-4">
      <div className="min-w-0 flex-1"><h3 className="truncate font-bold text-gray-900">{caseItem.properties?.title ?? caseItem.property_id}</h3><p className="mt-1 text-xs text-gray-500">Hồ sơ mở {formatDate(caseItem.created_at)} · {CASE_STATUS_LABELS[caseItem.status]}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(caseItem.status)}`}>{CASE_STATUS_LABELS[caseItem.status]}</span>
    </div>

    <div className="space-y-3 px-5 py-4"><h4 className="text-sm font-bold text-gray-800">Phạm vi hồ sơ</h4><ul className="space-y-1.5 text-sm text-gray-600">{caseItem.scope_codes.map(code => <li key={code} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />{PUBLIC_VERIFICATION_REASON_LABELS[code as PublicVerificationReasonCode] ?? code}</li>)}</ul>{caseItem.verified_until && <p className="text-xs text-gray-500">Hiệu lực công khai đến: {formatDate(caseItem.verified_until)}</p>}</div>

    <div className="space-y-3 px-5 py-4"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-gray-500" /><h4 className="text-sm font-bold text-gray-800">Bằng chứng riêng tư ({evidence.length})</h4></div>{evidence.length === 0 ? <p className="text-sm text-gray-400">Chưa có bằng chứng.</p> : <ul className="space-y-2">{evidence.map(item => <li key={item.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs"><span className="min-w-0 truncate font-medium text-gray-700">{item.file_name}</span><span className="ml-3 shrink-0 text-gray-500">{EVIDENCE_KIND_LABELS[item.kind]} · {Math.ceil(item.size_bytes / 1024)} KB</span></li>)}</ul>}{isDraft && <div className="rounded-lg border border-dashed border-gray-300 p-3"><div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event => setFile(event.target.files?.[0] ?? null)} className="min-w-0 text-xs" /><select value={kind} onChange={event => setKind(event.target.value as PropertyVerificationEvidenceKind)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">{(Object.keys(EVIDENCE_KIND_LABELS) as PropertyVerificationEvidenceKind[]).map(value => <option key={value} value={value}>{EVIDENCE_KIND_LABELS[value]}</option>)}</select><button type="button" disabled={!file || busy} onClick={() => file && void onUpload(kind, file)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Upload className="h-3.5 w-3.5" />Tải lên</button></div><p className="mt-2 text-[11px] text-gray-500">PDF, JPEG, PNG hoặc WebP, tối đa 10MB. Tệp không có URL công khai.</p></div>}</div>

    <div className="space-y-3 bg-slate-50 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h4 className="text-sm font-bold text-gray-800">Gợi ý hỗ trợ kiểm tra (AI)</h4><p className="mt-1 text-xs leading-5 text-gray-500">Chỉ phân tích trạng thái và tham chiếu bằng chứng đã gắn với hồ sơ. Không đọc nội dung tệp và không thay thế quyết định owner MFA.</p></div>
        <button type="button" disabled={aiRecommendationLoading} onClick={() => void onGenerateAiRecommendation()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${aiRecommendationLoading ? 'animate-spin' : ''}`} />{aiRecommendationLoading ? 'Đang tạo...' : aiRecommendation ? 'Tạo lại gợi ý' : 'Tạo gợi ý'}</button>
      </div>
      {aiRecommendation && <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-gray-700"><p className="font-semibold text-gray-900">{aiRecommendation.summary}</p><p><span className="font-semibold">Mức hỗ trợ:</span> {aiRecommendation.status === 'insufficient_evidence' ? 'Chưa đủ bằng chứng' : aiRecommendation.status === 'needs_more_evidence' ? 'Cần bổ sung bằng chứng' : 'Có thể xem xét thủ công'}</p>{aiRecommendation.missing_scopes.length > 0 && <p><span className="font-semibold">Phạm vi còn thiếu:</span> {aiRecommendation.missing_scopes.join(', ')}</p>}<p className="text-[11px] leading-5 text-amber-700">{aiRecommendation.warnings[0]}</p></div>}
    </div>

    {isDraft && <div className="flex justify-end px-5 py-4"><button type="button" disabled={busy || evidence.length === 0} onClick={() => void onSubmit()} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />Gửi quyết định</button></div>}

    {isSubmitted && <div className="space-y-4 px-5 py-4"><div><h4 className="text-sm font-bold text-gray-800">Quyết định owner MFA</h4><p className="mt-1 text-xs text-gray-500">Chỉ công bố phần phạm vi đã kiểm tra. Quyết định và thời hạn được ghi vào audit.</p></div><ScopeChecklist label="Lý do công khai khi chấp thuận" values={reasonCodes} onToggle={toggleReason} disabledCodes={PUBLIC_VERIFICATION_REASON_ORDER.filter(code => !allowedReasons.has(code))} /><label className="block text-xs font-semibold text-gray-700">Hiệu lực đến<input type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label><label className="block text-xs font-semibold text-gray-700">Ghi chú nội bộ (không công khai)<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => void onDecide('rejected', [], null, note)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><XCircle className="h-4 w-4" />Không chấp thuận</button><button type="button" disabled={busy || reasonCodes.length === 0 || !expiry} onClick={() => void onDecide('verified', reasonCodes, new Date(expiry).toISOString(), note)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Chấp thuận có thời hạn</button></div></div>}

    {isVerified && <div className="space-y-3 px-5 py-4"><p className="text-sm text-gray-600">Thu hồi sẽ xóa ngay trạng thái công khai và giữ lại lịch sử hồ sơ.</p><label className="block text-xs font-semibold text-gray-700">Lý do thu hồi nội bộ<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label><div className="flex justify-end"><button type="button" disabled={busy} onClick={() => void onRevoke(note)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><XCircle className="h-4 w-4" />Thu hồi</button></div></div>}

    <div className="space-y-3 px-5 py-4"><h4 className="text-sm font-bold text-gray-800">Lịch sử hồ sơ</h4>{events.length === 0 ? <p className="text-sm text-gray-400">Chưa có sự kiện.</p> : <ol className="space-y-3 border-l border-gray-200 pl-4">{events.map(event => <li key={event.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-gray-300" /><p className="text-sm font-medium text-gray-700">{eventLabel(event)}</p><p className="text-xs text-gray-500">{formatDate(event.occurred_at)} · {event.actor_role === 'admin' ? 'Owner MFA' : 'Hệ thống'}</p></li>)}</ol>}</div>
  </div>;
}
