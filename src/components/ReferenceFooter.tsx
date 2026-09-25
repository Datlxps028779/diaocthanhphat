'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Home, Mail, MapPin, Phone } from 'lucide-react';
import type { Area, District, PropertyType } from '../lib/supabase';
import { useContent, useSetting } from '../lib/cms';
import { districtDisplaySlug } from '../lib/areaPath';

const quickLinks = [
  ['Trang chủ', '/'], ['Mua bán', '/mua-ban'], ['Cho thuê', '/cho-thue'], ['Dự án', '/du-an'],
  ['Khu vực', '/khu-vuc'], ['Tin tức', '/tin-tuc'], ['Về chúng tôi', '/ve-chung-toi'], ['Khu dân cư', '/khu-dan-cu'],
] as const;

function LinkGroup({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  if (!links.length) return null;
  return <div>
    <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
    <ul className="mt-3 space-y-2">{links.map(link => <li key={`${link.label}-${link.href}`}><Link href={link.href} className="text-sm leading-6 text-slate-600 transition hover:text-red-700">{link.label}</Link></li>)}</ul>
  </div>;
}

export function ReferenceFooter({ areas, districts = [], propertyTypes = [] }: { areas: Area[]; districts?: District[]; propertyTypes?: PropertyType[] }) {
  const footer = useContent('footer');
  const siteName = useSetting('site_logo_text', 'Chợ Nhà Việt');
  const siteSub = useSetting('site_logo_sub', 'Nền tảng bất động sản uy tín');
  const logoUrl = useSetting('site_logo_url', '');
  const phone = useSetting('phone_main', '');
  const email = useSetting('email', '');
  const address = useSetting('address', '');
  const description = useSetting('footer_description', 'Nền tảng bất động sản minh bạch, kết nối người mua, người thuê và chủ nhà.');
  const license = useSetting('footer_license', '');
  const [logoError, setLogoError] = useState(false);
  const hasRealLicense = Boolean(license.trim()) && !/\b0{6,}\b/.test(license);

  const saleLinks = propertyTypes.slice(0, 5).map(type => ({ label: `Bán ${type.name.toLowerCase()}`, href: `/mua-ban?loai=${type.slug}` }));
  const rentLinks = propertyTypes.slice(0, 5).map(type => ({ label: `Cho thuê ${type.name.toLowerCase()}`, href: `/cho-thue?loai=${type.slug}` }));
  const areaLinks = areas.slice(0, 6).map(area => ({ label: `Bất động sản ${area.name}`, href: `/khu-vuc/${area.slug}` }));
  const districtLinks = areas.flatMap(area => districts.filter(district => district.area_id === area.id).slice(0, 2).map(district => ({ label: `Nhà đất ${district.name}`, href: `/mua-ban/${area.slug}/${districtDisplaySlug(area.slug, district.slug)}` }))).slice(0, 6);

  return <>
    <section className="relative overflow-hidden border-t border-slate-200 bg-[#fafafa] text-slate-700" aria-labelledby="footer-discovery-heading">
      <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(#d9dfe7 .75px, transparent .75px)', backgroundSize: '14px 14px' }} />
      <div className="relative mx-auto max-w-[1360px] px-5 py-10 sm:px-8">
        <p id="footer-discovery-heading" className="text-center text-[11px] font-extrabold uppercase tracking-[.2em] text-slate-400">Khám phá bất động sản</p>
        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-4">
          <LinkGroup title="Nhà đất bán" links={saleLinks} />
          <LinkGroup title="Nhà đất cho thuê" links={rentLinks} />
          <LinkGroup title="Theo tỉnh / thành" links={areaLinks} />
          <LinkGroup title="Quận / huyện nổi bật" links={districtLinks} />
        </div>
      </div>
    </section>
    <footer className="relative overflow-hidden border-t border-slate-200 bg-[#f8f9fb] text-slate-700">
    <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(#d9dfe7 .75px, transparent .75px)', backgroundSize: '14px 14px' }} />
    <div className="relative mx-auto max-w-[1360px] px-5 py-12 sm:px-8">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_.9fr_1fr]">
        <section>
          <div className="flex items-center gap-3">
            {logoUrl && !logoError ? <img src={logoUrl} alt={siteName} onError={() => setLogoError(true)} className="h-12 w-auto max-w-[180px] rounded-xl object-contain" /> : <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white"><Home size={22} /></span>}
            <div><p className="text-xl font-black tracking-[-.035em] text-slate-950">{siteName}</p><p className="mt-0.5 text-xs font-semibold uppercase tracking-[.12em] text-red-600">{siteSub}</p></div>
          </div>
          <p className="mt-5 max-h-[7rem] max-w-md overflow-hidden text-sm leading-7 text-slate-600">{description}</p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            {address && <p className="flex min-w-0 flex-1 items-start gap-2 text-sm leading-6 text-slate-700"><MapPin size={18} className="mt-0.5 flex-shrink-0 text-red-600" />{address}</p>}
            <a href="https://online.gov.vn/nen-tang/d6e6a45b-9623-4eb2-bfb5-27247f25dd91" target="_blank" rel="noopener noreferrer" title="Đã xác nhận với Bộ Công Thương" className="inline-flex flex-shrink-0 rounded-md bg-white/70 p-1.5 transition hover:bg-white">
              <img src="https://fileserver.online.gov.vn/uploads/Resources/iconxacnhan/DaThongBao.png" alt="Đã thông báo với Bộ Công Thương" height={44} loading="lazy" className="h-11 w-auto" />
            </a>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-950">Liên kết nhanh</h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">{quickLinks.map(([label, href]) => <li key={href}><Link href={href} className="text-sm text-slate-600 transition hover:text-red-700">{label}</Link></li>)}</ul>
        </section>

        <section>
          <h2 className="text-lg font-black text-slate-950">Nhận thông tin mới nhất</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Theo dõi tin tức, dữ liệu giá và các bất động sản mới đang công khai trên Chợ Nhà Việt.</p>
          <Link href="/tin-tuc" className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700">Xem tin mới nhất <ArrowRight size={17} /></Link>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-sm"><Phone size={20} className="text-slate-400" /><span><small className="block text-xs text-slate-500">Liên hệ</small><strong className="text-slate-900">{phone}</strong></span></a>}
            {email && <a href={`mailto:${email}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-sm"><Mail size={20} className="flex-shrink-0 text-slate-400" /><span className="min-w-0"><small className="block text-xs text-slate-500">Chăm sóc khách hàng</small><strong className="block truncate text-slate-900">{email}</strong></span></a>}
          </div>
        </section>
      </div>

      <div className="mt-10 flex flex-col gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500 md:flex-row md:items-end md:justify-between">
        <div>
          <p>{footer.copyright || '© 2025 Chợ Nhà Việt. Tất cả quyền được bảo lưu.'}</p>
          {hasRealLicense && <p className="mt-2 max-w-3xl leading-5 text-slate-400">{license}</p>}
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Chính sách"><Link href="/trang/chinh-sach-bao-mat" className="hover:text-red-700">Chính sách bảo mật</Link><Link href="/trang/dieu-khoan-su-dung" className="hover:text-red-700">Điều khoản sử dụng</Link><Link href="/trang/chinh-sach-dang-tin" className="hover:text-red-700">Chính sách đăng tin</Link></nav>
      </div>
    </div>
    </footer>
  </>;
}
