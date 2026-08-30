import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_MIN,
  LISTING_TITLE_MAX,
  hasMeaningfulDescription,
  parseOptionalNonNegativeInteger,
  parseOptionalPositiveDecimal,
  validateListingForm,
} from './listingValidation';

const base = {
  listing_type: 'mua_ban' as const,
  title: 'Bán nhà phố',
  price: '1.5', price_per_month: '', loan_support: '', area_sqm: '80', bedrooms: '3', bathrooms: '2',
  city: 'Bình Dương', property_type_id: 'house', contact_name: 'Nguyễn Văn A', contact_phone: '0901234567',
  latitude: '', longitude: '', image_url: 'https://example.com/house.jpg', images: [],
  description: 'Nhà phố gần chợ, trường học và các tiện ích thiết yếu. Pháp lý rõ ràng, khu dân cư an ninh.',
};

describe('listingValidation', () => {
  it('rejects negative and fractional room values', () => {
    expect(parseOptionalNonNegativeInteger('-2')).toBeNull();
    expect(parseOptionalNonNegativeInteger('2.5')).toBeNull();
    expect(validateListingForm({ ...base, bedrooms: '-1' })).toHaveProperty('bedrooms');
    expect(validateListingForm({ ...base, bathrooms: '2.5' })).toHaveProperty('bathrooms');
  });

  it('requires positive area when entered', () => {
    expect(parseOptionalPositiveDecimal('-80')).toBeNull();
    expect(validateListingForm({ ...base, area_sqm: '-80' })).toHaveProperty('area_sqm');
  });

  it('enforces title and meaningful description limits', () => {
    expect(validateListingForm({ ...base, title: 'x'.repeat(LISTING_TITLE_MAX + 1) })).toHaveProperty('title');
    expect(hasMeaningfulDescription('<p>   </p>')).toBe(false);
    expect(hasMeaningfulDescription('x'.repeat(DESCRIPTION_MIN))).toBe(true);
  });

  it('requires an image and description when quality gate is enabled', () => {
    const errors = validateListingForm({ ...base, image_url: '', description: 'Mô tả ngắn' }, { includeQualityGate: true });
    expect(errors.images).toBeDefined();
    expect(errors.description).toBeDefined();
  });

  it('keeps FAQ optional by design', () => {
    const errors = validateListingForm(base, { includeQualityGate: true });
    expect(errors.faq).toBeUndefined();
  });
});
