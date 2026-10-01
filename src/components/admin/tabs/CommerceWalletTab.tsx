'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Save, WalletCards } from 'lucide-react';
import {
  getCommerceWalletAdminConfiguration,
  saveCommerceFeeProduct,
  saveCommerceWalletTopupOption,
  updateCommerceWalletTopupConfig,
  type CommerceWalletAdminConfiguration,
} from '../../../lib/api/commerce';

type Config = NonNullable<CommerceWalletAdminConfiguration['config']>;
type TopupOption = CommerceWalletAdminConfiguration['topupOptions'][number];
type FeeProduct = CommerceWalletAdminConfiguration['feeProducts'][number];

type OptionDraft = {
  id?: string;
  code: string;
  label: string;
  amountMinor: string;
  isActive: boolean;
  sortOrder: number;
};

type FeeDraft = {
  id?: string;
  code: string;
  version: number;
  name: string;
  description: string;
  productKind: 'listing_basic' | 'sponsored_addon';
  amountMinor: string;
  durationDays: number;
  placementCode: string;
  sponsoredLabel: string;
  termsVersion: string;
  isActive: boolean;
  isDefault: boolean;
  validFrom: string;
  validUntil: string;
};

const emptyConfig: Config = {
  id: true,
  is_active: false,
  custom_amount_enabled: false,
  custom_min_minor: null,
  custom_max_minor: null,
  custom_step_minor: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
};

function optionDraft(option?: TopupOption): OptionDraft {
  return option ? {
    id: option.id,
    code: option.code,
    label: option.label,
    amountMinor: String(option.amount_minor),
    isActive: option.is_active,
    sortOrder: option.sort_order,
  } : { code: '', label: '', amountMinor: '', isActive: false, sortOrder: 0 };
}

function feeDraft(product?: FeeProduct): FeeDraft {
  return product ? {
    id: product.id,
    code: product.code,
    version: product.version,
    name: product.name,
    description: product.description ?? '',
    productKind: product.product_kind,
    amountMinor: String(product.amount_minor),
    durationDays: product.duration_days ?? 1,
    placementCode: product.placement_code ?? '',
    sponsoredLabel: product.sponsored_label ?? '',
    termsVersion: product.terms_version,
    isActive: product.is_active,
    isDefault: product.is_default,
    validFrom: product.valid_from ? product.valid_from.slice(0, 16) : '',
    validUntil: product.valid_until ? product.valid_until.slice(0, 16) : '',
  } : {
    code: '', version: 1, name: '', description: '', productKind: 'listing_basic', amountMinor: '',
    durationDays: 30, placementCode: '', sponsoredLabel: '', termsVersion: 'v1', isActive: false,
    isDefault: false, validFrom: '', validUntil: '',
  };
}

function formatMoney(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const detail = error as { code?: unknown; message?: unknown; hint?: unknown; details?: unknown };
    const message = [detail.message, detail.details, detail.hint, detail.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' — ');
    if (message) return message;
  }
  return error instanceof Error ? error.message : 'Không lưu được cấu hình.';
}

function isPositiveInteger(value: string | number | null | undefined): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function validateConfig(config: Config): string | null {
  if (!config.custom_amount_enabled) return null;
  if (!isPositiveInteger(config.custom_min_minor)) return 'Số tiền tối thiểu phải là số nguyên dương.';
  if (!isPositiveInteger(config.custom_max_minor)) return 'Số tiền tối đa phải là số nguyên dương.';
  if (!isPositiveInteger(config.custom_step_minor)) return 'Bước nạp phải là số nguyên dương.';
  if (Number(config.custom_max_minor) < Number(config.custom_min_minor)) return 'Số tiền tối đa phải lớn hơn hoặc bằng tối thiểu.';
  return null;
}

function validateOptionDraft(draft: OptionDraft): string | null {
  if (!draft.code.trim()) return 'Code là bắt buộc.';
  if (!draft.label.trim()) return 'Nhãn mệnh giá là bắt buộc.';
  if (!isPositiveInteger(draft.amountMinor)) return 'Số tiền phải là số nguyên dương.';
  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0) return 'Thứ tự phải là số nguyên từ 0 trở lên.';
  return null;
}

