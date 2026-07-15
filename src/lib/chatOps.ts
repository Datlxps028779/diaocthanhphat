import { memberLabel, type TeamMember } from './leadAssignment';

export interface ChatCapacityMember extends TeamMember {
  maxActiveSessions?: number | null;
  isAvailable?: boolean | null;
  lastAssignedAt?: string | null;
}

export interface ActiveChatAssignment {
  user_id: string;
}

export interface ChatRoutingResult {
  userId: string | null;
  adminAttention: boolean;
  reason: 'assigned' | 'no_available_staff' | 'all_staff_full';
}

export interface ChatAlertCounts {
  active: number;
  attention: number;
  availableSlots: number;
}

export function chatMemberLabel(member: Pick<TeamMember, 'id' | 'display_name' | 'phone'>): string {
  return memberLabel(member);
}

export function activeChatCountByStaff(assignments: ActiveChatAssignment[]): Record<string, number> {
  return assignments.reduce<Record<string, number>>((acc, a) => {
    acc[a.user_id] = (acc[a.user_id] ?? 0) + 1;
    return acc;
  }, {});
}

function timeRank(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

export function pickChatAssignee(members: ChatCapacityMember[], activeAssignments: ActiveChatAssignment[]): ChatRoutingResult {
  const counts = activeChatCountByStaff(activeAssignments);
  const available = members.filter(m => m.role === 'staff' && m.isAvailable !== false);
  if (available.length === 0) return { userId: null, adminAttention: true, reason: 'no_available_staff' };

  const candidates = available
    .map(m => ({
      member: m,
      active: counts[m.id] ?? 0,
      max: m.maxActiveSessions ?? 3,
    }))
    .filter(x => x.active < x.max)
    .sort((a, b) =>
      a.active - b.active ||
      timeRank(a.member.lastAssignedAt) - timeRank(b.member.lastAssignedAt) ||
      a.member.id.localeCompare(b.member.id),
    );

  if (candidates.length === 0) return { userId: null, adminAttention: true, reason: 'all_staff_full' };
  return { userId: candidates[0].member.id, adminAttention: false, reason: 'assigned' };
}

export function chatAlertCounts(sessions: { status: string; admin_attention?: boolean }[], availableSlots: number): ChatAlertCounts {
  return {
    active: sessions.filter(s => s.status === 'active').length,
    attention: sessions.filter(s => s.admin_attention).length,
    availableSlots,
  };
}
