import { describe, expect, it } from 'vitest';
import {
  EMPTY_NEWS_LOCATION,
  filterNewsNeighborhoods,
  locationLabel,
  resolveNewsLocation,
  selectNewsArea,
  selectNewsDistrict,
  selectNewsNeighborhood,
  selectNewsWard,
  type NewsLocationTaxonomy,
} from './newsLocationSelection';

const taxonomy: NewsLocationTaxonomy = {
  areas: [
    { id: 'bd', name: 'Bình Dương', description: null, image_url: null, slug: 'binh-duong', order_index: 1, created_at: '2026-01-01' },
    { id: 'bp', name: 'Bình Phước', description: null, image_url: null, slug: 'binh-phuoc', order_index: 2, created_at: '2026-01-01' },
  ],
  districts: [
    { id: 'di-an', area_id: 'bd', name: 'Dĩ An', slug: 'binh-duong-di-an', order_index: 1, created_at: '2026-01-01' },
    { id: 'dong-xoai', area_id: 'bp', name: 'Đồng Xoài', slug: 'binh-phuoc-dong-xoai', order_index: 1, created_at: '2026-01-01' },
  ],
  wards: [
    { id: 'an-phu', district_id: 'di-an', name: 'An Phú', slug: 'binh-duong-di-an-an-phu', order_index: 1, created_at: '2026-01-01' },
  ],
  neighborhoods: [
    { id: 'song-than', name: 'Sóng Thần', slug: 'song-than', area_id: 'bd', district_id: 'di-an', ward_id: 'an-phu', description: null, image_url: null, order_index: 1, created_at: '2026-01-01' },
    { id: 'bd-wide', name: 'Khu công nghiệp Bình Dương', slug: 'kcn-binh-duong', area_id: 'bd', district_id: null, ward_id: null, description: null, image_url: null, order_index: 2, created_at: '2026-01-01' },
  ],
};

describe('news location selection', () => {
  it('clears dependent choices when selecting a higher administrative level', () => {
    expect(selectNewsArea('bp')).toEqual({ area_id: 'bp', district_id: '', ward_id: '', neighborhood_id: '' });
    expect(selectNewsDistrict({ area_id: 'bd', district_id: 'di-an', ward_id: 'an-phu', neighborhood_id: 'song-than' }, 'di-an'))
      .toEqual({ area_id: 'bd', district_id: 'di-an', ward_id: '', neighborhood_id: '' });
    expect(selectNewsWard({ area_id: 'bd', district_id: 'di-an', ward_id: 'an-phu', neighborhood_id: 'song-than' }, 'an-phu'))
      .toEqual({ area_id: 'bd', district_id: 'di-an', ward_id: 'an-phu', neighborhood_id: '' });
  });

  it('resolves the full structured hierarchy from a selected neighborhood', () => {
    const selected = selectNewsNeighborhood(EMPTY_NEWS_LOCATION, 'song-than', taxonomy);
    expect(selected).toEqual({ area_id: 'bd', district_id: 'di-an', ward_id: 'an-phu', neighborhood_id: 'song-than' });
    expect(locationLabel(resolveNewsLocation(selected, taxonomy))).toBe('Sóng Thần');
  });

  it('keeps province-wide neighborhoods selectable without inventing child levels', () => {
    expect(selectNewsNeighborhood(EMPTY_NEWS_LOCATION, 'bd-wide', taxonomy)).toEqual({
      area_id: 'bd', district_id: '', ward_id: '', neighborhood_id: 'bd-wide',
    });
  });

  it('filters neighborhoods using only real structured hierarchy', () => {
    expect(filterNewsNeighborhoods({ area_id: 'bd', district_id: 'di-an', ward_id: '', neighborhood_id: '' }, taxonomy).map(item => item.id))
      .toEqual(['song-than']);
    expect(filterNewsNeighborhoods({ area_id: 'bd', district_id: '', ward_id: '', neighborhood_id: '' }, taxonomy).map(item => item.id))
      .toEqual(['song-than', 'bd-wide']);
  });
});
