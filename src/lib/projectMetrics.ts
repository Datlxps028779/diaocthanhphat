export type ProjectMetricKey = 'projects' | 'areas';

export type ProjectMetric = {
  key: ProjectMetricKey;
  value: number;
  label: string;
};

export function buildProjectMetrics(projectCount: number, areaCount: number): ProjectMetric[] {
  return [
    { key: 'projects', value: projectCount, label: 'Dự án' },
    { key: 'areas', value: areaCount, label: 'Tỉnh thành' },
  ];
}
