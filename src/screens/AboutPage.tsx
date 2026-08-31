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
import { isValidVnPhone } from '../lib/phone';
import { track, EVENTS } from '../lib/analytics';
import { getCollectionDefinition, parseContentCollection } from '../lib/pageContentSchema';
import { verifiedAwards } from '../lib/verifiedAwards';

interface AboutPageProps { onNavigate: (p: Page) => void; }

export function AboutPage({ onNavigate }: AboutPageProps) {
  const [form, setForm] = useState({ full_name: '', phone: '', message: '' });
  const [sent, setSent] = useState(false);
  const [leadError, setLeadError] = useState('');
  const sitePhone = useSetting('phone_hotline', '');
  const supportHours = useSetting('support_hours', 'Hỗ trợ 7:00 – 21:00');
  const siteEmail = useSetting('email', '');
  const siteAddress = useSetting('address', '');

  const { data: cms = {} } = useQuery({
    queryKey: qk.pageBlocks('about'),
    queryFn: () => getPageBlocks('about'),
    select: pageBlocksToMap,
  });

  const g = (section: string, key: string) => cms[section]?.[key]?.trim() || '';
  const collection = (section: string, key: string) => parseContentCollection(cms[section]?.[key], getCollectionDefinition('about', section, key));

  const submitMutation = useMutation({
    mutationFn: (payload: typeof form) => submitLead({ ...payload, area_interest: 'Liên hệ chung', source: 'about_page' }),
    onSuccess: () => {
      setLeadError(''); setSent(true);
      track(EVENTS.LEAD_SUBMIT, { source: 'about_page', hasMessage: Boolean(form.message.trim()) });
    },
  });
  const loading = submitMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) {
      setLeadError('Vui lòng nhập họ tên và số điện thoại.');
      return;
    }
    if (!isValidVnPhone(form.phone)) {
      setLeadError('Số điện thoại chưa hợp lệ. Vui lòng nhập số di động Việt Nam (VD: 0901234567).');
      return;
    }
    setLeadError('');
    submitMutation.mutate(form);
  };

  const iconFor = (name: string, className: string) => {
    const Icon = ({ Award, Building2, Users, Star, Shield, Heart, Target, TrendingUp }[name] ?? CheckCircle);
    return <Icon className={className} />;
  };
  const stats = collection('stats', 'items').map(item => ({ value: String(item.value ?? ''), label: String(item.label ?? ''), icon: iconFor(String(item.icon ?? ''), 'w-6 h-6') }));
  const values = collection('values', 'items').map(item => ({ icon: iconFor(String(item.icon ?? ''), 'w-5 h-5 text-amber-500'), title: String(item.title ?? ''), desc: String(item.description ?? '') }));
  const team = collection('team', 'items').map(item => ({ name: String(item.name ?? ''), role: String(item.role ?? ''), exp: String(item.experience ?? ''), image: String(item.image ?? '') }));
  const milestones = collection('timeline', 'items').map(item => ({ year: String(item.year ?? ''), title: String(item.title ?? ''), desc: String(item.description ?? '') }));
  const awards = verifiedAwards(collection('awards', 'items'));
  const missionItems = g('mission', 'items').split('\n').map(item => item.trim()).filter(Boolean);
  const heroImage = g('hero', 'image');
  const heroTitle = g('hero', 'title');
  const heroSubtitle = g('hero', 'subtitle');
  const missionTitle = g('mission', 'title');
  const missionContent = g('mission', 'content');
  const visionTitle = g('vision', 'title');
  const visionContent = g('vision', 'content');
  const valuesTitle = g('values', 'title');
  const timelineTitle = g('timeline', 'title');
  const teamTitle = g('team', 'title');
  const awardsTitle = g('awards', 'title');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="relative bg-gray-900 h-64 overflow-hidden">
        <img src={heroImage} alt="" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 flex flex-col justify-center px-4">
          <div className="max-w-7xl mx-auto w-full">
            <Breadcrumb items={[
              { label: 'Trang chủ', onClick: () => onNavigate({ name: 'home' }) },
              { label: 'Về chúng tôi' },
            ]} />
            {heroTitle && <h1 className="text-white text-4xl font-black mb-2">{heroTitle}</h1>}
            {heroSubtitle && <p className="text-gray-300 text-base max-w-xl">{heroSubtitle}</p>}
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
            {missionTitle && <h2 className="font-black text-gray-900 text-xl mb-3">{missionTitle}</h2>}
            {missionContent && <p className="text-gray-600 text-sm leading-relaxed">{missionContent}</p>}
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
            {visionTitle && <h2 className="font-black text-xl mb-3">{visionTitle}</h2>}
            {visionContent && <p className="text-gray-300 text-sm leading-relaxed">{visionContent}</p>}
          </div>
        </div>

        {/* Core values */}
        {values.length > 0 && <div>
          {valuesTitle && <h2 className="inline-block font-black text-gray-900 text-xl mb-5">{valuesTitle}</h2>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {values.map(v => (
              <div key={v.title} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">{v.icon}</div>
                <h3 className="font-bold text-gray-900 text-sm mb-1.5">{v.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>}

        {/* Timeline */}
        {milestones.length > 0 && <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {timelineTitle && <h2 className="inline-block font-black text-gray-900 text-xl mb-6">{timelineTitle}</h2>}
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
        </div>}

        {/* Team */}
        {team.length > 0 && <div>
          {teamTitle && <h2 className="inline-block font-black text-gray-900 text-xl mb-5">{teamTitle}</h2>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {team.map(member => (
              <div key={member.name} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden text-center hover:shadow-md transition-shadow group">
                {member.image && <div className="overflow-hidden h-48">
                  <img src={member.image} alt={member.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" />
                </div>}
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 text-sm">{member.name}</h3>
                  <p className="text-amber-600 text-xs font-semibold mt-0.5">{member.role}</p>
                  <p className="text-gray-400 text-xs mt-1">{member.exp}</p>
                </div>
              </div>
            ))}
          </div>
        </div>}

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
                <input type="tel" inputMode="tel" pattern="(\+?84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}" title="Nhập số di động Việt Nam, ví dụ 0901234567" placeholder="Số điện thoại *" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <textarea placeholder="Nội dung muốn trao đổi..." value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                {leadError && <p className="text-red-500 text-sm">{leadError}</p>}
                <button type="submit" disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                  {loading ? 'Đang gửi...' : 'GỬI TIN NHẮN'}
                </button>
              </form>
            )}
          </div>
          <div className="space-y-4">
            {[
              { icon: <Phone className="w-5 h-5 text-amber-500" />, label: 'Hotline', value: sitePhone, sub: `${supportHours} hàng ngày` },
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
            {awards.length > 0 && <section className="rounded-xl border border-amber-100 bg-amber-50 p-4" aria-labelledby="awards-heading">
              {awardsTitle && <h4 id="awards-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Award className="h-4 w-4 text-amber-500" />{awardsTitle}
              </h4>}
              <div className="space-y-3">
                {awards.map(award => (
                  <article key={`${award.title}-${award.sourceUrl}`} className="rounded-lg border border-amber-100 bg-white p-3">
                    <div className="flex gap-3">
                      {award.image && <img src={award.image} alt={`Chứng nhận: ${award.title}`} className="h-12 w-12 shrink-0 rounded-lg border border-amber-100 object-cover" />}
                      <div className="min-w-0 flex-1">
                        <h5 className="text-sm font-bold leading-5 text-gray-900">{award.title}</h5>
                        {(award.issuer || award.year) && <p className="mt-0.5 text-xs text-gray-500">{[award.issuer, award.year].filter(Boolean).join(' · ')}</p>}
                        {award.description && <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{award.description}</p>}
                        <a href={award.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-900">
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />Xem nguồn xác minh
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>}
          </div>
        </div>
      </div>
    </div>
  );
}