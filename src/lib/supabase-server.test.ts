import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/lib/supabase-server.ts'), 'utf8');

describe('serverGetListings cache boundary', () => {
  it('opts the live inventory query out of the Next Data Cache', () => {
    const helper = source.match(
      /export async function serverGetListings\([\s\S]+?\n}\n\nexport async function serverGetAreas/,
    )?.[0] ?? '';

    expect(source).toContain("unstable_noStore as noStore");
    expect(helper).toContain('noStore();');
    expect(helper).toContain("select(PROPERTY_SELECT, { count: 'exact' })");
    expect(helper).toContain('total: count ?? 0');
  });
});