function validateFeeDraft(draft: FeeDraft): string | null {
  if (!draft.code.trim()) return 'Code là bắt buộc.';
  if (!Number.isInteger(draft.version) || draft.version < 1) return 'Version phải là số nguyên từ 1 trở lên.';
  if (!draft.name.trim()) return 'Tên biểu phí là bắt buộc.';
  if (!isPositiveInteger(draft.amountMinor)) return 'Số tiền phải là số nguyên dương.';
  if (!isPositiveInteger(draft.durationDays)) return 'Thời hạn phải là số nguyên dương.';
  if (!draft.termsVersion.trim()) return 'Terms version là bắt buộc.';
  if (draft.validFrom && Number.isNaN(new Date(draft.validFrom).getTime())) return 'Thời điểm bắt đầu không hợp lệ.';
  if (draft.validUntil && Number.isNaN(new Date(draft.validUntil).getTime())) return 'Thời điểm kết thúc không hợp lệ.';
  if (draft.validFrom && draft.validUntil && new Date(draft.validUntil) < new Date(draft.validFrom)) return 'Thời điểm kết thúc phải sau thời điểm bắt đầu.';
  if (draft.productKind === 'sponsored_addon' && !draft.placementCode.trim()) return 'Placement code là bắt buộc cho gói tài trợ.';
  if (draft.productKind === 'sponsored_addon' && !draft.sponsoredLabel.trim()) return 'Nhãn tài trợ là bắt buộc cho gói tài trợ.';
  return null;
}

function queryErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Không xác định được lỗi từ Wallet RPC.';
  const detail = error as { code?: unknown; message?: unknown; hint?: unknown };
  return [detail.code, detail.message, detail.hint]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' — ') || 'Không xác định được lỗi từ Wallet RPC.';
}

