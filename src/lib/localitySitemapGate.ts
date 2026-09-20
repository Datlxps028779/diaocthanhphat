import type { LocalityPageContext } from './localityPageContext';
import { buildLocalitySitemapCandidates, resolveLocalityPageContext } from './localityPageContext';
import { evaluateLocalitySeo, getLocalityReport, type LocalityReport } from './localityReport';
import type { LocalitySnapshot } from './server/localitySnapshot';

export type LocalitySitemapSnapshot = LocalitySnapshot;
export type LocalityGateResult = {
  context: LocalityPageContext;
  path: string;
  indexable: boolean;
  sitemapCandidate: boolean;
  reasons: string[];
  matchingCount: number;
  scopeVersion: string;
  dataVersion: string;
};

export function evaluateLocalityGateForPath(
  pathname: string,
  snapshot: LocalitySnapshot,
  computedAt = snapshot.computedAt,
): LocalityGateResult | null {
  const context = resolveLocalityPageContext(pathname, snapshot);
  if (!context) return null;
  const report = getLocalityReport(snapshot.rows, context, computedAt);
  const area = snapshot.areas.find(candidate => candidate.id === context.areaId);
  const evaluation = evaluateLocalitySeo(context, report, { hasDescription: Boolean(area?.description?.trim()) });
  return {
    context, path: context.path,
    indexable: evaluation.indexable, sitemapCandidate: evaluation.indexable,
    reasons: evaluation.reasons, matchingCount: report.counts.total,
    scopeVersion: evaluation.scopeVersion, dataVersion: evaluation.dataVersion,
  };
}

// Audit giữ cả lý do noindex; sitemap chỉ lấy những URL đã qua cùng gate.
export function buildLocalityEvaluations(snapshot: LocalitySnapshot): LocalityGateResult[] {
  const results: LocalityGateResult[] = [];
  for (const context of buildLocalitySitemapCandidates(snapshot)) {
    for (const path of [context.path, context.reportPath]) {
      const result = evaluateLocalityGateForPath(path, snapshot);
      if (result) results.push(result);
    }
  }
  return results;
}

export type LocalitySitemapCandidate = {
  path: string;
  matchingCount: number;
  lastModified: string | null;
};

export function buildLocalityCandidatesFromSnapshot(snapshot: LocalitySnapshot): LocalitySitemapCandidate[] {
  return buildLocalityEvaluations(snapshot)
    .filter(result => result.sitemapCandidate)
    .map(result => ({
      path: result.path,
      matchingCount: result.matchingCount,
      // computedAt là thời điểm đọc, không phải thời điểm nội dung thay đổi.
      lastModified: null,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export type { LocalityReport };
