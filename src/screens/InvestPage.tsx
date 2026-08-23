'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { TrendingUp, Calculator, CheckCircle, ArrowRight, Building2 } from 'lucide-react';
import { type Page, scrollTop } from '../lib/router';
import { Breadcrumb, SectionTitle } from '../components/Layout';
import { submitLead, getPageBlocks, pageBlocksToMap } from '../lib/api';
import { track, EVENTS } from '../lib/analytics';
import { qk } from '../lib/queryKeys';
import { useSetting } from '../lib/cms';
import { isValidVnPhone } from '../lib/phone';
import { getCollectionDefinition, parseContentCollection } from '../lib/pageContentSchema';

/* ─────────────────── Interactive calculator ─────────────────── */

/* ─────────────────── ROI Calculator ─────────────────── */
type RoiCalculatorLabels = {
  heading: string;
  subtitle: string;
  capital: string;
  capitalUnit: string;
  yieldRate: string;
  years: string;
  action: string;
  resultHeading: string;
  initialCapital: string;
  projectedValue: string;
  profit: string;
  totalReturn: string;
  disclaimer: string;
};

function RoiCalculator({ onNavigate, labels }: { onNavigate: (p: Page) => void; labels: RoiCalculatorLabels }) {
  const [capital, setCapital] = useState<number>(2);
  const [yieldRate, setYieldRate] = useState<number>(20);
  const [years, setYears] = useState<number>(3);

  const projectedValue = capital * Math.pow(1 + yieldRate / 100, years);
  const profit = projectedValue - capital;
  const totalReturn = ((projectedValue - capital) / capital) * 100;

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="grid md:grid-cols-2">
        {/* Inputs */}
        <div className="p-6 md:p-8 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-red-500" /> {labels.heading}
            </h3>
            <p className="text-sm text-gray-500">{labels.subtitle}</p>
          </div>

          {/* Capital */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              {labels.capital}
            </label>
            <div className="relative">
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={capital}
                onChange={(e) => setCapital(Math.max(0.1, Number(e.target.value)))}
                className="w-full px-4 py-3 pr-16 border border-gray-200 rounded-xl text-gray-800 font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">{labels.capitalUnit}</span>
            </div>
          </div>

          {/* Yield rate */}
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-semibold text-gray-700">{labels.yieldRate}</label>
              <span className="text-red-600 font-bold">{yieldRate}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={50}
              value={yieldRate}
              onChange={(e) => setYieldRate(Number(e.target.value))}
              className="w-full accent-red-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>5% (thấp)</span>
              <span>27% (TB)</span>
              <span>50% (cao)</span>
            </div>
          </div>

          {/* Years */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{labels.years}</label>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 5, 7, 10].map((y) => (
                <button
                  key={y}
                  onClick={() => setYears(y)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    years === y
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                  }`}
                >
                  {y} năm
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => { onNavigate({ name: 'listings' }); scrollTop(); }}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            {labels.action} <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="bg-gradient-to-br from-red-600 to-red-800 p-6 md:p-8 text-white flex flex-col justify-center">
          <h4 className="text-sm font-semibold text-red-200 uppercase tracking-wide mb-6">{labels.resultHeading}</h4>

          <div className="space-y-5">
            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-red-200 text-xs mb-1">{labels.initialCapital}</p>
              <p className="text-2xl font-bold">{capital.toFixed(1)} tỷ đồng</p>
            </div>

            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-red-200 text-xs mb-1">{labels.projectedValue} {years} {labels.years}</p>
              <p className="text-3xl font-bold text-yellow-300">{projectedValue.toFixed(2)} tỷ đồng</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-red-200 text-xs mb-1">{labels.profit}</p>
                <p className="text-xl font-bold text-green-300">+{profit.toFixed(2)} tỷ</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-red-200 text-xs mb-1">{labels.totalReturn}</p>
                <p className="text-xl font-bold text-green-300">+{totalReturn.toFixed(0)}%</p>
              </div>
            </div>
          </div>

          {labels.disclaimer && <p className="text-red-300 text-xs mt-6">{labels.disclaimer}</p>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── ConsultationForm ─────────────────── */
function ConsultationForm() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submitMutation = useMutation({
    mutationFn: () => submitLead({ full_name: name, phone, message: notes, area_interest: 'Tư vấn đầu tư', source: 'invest_page' }),
    onSuccess: () => {
      setError(''); setSent(true);
      track(EVENTS.LEAD_SUBMIT, { source: 'invest_page', hasMessage: Boolean(notes.trim()) });
    },
    onError: () => setError('Có lỗi xảy ra, vui lòng thử lại sau.'),
  });
  const loading = submitMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Vui lòng điền đầy đủ họ tên và số điện thoại.');
      return;
    }
    if (!isValidVnPhone(phone)) {
      setError('Số điện thoại chưa hợp lệ. Vui lòng nhập số di động Việt Nam (VD: 0901234567).');
      return;
    }
    setError('');
    submitMutation.mutate();
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <CheckCircle className="w-12 h-12 text-green-400 mb-3" />
        <h3 className="text-xl font-bold text-white mb-1">Đăng ký thành công!</h3>
        <p className="text-red-100 text-sm">Chuyên gia sẽ liên hệ với bạn trong vòng 30 phút.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-red-100 mb-1">Họ và tên *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nguyễn Văn A"
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-red-100 mb-1">Số điện thoại *</label>
        <input
          type="tel"
          inputMode="tel"
          pattern="(\+?84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}"
          title="Nhập số di động Việt Nam, ví dụ 0901234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0909 123 456"
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-red-100 mb-1">Ghi chú</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Ngân sách, khu vực quan tâm..."
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm resize-none"
        />
      </div>
      {error && <p className="text-yellow-300 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-white text-red-600 rounded-xl font-bold text-sm hover:bg-red-50 transition-colors disabled:opacity-60"
      >
        {loading ? 'Đang gửi...' : 'Đăng ký tư vấn miễn phí'}
      </button>
    </form>
  );
}

/* ─────────────────── InvestPage ─────────────────── */
export function InvestPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const phone = useSetting('phone_hotline', '');
  const { data: cms = {} } = useQuery({
    queryKey: qk.pageBlocks('invest'),
    queryFn: () => getPageBlocks('invest'),
    select: pageBlocksToMap,
  });
  const g = (section: string, key: string) => cms[section]?.[key]?.trim() || '';
  const collection = (section: string, key: string) => parseContentCollection(cms[section]?.[key], getCollectionDefinition('invest', section, key));
  const calculatorItem = collection('calculator', 'labels')[0] ?? {};
  const calculatorLabels: RoiCalculatorLabels = {
    heading: String(calculatorItem.heading ?? ''), subtitle: String(calculatorItem.subtitle ?? ''),
    capital: String(calculatorItem.capital ?? ''), capitalUnit: String(calculatorItem.capital_unit ?? ''),
    yieldRate: String(calculatorItem.yield_rate ?? ''), years: String(calculatorItem.years ?? ''),
    action: String(calculatorItem.action ?? ''), resultHeading: String(calculatorItem.result_heading ?? ''),
    initialCapital: String(calculatorItem.initial_capital ?? ''), projectedValue: String(calculatorItem.projected_value ?? ''),
    profit: String(calculatorItem.profit ?? ''), totalReturn: String(calculatorItem.total_return ?? ''),
    disclaimer: String(calculatorItem.disclaimer ?? ''),
  };
  const opportunities = collection('opportunities', 'items').map(item => ({
    title: String(item.title ?? ''), location: String(item.location ?? ''), tag: String(item.tag ?? ''),
    description: String(item.description ?? ''), features: Array.isArray(item.features) ? item.features : [],
    returnLabel: String(item.return_label ?? ''), minimumCapital: String(item.minimum_capital ?? ''),
  }));
  const processSteps = collection('process', 'items').map(item => ({ number: String(item.number ?? ''), title: String(item.title ?? ''), description: String(item.description ?? '') }));
  const benefits = collection('benefits', 'items').map(item => ({ title: String(item.title ?? ''), description: String(item.description ?? '') }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative h-64 md:h-96 flex items-center"
        style={{
          backgroundImage:
            `url('${g('hero','image')}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900/85 to-gray-700/50" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 w-full">
          <Breadcrumb
            items={[
              { label: 'Trang chủ', onClick: () => { onNavigate({ name: 'home' }); scrollTop(); } },
              { label: 'Đầu tư' },
            ]}
          />
          <div className="mt-3 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-600/80 text-white px-3 py-1 rounded-full mb-3">
              <TrendingUp className="w-3.5 h-3.5" /> {g('hero','badge')}
            </span>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3 leading-tight">
              {g('hero','title')}
            </h1>
            <p className="text-gray-200 text-base md:text-lg">
              {g('hero','subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* ROI Calculator */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-8">
          <SectionTitle
            title={g('calculator','title')}
            subtitle={g('calculator','subtitle')}
          />
        </div>
        {Object.values(calculatorLabels).some(Boolean) && <RoiCalculator onNavigate={onNavigate} labels={calculatorLabels} />}
      </div>

      {/* Opportunities */}
      <div className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8">
            <SectionTitle
              title={g('opportunities','title')}
              subtitle={g('opportunities','subtitle')}
            />
          </div>
          {opportunities.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {opportunities.map((op) => (
              <div key={op.title} className="bg-gray-50 rounded-2xl p-5 border border-gray-100 hover:shadow-lg hover:border-red-100 transition-all duration-300 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center"><Building2 className="w-6 h-6" /></div>
                  {op.tag && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">{op.tag}</span>}
                </div>
                <h3 className="font-bold text-gray-800 text-base mb-1">{op.title}</h3>
                {op.location && <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" /> {op.location}</p>}
                <p className="text-gray-500 text-sm mb-3 leading-relaxed flex-1">{op.description}</p>
                {op.features.length > 0 && <div className="space-y-1 mb-4">{op.features.map(feature => <div key={feature} className="flex items-center gap-1.5 text-xs text-gray-600"><CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> {feature}</div>)}</div>}
                {(op.returnLabel || op.minimumCapital) && <div className="flex justify-between text-sm border-t border-gray-200 pt-3 mt-auto">
                  {op.returnLabel && <div><p className="text-gray-400 text-xs">Thông tin tham khảo</p><p className="text-green-600 font-bold">{op.returnLabel}</p></div>}
                  {op.minimumCapital && <div className="text-right"><p className="text-gray-400 text-xs">Vốn tham khảo</p><p className="text-gray-800 font-bold">{op.minimumCapital}</p></div>}
                </div>}
              </div>
            ))}
          </div>}
        </div>
      </div>

      {/* Process */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-8">
          <SectionTitle
            title={g('process','title')}
            subtitle={g('process','subtitle')}
          />
        </div>

        {/* Desktop: horizontal with lines */}
        <div className="hidden md:flex items-start gap-0">
          {processSteps.map((step, index) => (
            <div key={step.number} className="flex-1 flex flex-col items-center text-center relative">
              {/* Connector line */}
              {index < processSteps.length - 1 && (
                <div className="absolute top-6 left-1/2 w-full h-0.5 bg-gradient-to-r from-red-300 to-red-100 z-0" />
              )}
              {/* Circle */}
              <div className="relative z-10 w-12 h-12 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-base shadow-lg mb-4">
                {step.number}
              </div>
              <h4 className="font-bold text-gray-800 text-sm mb-1 px-2">{step.title}</h4>
              <p className="text-gray-500 text-xs px-3 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>

        {/* Mobile: vertical */}
        <div className="md:hidden space-y-4">
          {processSteps.map((step, index) => (
            <div key={step.number} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                  {step.number}
                </div>
                {index < processSteps.length - 1 && <div className="w-0.5 flex-1 bg-red-200 my-1 min-h-4" />}
              </div>
              <div className="pb-4">
                <h4 className="font-bold text-gray-800 text-sm mb-1">{step.title}</h4>
                <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Split Section */}
      <div className="bg-gray-900 py-14">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-2 gap-8">
          {/* Left — Consultation Form */}
          <div className="bg-gradient-to-br from-red-700 to-red-900 rounded-2xl p-6 md:p-8">
            {g('cta','title') && <h3 className="text-xl font-bold text-white mb-1">{g('cta','title')}</h3>}
            {g('cta','subtitle') && <p className="text-red-200 text-sm mb-6">{g('cta','subtitle')}</p>}
            <ConsultationForm />
          </div>

          {/* Right — Benefits */}
          <div className="flex flex-col justify-center gap-5">
            {g('cta','why_title') && <h3 className="text-xl font-bold text-white mb-2">{g('cta','why_title')}</h3>}
            {benefits.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="bg-gray-800 rounded-xl p-4 flex gap-3">
                  <div className="w-9 h-9 bg-red-600/20 text-red-400 rounded-lg flex items-center justify-center shrink-0"><CheckCircle className="w-5 h-5" /></div>
                  <div>
                    <p className="text-white font-semibold text-sm leading-snug">{benefit.title}</p>
                    <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>}

            {phone && <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2 font-semibold">{g('cta', 'hotline_label')}</p>
              <a href={`tel:${phone.replace(/\s/g, '')}`} className="text-2xl font-bold text-white hover:text-red-400 transition-colors">
                {phone}
              </a>
              {g('cta', 'hotline_note') && <p className="text-gray-500 text-xs mt-1">{g('cta', 'hotline_note')}</p>}
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}