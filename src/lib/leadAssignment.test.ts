import { describe, it, expect } from 'vitest';
import {
  memberLabel, assigneesOf, assignmentPlan,
  type TeamMember, type AssignableLead,
} from './leadAssignment';

const mk = (o: Partial<TeamMember> & { id: string }): TeamMember => ({
  display_name: null, phone: null, role: 'staff', ...o,
});

describe('leadAssignment — nhãn NV + đồng phụ trách + chia đều theo user_id', () => {
  describe('memberLabel', () => {
    it('ưu tiên display_name', () => {
      expect(memberLabel(mk({ id: 'u1', display_name: 'Nguyễn A', phone: '0900' }))).toBe('Nguyễn A');
    });
    it('display_name rỗng/space → dùng phone', () => {
      expect(memberLabel(mk({ id: 'u1', display_name: '  ', phone: '0909' }))).toBe('0909');
    });
    it('không tên/không phone → NV-<6 ký tự đầu id>', () => {
      expect(memberLabel(mk({ id: 'abcdef1234', display_name: null, phone: null }))).toBe('NV-abcdef');
    });
  });

  describe('assigneesOf', () => {
    const roster: TeamMember[] = [
      mk({ id: 'u1', display_name: 'An' }),
      mk({ id: 'u2', display_name: 'Bình' }),
    ];
    it('map user_id của lead → {id,label}, giữ thứ tự, resolve tên từ roster', () => {
      const lead: AssignableLead = { lead_assignments: [{ user_id: 'u2' }, { user_id: 'u1' }] };
      expect(assigneesOf(lead, roster)).toEqual([
        { id: 'u2', label: 'Bình' },
        { id: 'u1', label: 'An' },
      ]);
    });
    it('user_id không có trong roster vẫn hiện (nhãn NV-… từ chính id)', () => {
      const lead: AssignableLead = { lead_assignments: [{ user_id: 'zzzzzz9999' }] };
      expect(assigneesOf(lead, roster)).toEqual([{ id: 'zzzzzz9999', label: 'NV-zzzzzz' }]);
    });
    it('lead không có mảng assignments → rỗng', () => {
      expect(assigneesOf({}, roster)).toEqual([]);
      expect(assigneesOf({ lead_assignments: [] }, roster)).toEqual([]);
    });
  });

  describe('assignmentPlan (chia đều lead chưa gán cho NV theo user_id)', () => {
    it('luân phiên user_id theo vòng, trả {lead_id,user_id}', () => {
      expect(assignmentPlan(['l1', 'l2', 'l3', 'l4'], ['u1', 'u2'])).toEqual([
        { lead_id: 'l1', user_id: 'u1' },
        { lead_id: 'l2', user_id: 'u2' },
        { lead_id: 'l3', user_id: 'u1' },
        { lead_id: 'l4', user_id: 'u2' },
      ]);
    });
    it('lẻ → NV đầu nhận nhiều hơn 1', () => {
      const out = assignmentPlan(['l1', 'l2', 'l3'], ['u1', 'u2']);
      expect(out.filter(x => x.user_id === 'u1').length).toBe(2);
      expect(out.filter(x => x.user_id === 'u2').length).toBe(1);
    });
    it('thiếu lead hoặc thiếu NV → rỗng', () => {
      expect(assignmentPlan([], ['u1'])).toEqual([]);
      expect(assignmentPlan(['l1'], [])).toEqual([]);
    });
  });
});
