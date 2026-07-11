'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Users, Award, Shield, TrendingUp, Phone, Mail, MapPin,
  CheckCircle, Star, Building2, Target, Heart
} from 'lucide-react';
import { type Page } from '../lib/router';
import { Breadcrumb } from '../components/Layout';
import { submitLead, getPageBlocks, pageBlocksToMap } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { useSetting } from '../lib/cms';

interface AboutPageProps { onNavigate: (p: Page) => void; }

export function AboutPage({ onNavigate }: AboutPageProps) {
  const [form, setForm] = useState({ full_name: '', phone: '', message: '' });
  const [sent, setSent] = useState(false);
  const sitePhone = useSetting('phone_hotline', '0901 234 567');
  const siteEmail = useSetting('email', 'info@bdsbinhduong.vn');
  const siteAddress = useSetting('address', '123 Đường số 1, P. Hiệp Thành, TP. Thủ Dầu Một, Bình Dương');

  const { data: cms = {} } = useQuery({
    queryKey: qk.pageBlocks('about'),
    queryFn: () => getPageBlocks('about'),
    select: pageBlocksToMap,
  });

  const g = (section: string, key: string, def: string) => cms[section]?.[key] || def;

  const submitMutation = useMutation({
    mutationFn: (payload: typeof form) => submitLead({ ...payload, area_interest: 'Liên hệ chung', source: 'about_page' }),
    onSuccess: () => setSent(true),
  });
  const loading = submitMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.phone) return;
    submitMutation.mutate(form);
  };

  const stats = [
    { value: g('stats','stat1_value','7+'), label: g('stats','stat1_label','Năm kinh nghiệm'), icon: <Award className="w-6 h-6" /> },
    { value: g('stats','stat2_value','500+'), label: g('stats','stat2_label','Dự án thành công'), icon: <Building2 className="w-6 h-6" /> },
    { value: g('stats','stat3_value','1.200+'), label: g('stats','stat3_label','Khách hàng tin tưởng'), icon: <Users className="w-6 h-6" /> },
    { value: g('stats','stat4_value','98%'), label: g('stats','stat4_label','Tỷ lệ hài lòng'), icon: <Star className="w-6 h-6" /> },
  ];

  const values = [
    { icon: <Shield className="w-5 h-5 text-amber-500" />, title: g('values','v1_title','Uy tín'), desc: g('values','v1_desc','Cam kết trung thực, minh bạch trong mọi giao dịch.') },
    { icon: <Heart className="w-5 h-5 text-red-500" />, title: g('values','v2_title','Tận tâm'), desc: g('values','v2_desc','Luôn đặt lợi ích khách hàng lên hàng đầu.') },
    { icon: <Target className="w-5 h-5 text-blue-500" />, title: g('values','v3_title','Chuyên nghiệp'), desc: g('values','v3_desc','Đội ngũ được đào tạo bài bản, kinh nghiệm thực chiến.') },
    { icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, title: g('values','v4_title','Hiệu quả'), desc: g('values','v4_desc','Kết quả nhanh chóng, tối ưu nhất cho từng khách hàng.') },
  ];

  const teamRaw = g('team','members','Nguyễn Văn Minh|Giám đốc điều hành|12 năm kinh nghiệm|https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg\nTrần Thị Hoa|Giám đốc kinh doanh|9 năm kinh nghiệm|https://images.pexels.com/photos/3769021/pexels-photo-3769021.jpeg\nLê Quốc Hùng|Trưởng phòng pháp lý|8 năm kinh nghiệm|https://images.pexels.com/photos/1516680/pexels-photo-1516680.jpeg\nPhạm Thị Lan|Trưởng phòng tư vấn|7 năm kinh nghiệm|https://images.pexels.com/photos/3756679/pexels-photo-3756679.jpeg');
  const team = teamRaw.split('\n').filter(Boolean).map(line => {
    const [name, role, exp, image] = line.split('|');
    return { name, role, exp, image };
  });

  const timelineRaw = g('timeline','items','2018|Thành lập công ty|Nhà Đất Kết Nối ra đời với đội ngũ 10 người tại Bình Dương.\n2019|Mở rộng khu vực|Mở rộng hoạt động sang Đồng Nai và TP. Hồ Chí Minh.\n2020|500 giao dịch|Đạt mốc 500 giao dịch thành công đầu tiên dù bối cảnh dịch bệnh.\n2022|Nền tảng số|Ra mắt website và hệ thống quản lý BĐS trực tuyến.\n2024|Mở rộng Bình Phước|Phủ sóng thêm thị trường Bình Phước – mảnh đất nhiều tiềm năng.\n2025|1.200+ khách hàng|Đạt mốc 1.200 khách hàng hài lòng, 500+ dự án thành công.');
  const milestones = timelineRaw.split('\n').filter(Boolean).map(line => {
    const [year, title, desc] = line.split('|');
    return { year, title, desc };
  });

  const awardsRaw = g('awards','items','Top 10 Sàn giao dịch BĐS uy tín 2024\nChứng nhận Môi giới chuyên nghiệp\nThành viên Hội Môi giới BĐS Việt Nam');
  const awards = awardsRaw.split('\n').filter(Boolean);

  const missionItems = g('mission','items','Cung cấp thông tin BĐS chính xác, cập nhật\nĐồng hành toàn bộ quy trình giao dịch\nBảo vệ quyền lợi tối đa cho khách hàng').split('\n').filter(Boolean);

  const heroImage = g('hero','image','https://images.pexels.com/photos/1732414/pexels-photo-1732414.jpeg');

  return (
    <div className="min-h-screen bg-gray-50 pt-14">
      {/* Hero */}
      <div className="relative bg-gray-900 h-64 overflow-hidden">
        <img src={heroImage} alt="" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 flex flex-col justify-center px-4">
          <div className="max-w-7xl mx-auto w-full">
            <Breadcrumb items={[
              { label: 'Trang chủ', onClick: () => onNavigate({ name: 'home' }) },
              { label: 'Về chúng tôi' },
            ]} />
            <h1 className="text-white text-4xl font-black mb-2">{g('hero','title','VỀ CHÚNG TÔI')}</h1>
            <p className="text-gray-300 text-base max-w-xl">{g('hero','subtitle','7 năm đồng hành cùng hàng nghìn gia đình và nhà đầu tư tìm kiếm tổ ấm, cơ hội tại thị trường phía Nam.')}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-amber-500 py-6">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="text-center text-white">
              <div className="flex justify-center mb-1 opacity-80">{s.icon}</div>
              <p className="text-3xl font-black">{s.value}</p>
              <p className="text-amber-100 text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-10">

        {/* Mission + Vision */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
              <Target className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="font-black text-gray-900 text-xl mb-3">{g('mission','title','SỨ MỆNH CỦA CHÚNG TÔI')}</h2>
            <p className="text-gray-600 text-sm leading-relaxed">{g('mission','content','Nhà Đất Kết Nối ra đời với sứ mệnh kết nối người mua và người bán một cách nhanh chóng, minh bạch và hiệu quả nhất.')}</p>
            <ul className="mt-4 space-y-2">
              {missionItems.map(item => (
                <li key={item} className="flex items-center gap-2 text-xs text-gray-600">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />{item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 text-white">
            <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-amber-400" />
            </div>
            <h2 className="font-black text-xl mb-3">{g('vision','title','TẦM NHÌN 2030')}</h2>
            <p className="text-gray-300 text-sm leading-relaxed">{g('vision','content','Trở thành nền tảng môi giới bất động sản số 1 khu vực Đông Nam Bộ, phủ sóng toàn bộ 10 tỉnh thành và phục vụ hơn 10.000 khách hàng thành công.')}</p>
          </div>
        </div>

        {/* Core values */}
        <div>
          <h2 className="inline-block font-black text-gray-900 text-xl mb-5">{g('values','title','GIÁ TRỊ CỐT LÕI')}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {values.map(v => (
              <div key={v.title} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">{v.icon}</div>
                <h3 className="font-bold text-gray-900 text-sm mb-1.5">{v.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="inline-block font-black text-gray-900 text-xl mb-6">{g('timeline','title','HÀNH TRÌNH PHÁT TRIỂN')}</h2>
          <div className="relative">
            <div className="absolute left-16 top-0 bottom-0 w-0.5 bg-amber-200" />
            <div className="space-y-6">
              {milestones.map((m) => (
                <div key={m.year} className="flex gap-5 items-start">
                  <div className="w-16 flex-shrink-0 text-right">
                    <span className="text-amber-600 font-black text-sm">{m.year}</span>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-[21px] top-0.5 w-4 h-4 bg-amber-500 rounded-full border-2 border-white shadow" />
                  </div>
                  <div className="flex-1 pb-2">
                    <h4 className="font-bold text-gray-900 text-sm">{m.title}</h4>
                    <p className="text-gray-500 text-xs mt-0.5">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Team */}
        <div>
          <h2 className="inline-block font-black text-gray-900 text-xl mb-5">{g('team','title','ĐỘI NGŨ LÃNH ĐẠO')}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {team.map(member => (
              <div key={member.name} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden text-center hover:shadow-md transition-shadow group">
                <div className="overflow-hidden h-48">
                  <img src={member.image} alt={member.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 text-sm">{member.name}</h3>
                  <p className="text-amber-600 text-xs font-semibold mt-0.5">{member.role}</p>
                  <p className="text-gray-400 text-xs mt-1">{member.exp}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact form */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="inline-block font-black text-gray-900 text-xl mb-4">LIÊN HỆ VỚI CHÚNG TÔI</h2>
            {sent ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="font-bold text-gray-900">Đã nhận tin nhắn!</p>
                <p className="text-gray-500 text-sm mt-1">Chúng tôi sẽ phản hồi trong vòng 2 giờ.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <input type="text" placeholder="Họ và tên *" value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <input type="tel" placeholder="Số điện thoại *" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <textarea placeholder="Nội dung muốn trao đổi..." value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                <button type="submit" disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                  {loading ? 'Đang gửi...' : 'GỬI TIN NHẮN'}
                </button>
              </form>
            )}
          </div>
          <div className="space-y-4">
            {[
              { icon: <Phone className="w-5 h-5 text-amber-500" />, label: 'Hotline', value: sitePhone, sub: 'Hỗ trợ 7:00 – 21:00 hàng ngày' },
              { icon: <Mail className="w-5 h-5 text-amber-500" />, label: 'Email', value: siteEmail, sub: 'Phản hồi trong vòng 2 giờ' },
              { icon: <MapPin className="w-5 h-5 text-amber-500" />, label: 'Văn phòng chính', value: siteAddress, sub: '' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">{item.icon}</div>
                <div>
                  <p className="text-gray-500 text-xs">{item.label}</p>
                  <p className="font-bold text-gray-900 text-sm">{item.value}</p>
                  <p className="text-gray-400 text-xs">{item.sub}</p>
                </div>
              </div>
            ))}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <h4 className="font-semibold text-amber-800 text-sm mb-2 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />{g('awards','title','Giải thưởng & Chứng nhận')}
              </h4>
              <ul className="space-y-1.5">
                {awards.map(item => (
                  <li key={item} className="flex items-center gap-2 text-xs text-amber-700">
                    <CheckCircle className="w-3.5 h-3.5 text-amber-500" />{item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}