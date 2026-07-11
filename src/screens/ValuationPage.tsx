'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Calculator, TrendingUp, Info, Phone, CheckCircle } from 'lucide-react';
import { getComps } from '../lib/api/properties';
import { submitLead } from '../lib/api';
import { estimateValuation, type Valuation } from '../lib/valuation';
import { useAreas, usePropertyTypes } from '../lib/hooks/useTaxonomy';
import { Breadcrumb } from '../components/Layout';
import { type Page } from '../lib/router';

// Định giá tham khảo: ước tính khoảng giá theo trung vị giá/m² của BĐS tương đương.
// KHÔNG phải thẩm định chính thức — kết quả kèm CTA liên hệ để chuyển thành lead.
export function ValuationPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();

  const [areaId, setAreaId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [listingType, setListingType] = useState<'mua_ban' | 'cho_thue'>('mua_ban');
  const [areaSqm, setAreaSqm] = useState('');
  const [result, setResult] = useState<Valuation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form thu lead ngay tại trang định giá — nối funnel ước tính → liên hệ.
  const [showLead, setShowLead] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadErr, setLeadErr] = useState('');

  const fmtTrieu = (trieu: number) =>
    trieu >= 1000 ? `${(trieu / 1000).toFixed(2)} tỷ` : `${Math.round(trieu)} triệu`;

  const areaName = areas.find(a => a.id === areaId)?.name ?? '';

  const leadMutation = useMutation({
    mutationFn: () => submitLead({
      full_name: leadName,
      phone: leadPhone,
      area_interest: areaName || undefined,
      budget: result ? `${fmtTrieu(result.lowTrieu)} – ${fmtTrieu(result.highTrieu)}` : undefined,
      message: result
        ? `Yêu cầu định giá: ${areaName}${areaSqm ? `, ${areaSqm}m²` : ''}. Ước tính ${fmtTrieu(result.midTrieu)}.`
        : undefined,
      source: 'valuation_page',
    }),
    onSuccess: () => setLeadErr(''),
    onError: () => setLeadErr('Có lỗi khi gửi, vui lòng thử lại.'),
  });

  function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadName.trim() || !leadPhone.trim()) {
      setLeadErr('Vui lòng điền họ tên và số điện thoại.');
      return;
    }
    setLeadErr('');
    leadMutation.mutate();
  }

  async function handleEstimate() {
    setError('');
    setResult(null);
    setShowLead(false);
    setLeadErr('');
    leadMutation.reset();
    const sqm = parseFloat(areaSqm);
    if (!sqm || sqm <= 0) { setError('Vui lòng nhập diện tích hợp lệ (m²).'); return; }
    if (!areaId) { setError('Vui lòng chọn khu vực.'); return; }

    setLoading(true);
    try {
      const comps = await getComps({ areaId, typeId: typeId || undefined, listingType });
      const val = estimateValuation(comps, sqm);
      if (!val) {
        setError('Chưa đủ dữ liệu BĐS tương đương trong khu vực để ước tính. Vui lòng liên hệ để được định giá trực tiếp.');
      } else {
        setResult(val);
      }
    } catch {
      setError('Có lỗi khi tính toán. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Breadcrumb items={[{ label: 'Trang chủ', onClick: () => onNavigate({ name: 'home' }) }, { label: 'Định giá BĐS' }]} />

      <div className="flex items-center gap-3 mb-2 mt-4">
        <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
          <Calculator className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-2xl font-black text-gray-900">Định giá bất động sản</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Ước tính nhanh khoảng giá dựa trên dữ liệu BĐS tương đương đang giao dịch trong khu vực.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setListingType('mua_ban')}
            className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${listingType === 'mua_ban' ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600 hover:border-red-400'}`}>
            Mua bán
          </button>
          <button onClick={() => setListingType('cho_thue')}
            className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${listingType === 'cho_thue' ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600 hover:border-red-400'}`}>
            Cho thuê
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Khu vực *</label>
          <select value={areaId} onChange={e => setAreaId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-red-400 outline-none">
            <option value="">-- Chọn khu vực --</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Loại BĐS</label>
          <select value={typeId} onChange={e => setTypeId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-red-400 outline-none">
            <option value="">-- Tất cả loại --</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Diện tích (m²) *</label>
          <input type="number" value={areaSqm} onChange={e => setAreaSqm(e.target.value)}
            placeholder="VD: 90" min="1"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-red-400 outline-none" />
        </div>

        <button onClick={handleEstimate} disabled={loading}
          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
          <TrendingUp className="w-4 h-4" />{loading ? 'Đang tính...' : 'Ước tính giá'}
        </button>

        {error && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {result && (
        <div className="mt-5 bg-gradient-to-br from-red-50 to-white rounded-2xl border border-red-100 p-5">
          <p className="text-xs text-gray-500 mb-1">Khoảng giá ước tính{listingType === 'cho_thue' ? ' (thuê)' : ''}</p>
          <p className="text-3xl font-black text-red-600 mb-1">{fmtTrieu(result.midTrieu)}</p>
          <p className="text-sm text-gray-600 mb-3">
            Dao động: <b>{fmtTrieu(result.lowTrieu)}</b> – <b>{fmtTrieu(result.highTrieu)}</b>
          </p>
          <div className="flex items-start gap-1.5 text-xs text-gray-500 mb-4">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Dựa trên {result.sampleSize} BĐS tương đương (trung vị {result.pricePerSqmMedian.toFixed(1)} triệu/m²).
              Đây là ước tính tham khảo, không thay thế thẩm định chính thức.
            </span>
          </div>
          {leadMutation.isSuccess ? (
            <div className="flex flex-col items-center text-center py-3">
              <CheckCircle className="w-10 h-10 text-green-500 mb-2" />
              <p className="font-bold text-gray-900">Đã gửi yêu cầu!</p>
              <p className="text-sm text-gray-500">Chuyên viên sẽ liên hệ để định giá chính xác trong thời gian sớm nhất.</p>
            </div>
          ) : !showLead ? (
            <button onClick={() => setShowLead(true)}
              className="w-full border border-red-400 text-red-600 font-semibold py-2 rounded-xl text-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
              <Phone className="w-4 h-4" />Liên hệ định giá chính xác
            </button>
          ) : (
            <form onSubmit={handleLeadSubmit} className="space-y-3 border-t border-red-100 pt-4">
              <p className="text-sm font-semibold text-gray-700">Để lại thông tin, chuyên viên sẽ định giá chính xác cho bạn:</p>
              <input type="text" value={leadName} onChange={e => setLeadName(e.target.value)}
                placeholder="Họ và tên *"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-red-400 outline-none" />
              <input type="tel" value={leadPhone} onChange={e => setLeadPhone(e.target.value)}
                placeholder="Số điện thoại *"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-red-400 outline-none" />
              {leadErr && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{leadErr}</p>}
              <button type="submit" disabled={leadMutation.isPending}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                <Phone className="w-4 h-4" />{leadMutation.isPending ? 'Đang gửi...' : 'Gửi yêu cầu định giá'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
