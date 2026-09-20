import React from 'react';
import Link from 'next/link';
import type { NewsListItem, Property } from '@/lib/supabase';
import { buildProductPath } from '@/lib/productPath';
import type { LocalityPageData } from '@/lib/localityPageData';
import { LocalityDirectory, LocalityFaq, LocalityPriceTable, LocalityReportCta, LocalityTimestamp, localityMoney } from './LocalitySections';
import { LocalityNewsSection, LocalityArticleDate } from './LocalityNewsSection';
import { LocalitySkyline } from './LocalitySkyline';
import styles from './localityVisual.module.css';

function LocalitySubnavItem({ label, href, active, disabled }: { label: string; href?: string; active?: boolean; disabled?: boolean }) {
  const className = `${styles.subnavLink} ${active ? styles.subnavActive : ''}`;
  if (!href || disabled) return <span className={`${className} ${styles.subnavDisabled}`} aria-disabled="true">{label}</span>;
  return <Link href={href} aria-current={active ? 'page' : undefined} className={className}>{label}</Link>;
}

export function LocalitySubnav({ data, newsPath, activePath }: { data: LocalityPageData; newsPath?: string | null; activePath?: string }) {
  const currentPath = activePath ?? data.context.path;
  const areaPath = `/khu-vuc/${data.area.slug}`;
  const listingPath = data.context.listingType ? data.context.landingPath : `/mua-ban/${data.area.slug}`;
  const items = [
    { label: data.area.name, href: areaPath, active: currentPath === areaPath },
    { label: 'Bất động sản', href: listingPath, active: currentPath === listingPath || currentPath.startsWith(`/mua-ban/${data.area.slug}`) || currentPath.startsWith(`/cho-thue/${data.area.slug}`) },
    { label: 'Dự án', href: `/du-an?area=${encodeURIComponent(data.area.slug)}`, active: false },
    { label: 'Cộng đồng', active: false, disabled: true },
    { label: 'Tin tức', href: newsPath ?? undefined, active: Boolean(newsPath && currentPath === newsPath), disabled: !newsPath },
    { label: 'Tuyển dụng', active: false, disabled: true },
    { label: 'Đăng tin', href: '/dang-tin', active: false },
  ];
  return <nav aria-label="Điều hướng khu vực" className={styles.subnav} data-testid="locality-subnav">
    <div className="mx-auto flex max-w-[1360px] items-stretch gap-1 overflow-x-auto px-4 sm:px-8">
      {items.map(item => <LocalitySubnavItem key={item.label} {...item} />)}
    </div>
  </nav>;
}

function LocalityCounts({ data }: { data: LocalityPageData }) {
  return <div className={styles.counts}>
    <p className="text-sm font-medium text-gray-800">Tin đăng trong phạm vi</p>
    <dl className="mt-3 grid grid-cols-3 gap-4">
      {([['total', 'Tổng tin'], ['sale', 'Mua bán'], ['rent', 'Cho thuê']] as const).map(([key, label]) => <div key={key} className="flex flex-col">
        <dt className="order-2 mt-1 text-xs text-gray-600">{label}</dt>
        <dd className="order-1 text-2xl font-medium tabular-nums leading-8 text-gray-900">{data.report.counts[key].toLocaleString('vi-VN')}</dd>
      </div>)}
    </dl>
    <p className="mt-4 text-xs leading-5 text-gray-500">Tính tại <LocalityTimestamp value={data.report.computedAt} /></p>
  </div>;
}

