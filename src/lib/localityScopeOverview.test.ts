import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/screens/ListingsPage.tsx'), 'utf8');

describe('locality scope overview', () => {
  it('selects the aggregate route scope by default for every locality landing', () => {
    expect(source).toContain("const localityScopeGroupKey = localityScope ? `scope:${localityScope.path}` : null;");
    expect(source).toContain('useState<string | null>(localityScopeGroupKey)');
    expect(source).toContain('localityScope?.wardId ? \'ward\' : localityScope?.districtId ? \'district\' : \'area\'');
    expect(source).toContain('label: `Tất cả ${localityScopeLabel}`');
  });

  it('shows the scoped products while preserving child groups for drill-down', () => {
    expect(source).toContain('const visibleLocalityGroups = localityScopeGroup ? [localityScopeGroup, ...localityGroups] : localityGroups;');
    expect(source).toContain('const selectedGroupProperties = scopeOverviewSelected');
    expect(source).toContain('? properties');
    expect(source).toContain('scopeOverviewSelected ? mapProperties');
    expect(source).toContain('aria-label="Xem theo nhóm khu vực"');
  });

  it('drills down exactly one taxonomy level below the current route scope', () => {
    expect(source).toContain("localityScope?.wardId ? null : localityScope?.districtId ? 'ward' : 'district'");
    expect(source).toContain('buildLocalityGroups(mapProperties, localityScope.areaId, localityChildGroupLevel)');
  });

  it('focuses all markers without changing the canonical locality path', () => {
    expect(source).toContain('groupKey === localityScopeGroupKey ? ALL_LOCALITY_GROUPS_FOCUS');
    expect(source).toContain('setSelectedGroupKey(localityScopeGroupKey)');
    expect(source).toContain('preserveLocalityPath(current, href)');
  });
});
