import { describe, expect, it } from 'vitest';
import { buildProjectMetrics } from './projectMetrics';

describe('project page metrics', () => {
  it('uses exact runtime counts, including zero', () => {
    expect(buildProjectMetrics(0, 0)).toEqual([
      { key: 'projects', value: 0, label: 'Dự án' },
      { key: 'areas', value: 0, label: 'Tỉnh thành' },
    ]);
  });

  it('does not manufacture scale claims when data is available', () => {
    expect(buildProjectMetrics(3, 2)).toEqual([
      { key: 'projects', value: 3, label: 'Dự án' },
      { key: 'areas', value: 2, label: 'Tỉnh thành' },
    ]);
  });
});
