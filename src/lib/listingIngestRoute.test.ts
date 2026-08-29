import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(resolve(process.cwd(), 'app/api/public/listings/route.ts'), 'utf8');
const taxonomy = readFileSync(resolve(process.cwd(), 'src/lib/server/ingestTaxonomy.ts'), 'utf8');

describe('public listing ingest route contract', () => {
  it('đo body bằng UTF-8 bytes và đóng race external_id', () => {
    expect(route).toContain("Buffer.byteLength(raw, 'utf8')");
    expect(route).toContain("error.code === '23505'");
    expect(route).toContain('findExisting(admin, parsed.row.external_id)');
    expect(route).toContain('duplicateResponse(existing)');
  });

  it('retry slug collision có giới hạn và lưu taxonomy canonical', () => {
    expect(route).toContain('MAX_SLUG_ATTEMPTS = 5');
    expect(route).toContain('city: taxonomy.city');
    expect(route).toContain('district: taxonomy.district');
  });
});

describe('ingest taxonomy contract', () => {
  it('không dùng wildcard ilike và fail-closed khi DB lỗi', () => {
    expect(taxonomy).not.toContain(".ilike('name'");
    expect(taxonomy).toContain(".eq(mode, expected)");
    expect(taxonomy).toContain('TaxonomyLookupUnavailableError');
    expect(taxonomy).toContain('if (bySlug.error) throw');
    expect(taxonomy).toContain('if (byName.error) throw');
  });

  it('resolve area và property type song song', () => {
    expect(taxonomy).toContain('await Promise.all([');
  });
});
