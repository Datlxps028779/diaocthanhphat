import { describe, expect, it } from 'vitest';
import { EVENTS } from './analytics';
import { crmMeasurement, measurementBreakdown, measurementFunnel, type MeasurementEventRow } from './measurement';

describe('measurement', () => {
  const rows: MeasurementEventRow[] = [
    { eventName: EVENTS.LISTING_VIEW, eventCount: 10, activeUsers: 8, dimensions: { listingId: 'p1', source: 'organic' } },
    { eventName: EVENTS.CONTACT_OPEN, eventCount: 4, activeUsers: 4, dimensions: { listingId: 'p1', source: 'organic' } },
    { eventName: EVENTS.LEAD_SUBMIT, eventCount: 2, activeUsers: 2, dimensions: { listingId: 'p1', source: 'organic' } },
    { eventName: EVENTS.LISTING_VIEW, eventCount: 5, activeUsers: 5, dimensions: { listingId: 'p2', source: 'paid' } },
    { eventName: EVENTS.LEAD_SUBMIT, eventCount: 1, activeUsers: 1, dimensions: { listingId: 'p2', source: 'paid' } },
  ];

  it('aggregates funnel stages and leaves unavailable stages distinguishable from zero', () => {
    expect(measurementFunnel(rows)).toEqual({
      view: 15,
      cta: 4,
      lead: 3,
      viewToCtaRate: 4 / 15,
      ctaToLeadRate: 3 / 4,
      hasData: true,
    });
    expect(measurementFunnel([
      { eventName: EVENTS.LISTING_VIEW, eventCount: 0, activeUsers: 0 },
    ])).toEqual({
      view: 0,
      cta: null,
      lead: null,
      viewToCtaRate: null,
      ctaToLeadRate: null,
      hasData: true,
    });
  });

  it('groups only by dimensions present in the source rows', () => {
    expect(measurementBreakdown(rows, 'listingId')).toEqual([
      { dimension: 'listingId', value: 'p1', view: 10, cta: 4, lead: 2, viewToCtaRate: 0.4, ctaToLeadRate: 0.5, hasData: true },
      { dimension: 'listingId', value: 'p2', view: 5, cta: null, lead: 1, viewToCtaRate: null, ctaToLeadRate: null, hasData: true },
    ]);
    expect(measurementBreakdown([
      { eventName: EVENTS.LISTING_VIEW, eventCount: 10, activeUsers: 8 },
    ], 'source')).toEqual([]);
  });

  it('summarizes CRM assignment, activity, SLA and timestamp-backed follow-up evidence', () => {
    expect(crmMeasurement([
      { assigneeCount: 1, assignmentIds: ['u1'], activityCount: 2, followUpAt: '2026-09-04T10:00:00Z', status: 'contacted', createdAt: '2026-09-01T10:00:00Z', lastActivityAt: '2026-09-04T09:00:00Z' },
      { assigneeCount: 0, assignmentIds: [], activityCount: 0, followUpAt: null, status: 'new', createdAt: '2026-09-05T08:00:00Z', lastActivityAt: null },
      { assigneeCount: 2, assignmentIds: ['u1', 'u2'], activityCount: 1, followUpAt: '2026-09-06T10:00:00Z', status: 'contacted', createdAt: '2026-09-05T09:00:00Z', lastActivityAt: '2026-09-05T09:30:00Z' },
    ], new Date('2026-09-05T10:00:00Z'))).toEqual({
      totalLeads: 3,
      assignedLeads: 2,
      unassignedLeads: 1,
      leadsWithActivity: 2,
      leadsWithFollowUp: 2,
      overdueFollowUps: 1,
      hasFollowUpData: true,
      sla: { overdue: 2, dueSoon: 0, total: 2 },
      assigneeWorkload: { u1: 2, u2: 1 },
      hasAssignmentData: true,
    });
    expect(crmMeasurement([
      { assigneeCount: 0, activityCount: 1, followUpAt: 'not-a-date', assignmentIds: [], lastActivityAt: 'not-a-date' },
    ], new Date('2026-09-05T10:00:00Z'))).toMatchObject({
      leadsWithActivity: 0,
      leadsWithFollowUp: 0,
      overdueFollowUps: null,
      sla: null,
      assigneeWorkload: {},
      hasAssignmentData: true,
    });
  });
});
