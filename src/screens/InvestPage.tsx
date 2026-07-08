'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { TrendingUp, Calculator, Shield, BarChart3, CheckCircle, ArrowRight, Building2, Target, Users } from 'lucide-react';
import { type Page, scrollTop } from '../lib/router';
import { Breadcrumb, SectionTitle } from '../components/Layout';
import { submitLead, getPageBlocks, pageBlocksToMap } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { useSetting } from '../lib/cms';

/* ─────────────────── Static data ─────────────────── */

const OPPORTUNITIES = [
  {
    icon: <Building2 className="w-6 h-6" />,
    title: 'Đất nền KDC',
    location: 'Bình Dương, Long An',
    yield: '15–20%',
    minCapital: '1,5 tỷ',
    tag: 'Phổ biến',
    tagColor: 'bg-green-100 text-green-700',
    description: 'Đất nền khu dân cư có sổ đỏ riêng, pháp lý minh bạch, hạ tầng đồng bộ.',
    features: ['Sổ đỏ riêng từng lô', 'Hạ tầng hoàn chỉnh', 'Gần KCN lớn', 'Thanh khoản cao'],
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: 'Đất ven sông',
    location: 'Bình Phước, Tây Ninh',
    yield: '20–30%',
    minCapital: '800 triệu',
    tag: 'Tiềm năng cao',
    tagColor: 'bg-amber-100 text-amber-700',
    description: 'Quỹ đất ven sông khan hiếm, cảnh quan đẹp, phù hợp phát triển nghỉ dưỡng và farmstay.',
    features: ['Giá còn thấp', 'View sông độc đáo', 'Phát triển du lịch', 'Tiềm năng tăng giá'],
  },
  {
    icon: <Target className="w-6 h-6" />,
    title: 'Đất Bình Phước',
    location: 'Chơn Thành, Đồng Phú',
    yield: '25–35%',
    minCapital: '500 triệu',
    tag: 'Mới nổi',
    tagColor: 'bg-blue-100 text-blue-700',
    description: 'Giá đất vẫn còn rất thấp so với mặt bằng chung, cao tốc đang thi công sẽ thúc đẩy tăng giá mạnh.',
    features: ['Giá thấp nhất vùng', 'Cao tốc sắp thông', 'KCN Becamex lớn', 'ROI hấp dẫn'],
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: 'Nhà phố TM',
    location: 'Bình Dương, Long An',
    yield: '12–18%',
    minCapital: '2,5 tỷ',
    tag: 'Dòng tiền ổn định',
    tagColor: 'bg-purple-100 text-purple-700',
    description: 'Nhà phố thương mại mặt tiền đường lớn, vừa ở vừa kinh doanh, dòng tiền cho thuê ổn định.',
    features: ['Mặt tiền kinh doanh', 'Cho thuê ổn định', 'Giá trị tăng đều', 'Pháp lý vững'],
  },
];

const PROCESS_STEPS = [
  {
    num: '01',
    title: 'Tư vấn nhu cầu',
    desc: 'Chuyên gia lắng nghe mục tiêu, ngân sách và khả năng rủi ro của bạn',
  },
  {
    num: '02',
    title: 'Đề xuất danh mục',
    desc: 'Chúng tôi lọc ra 3–5 sản phẩm phù hợp nhất từ danh mục hơn 200 BĐS',
  },
  {
    num: '03',
    title: 'Khảo sát thực tế',
    desc: 'Đưa khách đi xem thực địa, kiểm tra pháp lý, hạ tầng xung quanh',
  },
  {
    num: '04',
    title: 'Đàm phán & ký kết',
    desc: 'Hỗ trợ đàm phán giá tốt nhất và soạn thảo hợp đồng minh bạch',
  },
  {
    num: '05',
    title: 'Hậu mãi & quản lý',
    desc: 'Theo dõi thị trường, hỗ trợ bán lại hoặc cho thuê khi cần',
  },
];

