import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const areaListing = read('src/lib/areaListingPage.tsx');
const localityOverview = read('src/lib/server/localityPage.tsx');
const localityNews = read('app/khu-vuc/[slug]/tin-tuc/page.tsx');

describe('locality sub-navigation coverage', () => {
  it('uses the shared subnav on transaction landing and report routes', () => {
    expect(areaListing).toContain('const localitySubnav = <LocalitySubnav');
    expect(areaListing).toContain('localitySubnav={localitySubnav}');
    expect(areaListing.match(/localitySubnav=/g)).toHaveLength(2);
  });

  it('keeps the shared subnav on overview and locality-news routes', () => {
    expect(localityOverview).toContain('const localitySubnav = <LocalitySubnav');
    expect(localityOverview).toContain('localitySubnav={localitySubnav}');
    expect(localityNews).toContain('localitySubnav={<LocalitySubnav');
    expect(localityNews).toContain('activePath={newsPath}');
  });

  it('derives news availability from real public locality news', () => {
    expect(areaListing).toContain('serverGetLocalityNews');
    expect(areaListing).toContain('news.available && news.indexable');
    expect(areaListing).toContain('buildLocalityGeoAreaAllowlist(data.area.name)');
  });
});
