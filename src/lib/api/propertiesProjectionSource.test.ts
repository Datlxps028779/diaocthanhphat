import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/lib/api/properties.ts'), 'utf8');

function functionBody(signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} should exist`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nexport ', start + signature.length);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('property projection reader boundary', () => {
  it('uses the public projection for public property readers', () => {
    for (const signature of [
      'function buildPropertyQuery(',
      'export async function getPublicPropertiesByIds(',
      'export async function getAllPropertiesForMap(',
      'export async function getComps(',
      'export async function getPropertyOptions(',
      'export async function getFeaturedProperties(',
      'export async function getHotProperties(',
      'export async function getRecentProperties(',
      'export async function getPropertyById(',
      'export async function getPropertyByIdOrSlug(',
      'export async function getRelatedProperties(',
    ]) {
      expect(functionBody(signature), signature).toContain(".from('public_properties')");
    }
    expect(source).toContain("supabase.from('public_properties').select(propertySelect");
    expect(source).toContain(".from('public_properties')\n    .select(ADVISOR_PROPERTY_SELECT)");
  });

  it('keeps admin reads and writers on the base properties table', () => {
    for (const signature of [
      'export function buildAdminPropertyQuery(',
      'export async function adminGetAllProperties(',
      'export async function createProperty(',
      'export async function updateProperty(',
      'export async function deleteProperty(',
      'export async function bulkUpdateProperties(',
      'export async function bulkDeleteProperties(',
    ]) {
      expect(functionBody(signature), signature).toContain(".from('properties')");
    }
  });

  it('does not put contact fields in the public select constants', () => {
    const publicSelect = source.match(/export const PUBLIC_PROPERTY_SELECT = '([^']+)'/)?.[1] ?? '';
    const advisorSelect = source.match(/export const ADVISOR_PROPERTY_SELECT = '([^']+)'/)?.[1] ?? '';
    expect(publicSelect).not.toMatch(/contact_(?:name|phone|zalo)/);
    expect(advisorSelect).not.toMatch(/contact_(?:name|phone|zalo)/);
  });
});
