import React from 'react';
import Link from 'next/link';
import type { FaqItem } from '@/lib/propertyFaq';
import { ArrowRight, Building2, BarChart3, ChevronDown } from 'lucide-react';
import styles from './localityVisual.module.css';

export type LocalityLink = { label: string; href: string; count: number };
export type LocalityPriceRow = { label: string; monthly: boolean; inventory: number; samples: number; mean: number | null; median: number | null; perSqm: number | null; sqmSamples: number };

export function localityMoney(value: number | null, monthly = false, perSqm = false): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return 'Chưa đủ mẫu';
  const amount = value >= 1e9 ? `${(value / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
    : value >= 1e6 ? `${(value / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} triệu`
      : `${Math.round(value).toLocaleString('vi-VN')} đồng`;
  return `${amount}${perSqm ? '/m²' : ''}${monthly ? '/tháng' : ''}`;
}

export function LocalityTimestamp({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (giờ Việt Nam)</time>;
}

export function LocalityFaq({ items, title = 'Câu hỏi thường gặp' }: { items: FaqItem[]; title?: string }) {
  if (!items.length) return null;
  return <section aria-label={title} className={`${styles.scope} ${styles.section}`} data-testid="locality-faq">
    <h2 className={styles.faqTitle}>{title}</h2>
    <div data-testid="locality-faq-grid" className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      {items.map(item => <details key={item.question} className={styles.faq}>
        <summary className={styles.faqSummary}><span>{item.question}</span><span aria-hidden="true" className={styles.chevron}><ChevronDown size={16} /></span></summary>
        <p className={styles.faqAnswer}>{item.answer}</p>
      </details>)}
    </div>
  </section>;
}

function DirectoryLinks({ items, summary = false, chips = false }: { items: LocalityLink[]; summary?: boolean; chips?: boolean }) {
  return <div className={summary ? styles.typeGrid : chips ? styles.chips : 'grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3'}>
    {items.map(item => <Link key={item.href} href={item.href} className={`group ${summary ? styles.typeCard : chips ? styles.chip : styles.directoryLink}`}>
      {summary && <span className={styles.typeIcon} aria-hidden="true"><Building2 size={21} /></span>}
      <span className={`min-w-0 break-words group-hover:text-red-700 ${summary ? 'text-lg font-medium' : chips ? '' : styles.directoryLabel}`}>{item.label}</span>
      <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-slate-500">{item.count} tin <ArrowRight aria-hidden="true" size={14} className="text-red-700" /></span>
    </Link>)}
  </div>;
}

export function LocalityDirectory({ title, items, summary = false, chips = false }: { title: string; items: LocalityLink[]; summary?: boolean; chips?: boolean }) {
  if (!items.length) return null;
  return <section className={`${styles.scope} ${styles.section}`} aria-label={title}>
    <h2 className={styles.heading}>{title}</h2>
    <DirectoryLinks items={items.slice(0, 12)} summary={summary} chips={chips} />
    {items.length > 12 && <details className="mt-3"><summary className="min-h-11 w-fit cursor-pointer py-3 text-sm text-red-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">Xem thêm {items.length - 12} lựa chọn</summary><DirectoryLinks items={items.slice(12)} summary={summary} chips={chips} /></details>}
  </section>;
}

export function LocalityReportCta({ title, href, ready, computedAt }: { title: string; href: string; ready: boolean; computedAt: string }) {
  return <section className={`${styles.scope} ${styles.cta}`} data-testid="locality-report-cta">
    <span className={styles.ctaIcon} aria-hidden="true"><BarChart3 size={30} /></span>
    <div className={styles.ctaBody}>
      <p className="text-xs font-medium uppercase tracking-wider text-red-700">Báo cáo dữ liệu</p>
      <h2 className="mt-2 text-xl font-medium leading-7 text-gray-900">{title}</h2>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-stone-600">{ready ? 'Xem giá chào bán, giá thuê, cơ cấu tin đăng và độ phủ dữ liệu trong đúng phạm vi này.' : 'Phạm vi này chưa đủ dữ liệu để phân tích chuyên sâu. Bạn vẫn có thể xem số tin hiện có và giới hạn của mẫu.'}</p>
      <p className="mt-2 text-xs leading-6 text-stone-500">Tính tại <LocalityTimestamp value={computedAt} /></p>
    </div>
    <Link href={href} className={styles.primaryButton}>{ready ? 'Xem phân tích chi tiết' : 'Xem dữ liệu hiện có'} <ArrowRight aria-hidden="true" size={18} /></Link>
  </section>;
}

export function LocalityPriceTable({ rows }: { rows: LocalityPriceRow[] }) {
  return <div className={`${styles.scope} ${styles.tableFrame}`}>
    <table className="w-full min-w-[660px] border-collapse text-left text-sm">
      <caption className="border-b border-stone-100 bg-stone-50/70 px-4 py-4 text-left text-xs leading-6 text-stone-500">Giá chào từ tin đăng trên Chọn Nhà Việt, không phải giá giao dịch hay đại diện toàn thị trường. Từng chỉ số cần ít nhất 3 mẫu hợp lệ.</caption>
      <thead className="border-b border-red-100 bg-red-50/70 text-xs text-red-900"><tr>{['Giao dịch', 'Tin đăng', 'Mẫu giá', 'Trung bình', 'Trung vị', 'Đơn giá trung bình'].map(label => <th scope="col" key={label} className="px-4 py-3.5 font-semibold">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.label} className="border-b border-stone-100 transition last:border-0 hover:bg-red-50/35"><th scope="row" className="px-4 py-4 font-medium text-stone-800">{row.label}</th><td className="px-4 py-4 tabular-nums text-stone-700">{row.inventory}</td><td className="px-4 py-4 tabular-nums text-stone-700">{row.samples}</td><td className="px-4 py-4 text-stone-700">{localityMoney(row.mean, row.monthly)}</td><td className="px-4 py-4 text-stone-700">{localityMoney(row.median, row.monthly)}</td><td className="px-4 py-4 text-stone-700">{localityMoney(row.perSqm, row.monthly, true)}<span className="mt-1 block text-xs text-stone-500">{row.sqmSamples} mẫu giá/diện tích</span></td></tr>)}</tbody>
    </table>
  </div>;
}