function SectionTitle({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-gray-100 px-5 py-4"><div><h2 className="font-bold text-gray-900">{title}</h2><p className="text-xs text-gray-500 mt-1">{description}</p></div>{action}</div>;
}

export function CommerceWalletTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [configDraft, setConfigDraft] = useState<Config>(emptyConfig);
  const [optionEditor, setOptionEditor] = useState<OptionDraft | null>(null);
  const [feeEditor, setFeeEditor] = useState<FeeDraft | null>(null);

  const query = useQuery({
    queryKey: ['commerceWalletAdminConfiguration'],
    queryFn: getCommerceWalletAdminConfiguration,
  });

  useEffect(() => {
    if (query.data?.config) setConfigDraft(query.data.config);
  }, [query.data?.config]);

  const refresh = () => {
    setError('');
    setNotice('');
    void query.refetch();
  };

  const configMutation = useMutation({
    mutationFn: () => updateCommerceWalletTopupConfig({
      isActive: false,
      customAmountEnabled: configDraft.custom_amount_enabled,
      customMinMinor: configDraft.custom_amount_enabled ? String(configDraft.custom_min_minor ?? '') || null : null,
      customMaxMinor: configDraft.custom_amount_enabled ? String(configDraft.custom_max_minor ?? '') || null : null,
      customStepMinor: configDraft.custom_amount_enabled ? String(configDraft.custom_step_minor ?? '') || null : null,
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['commerceWalletAdminConfiguration'] }); setNotice('Đã lưu cấu hình nạp tiền. Nạp tiền vẫn đang khóa.'); },
    onError: error => setError(errorMessage(error)),
  });

  const optionMutation = useMutation({
    mutationFn: (draft: OptionDraft) => saveCommerceWalletTopupOption(draft),
    onSuccess: async () => { setOptionEditor(null); await queryClient.invalidateQueries({ queryKey: ['commerceWalletAdminConfiguration'] }); setNotice('Đã lưu mệnh giá nạp.'); },
    onError: error => setError(errorMessage(error)),
  });

  const feeMutation = useMutation({
    mutationFn: (draft: FeeDraft) => saveCommerceFeeProduct({
      id: draft.id,
      code: draft.code,
      version: draft.version,
      name: draft.name,
      description: draft.description || null,
      productKind: draft.productKind,
      amountMinor: draft.amountMinor,
      durationDays: draft.durationDays,
      placementCode: draft.placementCode || null,
      sponsoredLabel: draft.sponsoredLabel || null,
      termsVersion: draft.termsVersion,
      isActive: draft.isActive,
      isDefault: draft.isDefault,
      validFrom: toIso(draft.validFrom),
      validUntil: toIso(draft.validUntil),
    }),
    onSuccess: async () => { setFeeEditor(null); await queryClient.invalidateQueries({ queryKey: ['commerceWalletAdminConfiguration'] }); setNotice('Đã lưu biểu phí.'); },
    onError: error => setError(errorMessage(error)),
  });

  const saveOption = () => {
    if (!optionEditor) return;
    const validationError = validateOptionDraft(optionEditor);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(''); setNotice(''); optionMutation.mutate(optionEditor);
  };

  const saveFee = () => {
    if (!feeEditor) return;
    const validationError = validateFeeDraft(feeEditor);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(''); setNotice(''); feeMutation.mutate(feeEditor);
  };

  if (query.isLoading) return <div className="py-12 text-center text-gray-500">Đang tải cấu hình ví...</div>;
  if (query.isError || !query.data) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>Không tải được cấu hình Wallet.</p><p className="mt-1 text-xs">{query.isError ? queryErrorMessage(query.error) : 'RPC không trả về dữ liệu cấu hình.'}</p><button onClick={refresh} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">Thử lại</button></div>;

  const config = configDraft;
  const options = query.data.topupOptions;
  const products = query.data.feeProducts;
  const savedConfig = query.data.config;
  const configDirty = !savedConfig || [
    'custom_amount_enabled', 'custom_min_minor', 'custom_max_minor', 'custom_step_minor',
  ].some(key => config[key as keyof Config] !== savedConfig[key as keyof Config]);
  const configValidationError = validateConfig(config);
  const saveConfig = () => {
    if (configValidationError) {
      setError(configValidationError);
      return;
    }
    setError('');
    setNotice('');
    configMutation.mutate();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3"><WalletCards className="w-6 h-6 text-red-600 mt-0.5" /><div><h2 className="font-black text-xl text-gray-900">Ví & thanh toán</h2><p className="text-sm text-gray-500 mt-1">Quản lý cấu hình server-side cho Wallet prepaid VND.</p></div></div>
        <button onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><RefreshCw className="w-4 h-4" />Làm mới</button>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"><p className="font-bold">Cổng an toàn</p><p className="text-xs mt-1">Màn hình này chỉ cấu hình catalog và biểu phí. Không chỉnh số dư, không tạo credit, không gọi PayOS. Nạp tiền vẫn bị khóa cho tới khi mở rollout riêng.</p></div>
      {error && !optionEditor && !feeEditor && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5" />{notice}</div>}

      <section className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <SectionTitle title="Cấu hình nạp tiền" description="Bật custom amount và giới hạn giá trị; công tắc nạp tiền bị khóa trong rollout hiện tại." action={canEdit && <button onClick={saveConfig} disabled={configMutation.isPending || !configDirty || Boolean(configValidationError)} title={!configDirty ? 'Chưa có thay đổi để lưu' : configValidationError ?? undefined} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="w-4 h-4" />{configMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}</button>} />
        <div className="grid md:grid-cols-2 gap-4 p-5">
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={false} disabled className="h-4 w-4 accent-red-600" />Mở nạp tiền <span className="text-xs text-gray-400">(đang khóa)</span></label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={config.custom_amount_enabled} disabled={!canEdit || configMutation.isPending} onChange={e => setConfigDraft(current => ({ ...current, custom_amount_enabled: e.target.checked }))} className="h-4 w-4 accent-red-600" />Cho phép nhập số tiền tùy chỉnh</label>
          <label className="text-xs text-gray-600">Tối thiểu (VND)<input type="number" min="1" value={config.custom_min_minor ?? ''} disabled={!canEdit || !config.custom_amount_enabled || configMutation.isPending} onChange={e => setConfigDraft(current => ({ ...current, custom_min_minor: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
          <label className="text-xs text-gray-600">Tối đa (VND)<input type="number" min="1" value={config.custom_max_minor ?? ''} disabled={!canEdit || !config.custom_amount_enabled || configMutation.isPending} onChange={e => setConfigDraft(current => ({ ...current, custom_max_minor: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
          <label className="text-xs text-gray-600">Bước (VND)<input type="number" min="1" value={config.custom_step_minor ?? ''} disabled={!canEdit || !config.custom_amount_enabled || configMutation.isPending} onChange={e => setConfigDraft(current => ({ ...current, custom_step_minor: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        </div>
        {configValidationError && <p className="px-5 pb-5 text-xs font-semibold text-red-600">{configValidationError}</p>}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <SectionTitle title="Mệnh giá nạp" description="Giá trị được lưu bằng VND nguyên đơn vị; tắt mệnh giá sẽ ẩn khỏi catalog public." action={canEdit && <button onClick={() => { setError(''); setNotice(''); setOptionEditor(optionDraft()); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"><Plus className="w-4 h-4" />Thêm mệnh giá</button>} />
        {options.length === 0 ? <p className="p-6 text-sm text-gray-500">Chưa có mệnh giá. Chỉ thêm khi đã chốt giá kinh doanh.</p> : <div className="divide-y divide-gray-100">{options.map(option => <div key={option.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4"><div><p className="font-bold text-gray-900">{option.label}</p><p className="text-xs text-gray-500 mt-1">{option.code} · {formatMoney(option.amount_minor)} · thứ tự {option.sort_order}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${option.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{option.is_active ? 'Active catalog' : 'Đang ẩn'}</span>{canEdit && <button onClick={() => setOptionEditor(optionDraft(option))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">Sửa</button>}</div></div>)}</div>}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <SectionTitle title="Biểu phí dịch vụ" description="Fee product cũ giữ nguyên identity, amount và terms; muốn đổi giá hãy tạo version mới." action={canEdit && <button onClick={() => { setError(''); setNotice(''); setFeeEditor(feeDraft()); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"><Plus className="w-4 h-4" />Thêm biểu phí</button>} />
        {products.length === 0 ? <p className="p-6 text-sm text-gray-500">Chưa có biểu phí. Chỉ thêm khi đã chốt giá kinh doanh.</p> : <div className="divide-y divide-gray-100">{products.map(product => <div key={product.id} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-5 py-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-gray-900">{product.name}</p><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{product.product_kind} v{product.version}</span>{product.is_default && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Mặc định</span>}</div><p className="text-xs text-gray-500 mt-1">{formatMoney(product.amount_minor)} · {product.duration_days} ngày · terms {product.terms_version}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${product.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{product.is_active ? 'Active' : 'Đang ẩn'}</span>{canEdit && <button onClick={() => setFeeEditor(feeDraft(product))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">Sửa</button>}</div></div>)}</div>}
      </section>

      {!canEdit && <div className="rounded-xl bg-gray-100 px-4 py-3 text-xs font-semibold text-gray-600">Tài khoản này chỉ có quyền xem. Cần quyền `commerce-wallet / edit` để lưu cấu hình.</div>}

      {optionEditor && <OptionEditor draft={optionEditor} saving={optionMutation.isPending} serverError={error} onChange={draft => { setError(''); setOptionEditor(draft); }} onCancel={() => { setError(''); setOptionEditor(null); }} onSave={saveOption} />}
      {feeEditor && <FeeEditor draft={feeEditor} saving={feeMutation.isPending} serverError={error} onChange={draft => { setError(''); setFeeEditor(draft); }} onCancel={() => { setError(''); setFeeEditor(null); }} onSave={saveFee} />}
    </div>
  );
}

function OptionEditor({ draft, saving, serverError, onChange, onCancel, onSave }: { draft: OptionDraft; saving: boolean; serverError: string; onChange: (draft: OptionDraft) => void; onCancel: () => void; onSave: () => void }) {
  const validationError = validateOptionDraft(draft);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="wallet-option-editor-title">
    <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
      <h3 id="wallet-option-editor-title" className="font-bold text-gray-900">{draft.id ? 'Sửa mệnh giá nạp' : 'Thêm mệnh giá nạp'}</h3>
      <p className="mt-1 text-xs text-gray-500">Các trường có dấu * là bắt buộc. Dữ liệu chỉ được gửi sau khi kiểm tra hợp lệ.</p>
      <div className="mt-4 grid gap-3">
        <label className="text-xs text-gray-600">Code *<input required value={draft.code} disabled={Boolean(draft.id) || saving} onChange={e => onChange({ ...draft, code: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Nhãn *<input required value={draft.label} disabled={saving} onChange={e => onChange({ ...draft, label: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Số tiền (VND) *<input required type="number" min="1" step="1" inputMode="numeric" value={draft.amountMinor} disabled={saving} onChange={e => onChange({ ...draft, amountMinor: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Thứ tự<input type="number" min="0" step="1" inputMode="numeric" value={draft.sortOrder} disabled={saving} onChange={e => onChange({ ...draft, sortOrder: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.isActive} disabled={saving} onChange={e => onChange({ ...draft, isActive: e.target.checked })} className="h-4 w-4 accent-red-600" />Hiển thị trong catalog public</label>
      </div>
      {(validationError || serverError) && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{validationError || serverError}</div>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={onCancel} disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold">Hủy</button><button onClick={onSave} disabled={saving || Boolean(validationError)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu'}</button></div>
    </div>
  </div>;
}

function FeeEditor({ draft, saving, serverError, onChange, onCancel, onSave }: { draft: FeeDraft; saving: boolean; serverError: string; onChange: (draft: FeeDraft) => void; onCancel: () => void; onSave: () => void }) {
  const existing = Boolean(draft.id);
  const validationError = validateFeeDraft(draft);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="wallet-fee-editor-title">
    <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
      <h3 id="wallet-fee-editor-title" className="font-bold text-gray-900">{existing ? 'Sửa biểu phí' : 'Thêm biểu phí'}</h3>
      <p className="mt-1 text-xs text-gray-500">Identity, amount và terms của bản ghi cũ không được sửa; tạo version mới nếu cần đổi giá. Các trường có dấu * là bắt buộc.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-gray-600">Code *<input required value={draft.code} disabled={existing || saving} onChange={e => onChange({ ...draft, code: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Version *<input required type="number" min="1" step="1" inputMode="numeric" value={draft.version} disabled={existing || saving} onChange={e => onChange({ ...draft, version: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Tên *<input required value={draft.name} disabled={saving} onChange={e => onChange({ ...draft, name: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Loại<select value={draft.productKind} disabled={existing || saving} onChange={e => onChange({ ...draft, productKind: e.target.value as FeeDraft['productKind'] })} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><option value="listing_basic">listing_basic</option><option value="sponsored_addon">sponsored_addon</option></select></label>
        <label className="text-xs text-gray-600">Số tiền (VND) *<input required type="number" min="1" step="1" inputMode="numeric" value={draft.amountMinor} disabled={existing || saving} onChange={e => onChange({ ...draft, amountMinor: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Thời hạn (ngày) *<input required type="number" min="1" step="1" inputMode="numeric" value={draft.durationDays} disabled={saving} onChange={e => onChange({ ...draft, durationDays: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600 md:col-span-2">Mô tả<textarea value={draft.description} disabled={saving} onChange={e => onChange({ ...draft, description: e.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        {draft.productKind === 'sponsored_addon' && <><label className="text-xs text-gray-600">Placement code *<input required value={draft.placementCode} disabled={saving} onChange={e => onChange({ ...draft, placementCode: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label><label className="text-xs text-gray-600">Nhãn tài trợ *<input required value={draft.sponsoredLabel} disabled={saving} onChange={e => onChange({ ...draft, sponsoredLabel: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label></>}
        <label className="text-xs text-gray-600">Terms version *<input required value={draft.termsVersion} disabled={existing || saving} onChange={e => onChange({ ...draft, termsVersion: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Có hiệu lực từ<input type="datetime-local" value={draft.validFrom} disabled={saving} onChange={e => onChange({ ...draft, validFrom: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Có hiệu lực đến<input type="datetime-local" value={draft.validUntil} disabled={saving} onChange={e => onChange({ ...draft, validUntil: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.isActive} disabled={saving} onChange={e => onChange({ ...draft, isActive: e.target.checked })} className="h-4 w-4 accent-red-600" />Active catalog</label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.isDefault} disabled={saving || draft.productKind !== 'listing_basic'} onChange={e => onChange({ ...draft, isDefault: e.target.checked })} className="h-4 w-4 accent-red-600" />Mặc định listing_basic</label>
      </div>
      {(validationError || serverError) && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{validationError || serverError}</div>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={onCancel} disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold">Hủy</button><button onClick={onSave} disabled={saving || Boolean(validationError)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu'}</button></div>
    </div>
  </div>;
}