export function LocalityHeader({ data, newsPath, activePath, titleOverride, breadcrumbTitle, newsArticles = [] }: {
  data: LocalityPageData; newsPath?: string | null; activePath?: string; titleOverride?: string; breadcrumbTitle?: string; newsArticles?: NewsListItem[];
}) {
  const { context, area } = data;
  const isNews = activePath?.endsWith('/tin-tuc') ?? false;
  const isReport = !isNews && context.mode === 'report';
  const provinceOverview = !isNews && context.path === `/khu-vuc/${area.slug}`;
  const showNews = provinceOverview && Boolean(newsPath) && newsArticles.length > 0;
  const introduction = isNews ? `Các bài viết được gắn với ${area.name} từ nguồn tin tức công khai của Chọn Nhà Việt.`
    : provinceOverview && area.description?.trim() ? area.description : data.summary;
  return <header className={`${styles.scope} ${styles.hero}`} data-testid="locality-header">
    <LocalitySkyline />
    <div className={`mx-auto px-4 pt-5 sm:pt-7 ${isNews ? 'max-w-[1280px]' : isReport ? 'max-w-[1360px] sm:px-8' : 'max-w-[1280px] sm:px-8'}`}>
      <nav aria-label="Đường dẫn" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-gray-500">
        {data.breadcrumbs.map((item, index) => <React.Fragment key={`${item.path}-${item.name}`}>
          {index > 0 && <span aria-hidden="true" className="text-gray-400">/</span>}
          {index === data.breadcrumbs.length - 1 ? <span aria-current="page" className="text-gray-700">{breadcrumbTitle ?? item.name}</span> : <Link href={item.path} className="hover:text-red-700 hover:underline">{item.name}</Link>}
        </React.Fragment>)}
      </nav>
      <div className={`${styles.heroGrid} mt-5 ${provinceOverview ? `grid gap-6 ${showNews ? 'xl:grid-cols-[320px_minmax(0,1fr)_260px]' : 'lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]'}` : !isNews && !isReport ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
        <div className="min-w-0">
          <p className={styles.eyebrow}>{isNews ? 'Tin tức khu vực' : isReport ? 'Báo cáo dữ liệu địa phương' : 'Khám phá địa phương'}</p>
          <h1 className={`text-[22.4px] leading-[1.2] text-gray-900 ${isReport ? 'max-w-4xl font-black sm:text-[28.8px]' : isNews ? 'font-medium sm:text-[25.6px]' : 'font-medium sm:text-[28.8px]'}`}>{titleOverride ?? context.title}</h1>
          <p className={`${styles.intro} mt-4 text-sm ${isReport ? 'max-w-4xl' : 'max-w-3xl'}`}>{introduction}</p>
          {provinceOverview && area.admin_note?.trim() && <p className={styles.adminNote}>{area.admin_note}</p>}
        </div>
        {showNews && <section aria-label="Bảng tin khu vực" className={styles.newsPanel}>
          <div className={styles.newsPanelHeading}><h2>Bảng tin mới nhất</h2><Link href={newsPath!} className="inline-flex min-h-11 shrink-0 items-center text-xs text-red-700 hover:underline">Xem tin tức →</Link></div>
          <ul className={styles.bulletin}>{newsArticles.slice(0, 3).map(article => <li key={article.id} className={styles.bulletinItem}><LocalityArticleDate value={article.created_at} className={styles.dateBadge} /><Link href={`/tin-tuc/${article.slug}`} className="line-clamp-2 text-sm leading-[1.6] text-gray-700 hover:text-red-700">{article.title}</Link></li>)}</ul>
        </section>}
        {!isReport && !isNews && <LocalityCounts data={data} />}
      </div>
    </div>
  </header>;
}

function LocalityListingTicker({ properties }: { properties: Property[] }) {
  if (!properties.length) return null;
  return <section className={`${styles.scope} ${styles.ticker}`} aria-label="Tin đăng bất động sản mới nhất" data-testid="locality-listing-ticker">
    <p className={styles.tickerLabel}>Tin đăng bất động sản mới nhất</p>
    <div className={styles.tickerItems}>
      {properties.slice(0, 6).map(property => <Link key={property.id} href={buildProductPath(property)} className={styles.tickerItem}>{property.title}</Link>)}
    </div>
  </section>;
}

export function LocalityLandingFooter({ data, news, latestListings = [] }: { data: LocalityPageData; news?: { path: string; articles: NewsListItem[] } | null; latestListings?: Property[] }) {
  const transaction = data.context.listingType === 'cho_thue' ? 'cho thuê' : 'mua bán';
  return <div id="locality-discovery" className="mx-auto max-w-[1360px] px-4 pb-12 sm:px-8">
    <section className={`${styles.scope} ${styles.summary}`} aria-labelledby="locality-summary" data-testid="locality-summary">
      <h2 id="locality-summary" className={styles.heading}>Tóm tắt {data.place}</h2>
      <p>{data.summary}</p>
      <p className={styles.summaryDate}>Dữ liệu tính tại <LocalityTimestamp value={data.report.computedAt} /></p>
    </section>
    <LocalityDirectory title={`Loại hình ${transaction} tại ${data.place}`} items={data.links.types} summary />
    <LocalityDirectory title="Khám phá theo khoảng giá chào bán" items={data.links.prices} chips />
    <LocalityDirectory title={`Tin ${transaction} theo quận / huyện`} items={data.links.districts} />
    <LocalityDirectory title={`Tin ${transaction} theo phường / xã`} items={data.links.wards} />
    <LocalityListingTicker properties={latestListings} />
    {news && <LocalityNewsSection areaName={data.area.name} newsPath={news.path} articles={news.articles} />}
    <LocalityFaq items={data.faq} />
    {data.reportEvaluation.indexable && <LocalityReportCta title={data.context.title} href={data.context.reportPath} ready computedAt={data.report.computedAt} />}
  </div>;
}

function LocalityReportInsights({ data }: { data: LocalityPageData }) {
  const items = ([
    data.report.counts.sale > 0 ? { title: 'Mua bán nhà đất', count: data.report.counts.sale, text: `Mẫu dữ liệu hiện có ${data.report.counts.sale.toLocaleString('vi-VN')} tin mua bán công khai trong phạm vi này.` } : null,
    data.report.counts.rent > 0 ? { title: 'Cho thuê nhà đất', count: data.report.counts.rent, text: `Mẫu dữ liệu hiện có ${data.report.counts.rent.toLocaleString('vi-VN')} tin cho thuê công khai trong phạm vi này.` } : null,
  ]).filter((item): item is { title: string; count: number; text: string } => Boolean(item));
  if (!items.length) return null;
  return <section className={`${styles.reportInsights} lg:grid-cols-2`} aria-labelledby="locality-report-insights">
    <div className={styles.reportInsightIntro}>
      <h2 id="locality-report-insights" className={styles.heading}>Tổng quan thị trường {data.place}</h2>
      <p>Dữ liệu dưới đây mô tả mẫu tin đang công khai trên hệ thống tại thời điểm tính toán. Các con số không đại diện cho toàn bộ thị trường và không thay thế giá giao dịch thực tế.</p>
    </div>
    <div className={styles.reportInsightCards}>
      {items.map(item => <article key={item.title} className={styles.reportInsightCard}><h3>{item.title}</h3><p>{item.text}</p><span>{item.count.toLocaleString('vi-VN')} tin trong mẫu</span></article>)}
    </div>
  </section>;
}


export function LocalityReportBody({ data }: { data: LocalityPageData }) {
  const { report } = data;
  const ready = data.reportEvaluation.indexable;
  return <div className={`${styles.scope} mx-auto max-w-[1360px] px-4 py-6 sm:px-8 sm:py-10`} data-testid="locality-report">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs">
      <Link href={data.landingPath} className="inline-flex min-h-11 items-center text-sm text-red-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">← Xem tin trong phạm vi này</Link>
      <span className={ready ? 'text-gray-500' : 'text-amber-800'}>{ready ? 'Phân tích mẫu tin hiện có' : 'Chưa đủ dữ liệu phân tích chuyên sâu'}</span>
    </div>
    {!ready ? <section className="rounded-2xl border border-amber-200 border-l-2 border-l-amber-400 bg-amber-50 px-5 py-5">
      <h2 className="text-xl font-medium text-gray-900">Dữ liệu hiện có</h2>
      <p className="mt-3 text-sm leading-6 text-gray-700">Phạm vi này có {report.counts.total} tin công khai, {report.price.sale.count} mẫu giá bán và {report.price.rent.count} mẫu giá thuê hợp lệ. Mẫu hiện tại chưa đáp ứng đầy đủ điều kiện để trình bày báo cáo chuyên sâu; không suy rộng kết quả này ra toàn địa phương.</p>
      <p className="mt-2 text-sm leading-6 text-gray-600">{report.counts.unknownWard} tin chưa xác định phường / xã. Trang chỉ thể hiện dữ liệu hiện có, không bổ sung số liệu giả hoặc lấy số liệu toàn tỉnh thay thế.</p>
      {data.context.listingType && <Link href={`/khu-vuc/${data.area.slug}/thong-tin`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-red-700 hover:underline">Xem riêng báo cáo toàn tỉnh</Link>}
    </section> : <>
      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" aria-labelledby="locality-report-summary">
        <div className={styles.reportSummary}>
          <h2 id="locality-report-summary" className={styles.heading}>Tổng quan dữ liệu {data.place}</h2>
          <p className="mt-3 text-sm leading-6 text-gray-700">{data.summary}</p>
          <p className="mt-3 text-sm leading-6 text-gray-600">Báo cáo mô tả các tin đang công khai trong phạm vi của trang này. Giá chào bán và giá thuê được thống kê riêng, không phải giá giao dịch đã xác nhận hay đại diện cho toàn bộ thị trường.</p>
          <a href="#locality-methodology" className="mt-3 inline-flex min-h-11 items-center text-sm text-red-700 hover:underline">Cách tính và giới hạn dữ liệu →</a>
        </div>
        <aside className={styles.reportAside} aria-label="Phạm vi mẫu báo cáo">
          <LocalityCounts data={data} />
          <p className="mt-4 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-600">{report.price.sale.count} mẫu giá bán · {report.price.rent.count} mẫu giá thuê hợp lệ.</p>
          {report.counts.unknownWard > 0 && <p className="mt-2 text-xs leading-5 text-gray-600">Chưa xác định phường / xã: {report.counts.unknownWard} tin.</p>}
        </aside>
      </section>
      <section aria-labelledby="locality-prices" className={styles.section}>
        <h2 id="locality-prices" className={styles.heading}>Giá chào trong mẫu tin đăng</h2>
        <LocalityPriceTable rows={data.priceRows} />
        <div className="mt-5 grid gap-6 sm:grid-cols-2">{(['sale', 'rent'] as const).filter(kind => report.counts[kind] > 0).map(kind => {
          const stats = report.price[kind];
          const monthly = kind === 'rent';
          return <div key={kind} className={styles.sample}><h3 className="text-base font-medium text-gray-900">{monthly ? 'Mẫu tin cho thuê' : 'Mẫu tin mua bán'}</h3><p className="mt-2 text-sm leading-6 text-gray-600">{monthly ? 'Giá thuê' : 'Giá bán'}: {stats.sampleMet ? `${localityMoney(stats.minVnd, monthly)} – ${localityMoney(stats.maxVnd, monthly)}` : 'Chưa đủ mẫu hiển thị khoảng giá'}. Có {stats.excludedCount} tin không có giá hợp lệ; {stats.perSqmSampleCount} mẫu đủ giá và diện tích để xét đơn giá.</p></div>;
        })}</div>
      </section>
      <LocalityReportInsights data={data} />
      {(() => {
        const wards = data.distributions.find(item => item.title.includes('phường'))?.rows
          .filter(row => row.href)
          .map(row => ({ label: row.label, href: row.href!, count: row.count })) ?? [];
        return <LocalityDirectory title={`Danh sách phường / xã tại ${data.place}`} items={wards} chips />;
      })()}
    </>}
    <section className={styles.methodology} aria-labelledby="locality-methodology">
      <h2 id="locality-methodology" className={styles.heading}>Phương pháp và giới hạn dữ liệu</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-600">
        <li>Chỉ tính tin đang công khai trong đúng giao dịch, địa phương, loại hình hoặc khoảng giá của URL này. Đây là giá chào từ tin đăng, không phải giá giao dịch đã xác nhận.</li>
        <li>Giá bán được quy về đồng từ đơn vị tỷ / triệu. Giá thuê tính theo tháng. Loại giá trống, không dương, không hữu hạn hoặc không rõ đơn vị khỏi mẫu giá; các tin đó vẫn thuộc tổng số tin.</li>
        <li>Trung bình là tổng giá chia số mẫu; trung vị là giá giữa sau khi sắp xếp. Đơn giá trung bình được tính từ giá / diện tích của từng tin. Mỗi chỉ số cần ít nhất 3 mẫu hợp lệ riêng.</li>
        <li>Tin thiếu phường / xã nằm trong nhóm chưa xác định, không được đoán địa chỉ. Các tỷ trọng mô tả mẫu tin trên hệ thống, không mô tả nguồn cung toàn thị trường.</li>
        <li>Số liệu được tính tại thời điểm ghi trên trang và có cache. Việc đọc nhiều trang dữ liệu không phải một giao dịch cơ sở dữ liệu nguyên tử; thay đổi đồng thời có thể tạo chênh lệch giữa hai lần đọc.</li>
      </ul>
    </section>
    <LocalityFaq items={data.faq} title="Câu hỏi về cách đọc báo cáo" />
  </div>;
}
