import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/screens/ListingsPage.tsx'), 'utf8');

describe('locality scope overview', () => {
  it('starts area and district landings in the ward-group chooser', () => {
    expect(source).toContain("const localityScopeGroupKey = localityScope ? `scope:${localityScope.path}` : null;");
    expect(source).toContain('const initialLocalityGroupKey = localityScope?.wardId ? localityScopeGroupKey : null;');
    expect(source).toContain('useState<string | null>(initialLocalityGroupKey)');
    expect(source).toContain("localityScope?.wardId ? 'ward' : localityScope?.districtId ? 'district' : 'area'");
  });

  it('keeps the aggregate scope available after a group has been selected', () => {
    expect(source).toContain('const allLocalityGroups = localityScopeGroup ? [localityScopeGroup, ...localityGroups] : localityGroups;');
    expect(source).toContain('const visibleLocalityGroups = selectedGroupKey ? allLocalityGroups : localityGroups;');
    expect(source).toContain('const selectedGroupProperties = scopeOverviewSelected');
    expect(source).toContain('scopeOverviewSelected ? mapProperties');
    expect(source).toContain('aria-label="Xem theo nhóm khu vực"');
  });

  it('groups area and district maps by ward before showing products', () => {
    expect(source).toContain("localityScope?.wardId ? null : 'ward'");
    expect(source).toContain('buildLocalityGroups(mapProperties, localityScope.areaId, localityChildGroupLevel)');
    expect(source).toContain("groupLabel={localityChildGroupLevel === 'ward' ? 'Nhóm phường / xã' : 'Nhóm khu vực'}");
  });

  it('resets to chooser state without changing the canonical locality path', () => {
    expect(source).toContain('const nextGroupKey = localityScope?.wardId ? localityScopeGroupKey : null;');
    expect(source).toContain('setSelectedGroupKey(nextGroupKey)');
    expect(source).toContain('preserveLocalityPath(current, href)');
  });
});
