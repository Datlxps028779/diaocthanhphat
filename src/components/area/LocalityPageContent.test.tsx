import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildLocalityPageData, buildLocalitySchemas } from '@/lib/localityPageData';
import { LocalityHeader, LocalityLandingFooter, LocalityReportBody, LocalitySubnav } from './LocalityPageContent';
import { LocalityArticleDate } from './LocalityNewsSection';
import type { NewsListItem } from '@/lib/supabase';

const snapshot = {
  computedAt: '2026-09-16T06:00:00Z',
  areas: [{ id: 'a', slug: 'binh-duong', name: 'Bình Dương', description: 'Mô tả biên tập', admin_note: '<script>unsafe()</script>' }],
  districts: [{ id: 'd', area_id: 'a', slug: 'binh-duong-di-an', name: 'Dĩ An' }],
  wards: [{ id: 'w', district_id: 'd', slug: 'tan-dong-hiep', name: 'Tân Đông Hiệp' }],
  propertyTypes: [{ id: 't', slug: 'nha-pho', name: 'Nhà phố' }],
  rows: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, title: `Nhà phố ${i}`, area_id: 'a', district_id: 'd', ward_id: i ? 'w' : null, property_type_id: 't', listing_type: 'cho_thue', price: null, price_unit: null, price_per_month: i + 4, area_sqm: 100 })),
};

describe('server-rendered locality content', () => {
  it('keeps public editorial text only on province overview and escapes markup', () => {
    const province = buildLocalityPageData('/khu-vuc/binh-duong', snapshot)!;
    const html = renderToStaticMarkup(<LocalityHeader data={province} />);
    expect(html).toContain('Mô tả biên tập');
    expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;');
    expect(html).not.toContain('<script>unsafe()');
    const report = buildLocalityPageData('/khu-vuc/binh-duong/thong-tin', snapshot)!;
    expect(renderToStaticMarkup(<LocalityHeader data={report} />)).not.toContain('unsafe()');
    expect(new Set(report.breadcrumbs.map(item => item.path)).size).toBe(report.breadcrumbs.length);
  });
  it('renders snapshot counts and source dates without animated or invented values', () => {
    const province = buildLocalityPageData('/khu-vuc/binh-duong', snapshot)!;
    const articles = [{ id: 'news-1', slug: 'bai-thu-nhat', title: 'Tin thật', created_at: '2026-09-16T06:00:00Z' }] as NewsListItem[];
    const html = renderToStaticMarkup(<LocalityHeader data={province} newsPath="/khu-vuc/binh-duong/tin-tuc" newsArticles={articles} />);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.match(/<dd\b[^>]*>(\d+)<\/dd>/g)?.map(value => value.replace(/<[^>]+>/g, ''))).toEqual(['6', '0', '6']);
    expect(html).toContain('dateTime="2026-09-16T06:00:00Z"');
    expect(html).toContain('href="/tin-tuc/bai-thu-nhat"');
    expect(html).toContain('16/09/2026');
    expect(html).not.toContain('vừa xong');
    expect(renderToStaticMarkup(<LocalityArticleDate value="invalid" />)).toBe('');
  });
  it('renders monthly statistics, methodology, and exact return link on a ready rental report', () => {
    const data = buildLocalityPageData('/cho-thue/binh-duong/thong-tin', snapshot)!;
    expect(data.reportEvaluation.indexable).toBe(true);
    const html = renderToStaticMarkup(<LocalityReportBody data={data} />);
    expect(html).toContain('/m²/tháng');
    expect(html).toContain('Phương pháp và giới hạn dữ liệu');
    expect(html).toContain('href="/cho-thue/binh-duong"');
    expect(html).toContain('Chưa xác định phường / xã');
  });
  it('does not substitute province statistics for thin geography', () => {
    const data = buildLocalityPageData('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep/thong-tin', snapshot)!;
    const html = renderToStaticMarkup(<LocalityReportBody data={data} />);
    expect(html).toContain('Phạm vi này có 0 tin công khai');
    expect(html).toContain('Chưa đủ dữ liệu phân tích chuyên sâu');
    expect(html).not.toContain('<table');
    expect(html).toContain('href="/khu-vuc/binh-duong/thong-tin"');
  });
  it('uses a compact news header without province editorial notes or property counts', () => {
    const province = buildLocalityPageData('/khu-vuc/binh-duong', snapshot)!;
    const html = renderToStaticMarkup(<LocalityHeader data={province} activePath="/khu-vuc/binh-duong/tin-tuc" newsPath="/khu-vuc/binh-duong/tin-tuc" titleOverride="Tin tức Bình Dương" />);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('Tin tức Bình Dương');
    expect(html).not.toContain('Mô tả biên tập');
    expect(html).not.toContain('unsafe()');
    expect(html).not.toContain('Tin đăng trong phạm vi');
    expect(html).not.toContain('aria-label="Đi tới nội dung"');
    expect(html).toContain('aria-current="page"');
  });
  it('keeps ready report figures in a wide, responsive composition', () => {
    const data = buildLocalityPageData('/cho-thue/binh-duong/thong-tin', snapshot)!;
    const html = renderToStaticMarkup(<LocalityReportBody data={data} />);
    expect(html).toContain('max-w-[1360px]');
    expect(html).toContain('Phạm vi mẫu báo cáo');
    expect(html).toContain('lg:grid-cols-2');
    expect(html).toContain('tableFrame');
    expect(html).toContain('locality-report-insights');
    expect(html).not.toContain('listings-surface');
    expect(html).not.toContain('locality-map-rail');
  });
  it('renders every FAQ answer in server HTML and uses the same schema questions', () => {
    const data = buildLocalityPageData('/khu-vuc/binh-duong', snapshot)!;
    const html = renderToStaticMarkup(<LocalityLandingFooter data={data} />);
    const faq = buildLocalitySchemas(data).find(schema => schema?.['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string }> };
    expect(faq.mainEntity.map(item => item.name)).toEqual(data.faq.map(item => item.question));
    for (const item of data.faq) expect(html).toContain(item.question);
    expect(html).toContain('<details');
    expect(html).toContain('href="/khu-vuc/binh-duong/thong-tin"');
  });
  it('renders a single locality sub-navigation outside the hero tabs', () => {
    const data = buildLocalityPageData('/khu-vuc/binh-duong', snapshot)!;
    const html = renderToStaticMarkup(<LocalitySubnav data={data} newsPath="/khu-vuc/binh-duong/tin-tuc" />);
    expect(html).toContain('data-testid="locality-subnav"');
    expect(html).toContain('Bất động sản');
    expect(html).toContain('Dự án');
    expect(html).toContain('Đăng tin');
    expect(html).toContain('href="/khu-vuc/binh-duong/tin-tuc"');
  });
});
