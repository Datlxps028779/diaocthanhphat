import { EVENT_FUNNEL_STAGE, type AnalyticsEventName, type MeasurementFunnelStage } from './analytics';
import { countSlaStates, type SlaCounts, type SlaLead } from './leadSla';

export type MeasurementDimension = 'listingId' | 'source' | 'channel';

export type MeasurementEventRow = {
  eventName: AnalyticsEventName;
  eventCount: number;
  activeUsers: number;
  dimensions?: Partial<Record<MeasurementDimension, string>>;
};

export type MeasurementStageCount = number | null;

export type MeasurementFunnelSummary = {
  view: MeasurementStageCount;
  cta: MeasurementStageCount;
  lead: MeasurementStageCount;
  viewToCtaRate: number | null;
  ctaToLeadRate: number | null;
  hasData: boolean;
};

export type MeasurementBreakdownRow = MeasurementFunnelSummary & {
  dimension: MeasurementDimension;
  value: string;
};

export type CrmMeasurementLead = {
  assigneeCount: number;
  activityCount: number;
  followUpAt: string | null;
  assignmentIds?: string[];
  status?: SlaLead['status'];
  createdAt?: string;
  lastActivityAt?: string | null;
};

export type CrmMeasurementSummary = {
  totalLeads: number;
  assignedLeads: number;
  unassignedLeads: number;
  leadsWithActivity: number;
  leadsWithFollowUp: number;
  overdueFollowUps: number | null;
  hasFollowUpData: boolean;
  sla: SlaCounts | null;
  assigneeWorkload: Record<string, number>;
  hasAssignmentData: boolean;
};

function finiteCount(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function stageCounts(rows: MeasurementEventRow[]): Record<MeasurementFunnelStage, number | null> {
  const counts: Record<MeasurementFunnelStage, number | null> = {
    view: null,
    cta: null,
    lead: null,
    supporting: null,
  };
  for (const row of rows) {
    const stage = EVENT_FUNNEL_STAGE[row.eventName];
    counts[stage] = (counts[stage] ?? 0) + finiteCount(row.eventCount);
  }
  return counts;
}

function conversionRate(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from <= 0) return null;
  return to / from;
}

function summarizeEventRows(rows: MeasurementEventRow[]): MeasurementFunnelSummary {
  const counts = stageCounts(rows);
  return {
    view: counts.view,
    cta: counts.cta,
    lead: counts.lead,
    viewToCtaRate: conversionRate(counts.view, counts.cta),
    ctaToLeadRate: conversionRate(counts.cta, counts.lead),
    hasData: rows.length > 0,
  };
}

export function measurementFunnel(rows: MeasurementEventRow[]): MeasurementFunnelSummary {
  return summarizeEventRows(rows);
}

export function measurementBreakdown(
  rows: MeasurementEventRow[],
  dimension: MeasurementDimension,
): MeasurementBreakdownRow[] {
  const groups = new Map<string, MeasurementEventRow[]>();
  for (const row of rows) {
    const value = row.dimensions?.[dimension]?.trim();
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([value, group]) => ({ dimension, value, ...summarizeEventRows(group) }))
    .sort((a, b) => (
      (b.lead ?? -1) - (a.lead ?? -1)
      || (b.cta ?? -1) - (a.cta ?? -1)
      || a.value.localeCompare(b.value)
    ));
}

function validTimestamp(value: string | null | undefined): boolean {
  return Boolean(value && !Number.isNaN(new Date(value).getTime()));
}

export function crmMeasurement(
  leads: CrmMeasurementLead[],
  now: Date,
): CrmMeasurementSummary {
  let assignedLeads = 0;
  let leadsWithActivity = 0;
  let leadsWithFollowUp = 0;
  let overdueFollowUps = 0;
  let hasFollowUpData = false;
  const assigneeWorkload: Record<string, number> = {};
  const hasAssignmentData = leads.length > 0 && leads.every(lead => Array.isArray(lead.assignmentIds));
  const slaLeads: SlaLead[] = [];

  for (const lead of leads) {
    if (lead.assigneeCount > 0) assignedLeads += 1;
    const assignmentIds = Array.isArray(lead.assignmentIds) ? [...new Set(lead.assignmentIds.filter(Boolean))] : [];
    for (const assigneeId of assignmentIds) {
      assigneeWorkload[assigneeId] = (assigneeWorkload[assigneeId] ?? 0) + 1;
    }

    const hasActivity = lead.activityCount > 0
      && (!('lastActivityAt' in lead) || validTimestamp(lead.lastActivityAt));
    if (hasActivity) leadsWithActivity += 1;

    if (validTimestamp(lead.followUpAt)) {
      hasFollowUpData = true;
      leadsWithFollowUp += 1;
      if (new Date(lead.followUpAt as string).getTime() <= now.getTime()) overdueFollowUps += 1;
    }

    if (lead.status && typeof lead.createdAt === 'string') {
      slaLeads.push({
        status: lead.status,
        created_at: lead.createdAt,
        follow_up_at: lead.followUpAt,
        last_activity_at: lead.lastActivityAt,
      });
    }
  }

  const sla = leads.length > 0 && slaLeads.length === leads.length
    ? countSlaStates(slaLeads, now)
    : null;

  return {
    totalLeads: leads.length,
    assignedLeads,
    unassignedLeads: leads.length - assignedLeads,
    leadsWithActivity,
    leadsWithFollowUp,
    overdueFollowUps: hasFollowUpData ? overdueFollowUps : null,
    hasFollowUpData,
    sla,
    assigneeWorkload,
    hasAssignmentData,
  };
}
