import { describe, expect, it } from 'vitest';
import { ADVISOR_PRIVATE_PROPERTY_FIELDS, ADVISOR_PROPERTY_SELECT } from './properties';

describe('AI Search property projection', () => {
  it('does not request private or editorial fields for advisor results', () => {
    for (const field of ADVISOR_PRIVATE_PROPERTY_FIELDS) {
      expect(ADVISOR_PROPERTY_SELECT).not.toContain(field);
    }
  });

  it('retains only fields needed to render a public advisor card', () => {
    expect(ADVISOR_PROPERTY_SELECT).toContain('id');
    expect(ADVISOR_PROPERTY_SELECT).toContain('title');
    expect(ADVISOR_PROPERTY_SELECT).toContain('price');
    expect(ADVISOR_PROPERTY_SELECT).toContain('image_url');
    expect(ADVISOR_PROPERTY_SELECT).toContain('areas(id,name,slug)');
    expect(ADVISOR_PROPERTY_SELECT).toContain('property_types(id,name,slug)');
  });
});