const BENEFITS = [
  { icon: <Shield className="w-5 h-5" />, title: 'Pháp lý 100% minh bạch', desc: 'Kiểm tra kỹ từng dự án trước khi giới thiệu' },
  { icon: <TrendingUp className="w-5 h-5" />, title: 'ROI vượt ngân hàng', desc: 'Trung bình 15–25% mỗi năm tại các khu vực trọng điểm' },
  { icon: <Users className="w-5 h-5" />, title: '1.200+ khách hài lòng', desc: 'Đội ngũ có kinh nghiệm và mạng lưới rộng khắp' },
  { icon: <Calculator className="w-5 h-5" />, title: 'Tư vấn miễn phí', desc: 'Không phí tư vấn, không ràng buộc, hoàn toàn trung thực' },
];

/* ─────────────────── ROI Calculator ─────────────────── */
function RoiCalculator({ onNavigate }: { onNavigate: (p: Page) => void }) {
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
              <Calculator className="w-5 h-5 text-red-500" /> Tính toán lợi nhuận
            </h3>
            <p className="text-sm text-gray-500">Nhập thông số để xem dự báo</p>
          </div>

          {/* Capital */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Vốn đầu tư
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
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">tỷ VND</span>
            </div>
          </div>

          {/* Yield rate */}
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-semibold text-gray-700">Tỷ suất lợi nhuận/năm</label>
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">Thời gian đầu tư</label>
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
            Tìm sản phẩm phù hợp <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="bg-gradient-to-br from-red-600 to-red-800 p-6 md:p-8 text-white flex flex-col justify-center">
          <h4 className="text-sm font-semibold text-red-200 uppercase tracking-wide mb-6">Kết quả dự báo</h4>

          <div className="space-y-5">
            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-red-200 text-xs mb-1">Vốn ban đầu</p>
              <p className="text-2xl font-bold">{capital.toFixed(1)} tỷ đồng</p>
            </div>

            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-red-200 text-xs mb-1">Giá trị sau {years} năm</p>
              <p className="text-3xl font-bold text-yellow-300">{projectedValue.toFixed(2)} tỷ đồng</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-red-200 text-xs mb-1">Lợi nhuận</p>
                <p className="text-xl font-bold text-green-300">+{profit.toFixed(2)} tỷ</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-red-200 text-xs mb-1">Tổng lợi nhuận</p>
                <p className="text-xl font-bold text-green-300">+{totalReturn.toFixed(0)}%</p>
              </div>
            </div>
          </div>

          <p className="text-red-300 text-xs mt-6">
            * Dự báo dựa trên tốc độ tăng trưởng trung bình, không đảm bảo kết quả thực tế.
          </p>
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
    mutationFn: () => submitLead({ full_name: name, phone, message: notes, area_interest: 'Tư vấn đầu tư' }),
    onSuccess: () => { setError(''); setSent(true); },
    onError: () => setError('Có lỗi xảy ra, vui lòng thử lại sau.'),
  });
  const loading = submitMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Vui lòng điền đầy đủ họ tên và số điện thoại.');
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
  const phone = useSetting('phone_hotline', '0901 234 567');
  const { data: cms = {} } = useQuery({
    queryKey: qk.pageBlocks('invest'),
    queryFn: () => getPageBlocks('invest'),
    select: pageBlocksToMap,
  });
  const g = (section: string, key: string, def: string) => cms[section]?.[key] || def;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative h-64 md:h-96 flex items-center"
        style={{
          backgroundImage:
            `url('${g('hero','image','https://images.pexels.com/photos/210158/pexels-photo-210158.jpeg?auto=compress&w=1200')}')`,
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
              <TrendingUp className="w-3.5 h-3.5" /> {g('hero','badge','Sinh lời 15–35%/năm')}
            </span>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3 leading-tight">
              {g('hero','title','ĐẦU TƯ BẤT ĐỘNG SẢN')}
            </h1>
            <p className="text-gray-200 text-base md:text-lg">
              {g('hero','subtitle','Khám phá cơ hội sinh lời hấp dẫn từ đất nền, nhà phố và khu dân cư tại vùng kinh tế trọng điểm phía Nam')}
            </p>
          </div>
        </div>
      </div>

      {/* ROI Calculator */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-8">
          <SectionTitle
            title={g('calculator','title','Công Cụ Tính ROI')}
            subtitle={g('calculator','subtitle','Dự báo lợi nhuận đầu tư bất động sản của bạn')}
          />
        </div>
        <RoiCalculator onNavigate={onNavigate} />
      </div>

      {/* Opportunities */}
      <div className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8">
            <SectionTitle
              title={g('opportunities','title','Cơ Hội Đầu Tư')}
              subtitle={g('opportunities','subtitle','Các loại hình bất động sản đang được nhà đầu tư quan tâm nhất')}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {OPPORTUNITIES.map((op) => (
              <div
                key={op.title}
                className="bg-gray-50 rounded-2xl p-5 border border-gray-100 hover:shadow-lg hover:border-red-100 transition-all duration-300 flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                    {op.icon}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${op.tagColor}`}>{op.tag}</span>
                </div>
                <h3 className="font-bold text-gray-800 text-base mb-1">{op.title}</h3>
                <p className="text-gray-500 text-xs mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> {op.location}
                </p>
                <p className="text-gray-500 text-sm mb-3 leading-relaxed flex-1">{op.description}</p>

                <div className="space-y-1 mb-4">
                  {op.features.map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> {f}
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-sm border-t border-gray-200 pt-3 mt-auto">
                  <div>
                    <p className="text-gray-400 text-xs">Lợi nhuận</p>
                    <p className="text-green-600 font-bold">{op.yield}/năm</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">Vốn tối thiểu</p>
                    <p className="text-gray-800 font-bold">{op.minCapital}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Process */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-8">
          <SectionTitle
            title={g('process','title','Quy Trình Đầu Tư')}
            subtitle={g('process','subtitle','5 bước đơn giản để sở hữu bất động sản sinh lời')}
          />
        </div>

        {/* Desktop: horizontal with lines */}
        <div className="hidden md:flex items-start gap-0">
          {PROCESS_STEPS.map((step, index) => (
            <div key={step.num} className="flex-1 flex flex-col items-center text-center relative">
              {/* Connector line */}
              {index < PROCESS_STEPS.length - 1 && (
                <div className="absolute top-6 left-1/2 w-full h-0.5 bg-gradient-to-r from-red-300 to-red-100 z-0" />
              )}
              {/* Circle */}
              <div className="relative z-10 w-12 h-12 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-base shadow-lg mb-4">
                {step.num}
              </div>
              <h4 className="font-bold text-gray-800 text-sm mb-1 px-2">{step.title}</h4>
              <p className="text-gray-500 text-xs px-3 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Mobile: vertical */}
        <div className="md:hidden space-y-4">
          {PROCESS_STEPS.map((step, index) => (
            <div key={step.num} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                  {step.num}
                </div>
                {index < PROCESS_STEPS.length - 1 && <div className="w-0.5 flex-1 bg-red-200 my-1 min-h-4" />}
              </div>
              <div className="pb-4">
                <h4 className="font-bold text-gray-800 text-sm mb-1">{step.title}</h4>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
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
            <h3 className="text-xl font-bold text-white mb-1">{g('cta','title','Đăng ký tư vấn đầu tư')}</h3>
            <p className="text-red-200 text-sm mb-6">
              {g('cta','subtitle','Chuyên gia sẽ gọi lại trong vòng 30 phút để phân tích cơ hội phù hợp với bạn')}
            </p>
            <ConsultationForm />
          </div>

          {/* Right — Benefits */}
          <div className="flex flex-col justify-center gap-5">
            <h3 className="text-xl font-bold text-white mb-2">{g('cta','why_title','Tại sao chọn chúng tôi?')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {BENEFITS.map((b) => (
                <div key={b.title} className="bg-gray-800 rounded-xl p-4 flex gap-3">
                  <div className="w-9 h-9 bg-red-600/20 text-red-400 rounded-lg flex items-center justify-center shrink-0">
                    {b.icon}
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm leading-snug">{b.title}</p>
                    <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2 font-semibold">Hotline 24/7</p>
              <a href={`tel:${phone.replace(/\s/g, '')}`} className="text-2xl font-bold text-white hover:text-red-400 transition-colors">
                {phone}
              </a>
              <p className="text-gray-500 text-xs mt-1">Tư vấn miễn phí — không phí dịch vụ</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}