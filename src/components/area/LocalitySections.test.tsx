import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: any) => React.createElement('a', { href, ...props }, children) }));
import { LocalityFaq, LocalityDirectory, LocalityReportCta, LocalityPriceTable } from './LocalitySections';

describe('locality server content', () => {
  it('includes every FAQ answer in server HTML with keyboard-native details', () => {
    const html = renderToStaticMarkup(<LocalityFaq items={[{ question: 'Có bao nhiêu tin bán?', answer: 'Có 12 tin bán trong phạm vi này.' }]} />);
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('Có 12 tin bán trong phạm vi này.');
    expect(html).toContain('md:grid-cols-2');
  });
  it('keeps all child links in SSR even when directory is collapsed', () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ label: `Phường ${i}`, href: `/mua-ban/a/d/phuong-xa/w-${i}`, count: i }));
    const html = renderToStaticMarkup(<LocalityDirectory title="Phường / xã" items={items} />);
    expect(html).toContain('/mua-ban/a/d/phuong-xa/w-14');
    expect(html).toContain('Xem thêm');
  });
  it.each([{ summary: true }, { chips: true }, {}])('keeps exact inventory and destinations across directory presentations %j', props => {
    const items = Array.from({ length: 14 }, (_, i) => ({ label: `Lựa chọn ${i}`, href: `/mua-ban/a/loai-${i}`, count: i + 31 }));
    const html = renderToStaticMarkup(<LocalityDirectory title="Khám phá" items={items} {...props} />);
    expect(html.match(/<a\b/g)).toHaveLength(14);
    expect(html.match(/<details\b/g)).toHaveLength(1);
    for (const item of items) {
      expect(html).toContain(`href="${item.href}"`);
      expect(html).toContain(`${item.count} tin`);
    }
    expect(html).toContain('Xem thêm 2 lựa chọn');
  });
  it('does not render empty directories or FAQ', () => {
    expect(renderToStaticMarkup(<LocalityDirectory title="Trống" items={[]} chips />)).toBe('');
    expect(renderToStaticMarkup(<LocalityFaq items={[]} />)).toBe('');
  });
  it('does not promise detailed analysis for a thin scope', () => {
    const html = renderToStaticMarkup(<LocalityReportCta title="Bình Dương" href="/khu-vuc/binh-duong/thong-tin" ready={false} computedAt="2026-09-16T06:00:00Z" />);
    expect(html).toContain('Xem dữ liệu hiện có');
    expect(html).not.toContain('Xem phân tích chi tiết');
    expect(html).toContain('2026-09-16T06:00:00Z');
  });
  it('labels monthly rent and distinguishes price samples from inventory', () => {
    const html = renderToStaticMarkup(<LocalityPriceTable rows={[{ label: 'Cho thuê', monthly: true, inventory: 9, samples: 3, mean: 10000000, median: 9000000, perSqm: 100000, sqmSamples: 3 }]} />);
    expect(html).toContain('/tháng');
    expect(html).toContain('/m²/tháng');
    expect(html).toContain('Mẫu giá');
    expect(html).not.toContain('Infinity');
  });
});
