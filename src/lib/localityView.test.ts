import { describe, expect, it } from 'vitest';
import { buildLocalityNavigation, localityListingsPath } from './localityView';

const context = {
  path: '/mua-ban/binh-duong/thong-tin',
  listingType: 'mua_ban' as const,
  areaSlug: 'binh-duong',
  landingPath: '/mua-ban/binh-duong',
  reportPath: '/mua-ban/binh-duong/thong-tin',
};

describe('locality navigation', () => {
  it('keeps listing and report destinations canonical across modes', () => {
    expect(localityListingsPath(context)).toBe('/mua-ban/binh-duong');
    expect(buildLocalityNavigation(context, { newsPath: '/khu-vuc/binh-duong/tin-tuc' }).map(tab => tab.href)).toEqual([
      '/mua-ban/binh-duong',
      '/khu-vuc/binh-duong/tin-tuc',
      '/mua-ban/binh-duong/thong-tin',
    ]);
    expect(buildLocalityNavigation(context).find(tab => tab.id === 'report')?.active).toBe(true);
  });

  it('fails closed when no locality news path is available', () => {
    const news = buildLocalityNavigation({
      ...context,
      path: '/mua-ban/binh-duong',
    }).find(tab => tab.id === 'news');
    expect(news).toMatchObject({ disabled: true, active: false });
    expect(news?.href).toBeUndefined();
  });

  it('marks the news tab active on the locality news route', () => {
    expect(buildLocalityNavigation({
      ...context,
      path: '/khu-vuc/binh-duong/tin-tuc',
    }, { newsPath: '/khu-vuc/binh-duong/tin-tuc' }).find(tab => tab.id === 'news')).toMatchObject({ active: true, disabled: false });
  });

  it('uses the province sale landing for a general khu-vuc context', () => {
    expect(localityListingsPath({
      listingType: null,
      areaSlug: 'binh-duong',
      landingPath: '/khu-vuc/binh-duong',
    })).toBe('/mua-ban/binh-duong');
  });
});
