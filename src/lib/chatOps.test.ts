import { describe, it, expect } from 'vitest';
import { activeChatCountByStaff, chatMemberLabel, pickChatAssignee, type ChatCapacityMember } from './chatOps';

const member = (o: Partial<ChatCapacityMember> & { id: string }): ChatCapacityMember => ({
  display_name: null,
  phone: null,
  role: 'staff',
  maxActiveSessions: 3,
  isAvailable: true,
  lastAssignedAt: null,
  ...o,
});

describe('chatOps — routing phiên chat theo capacity nhân viên', () => {
  it('đếm số phiên active theo từng nhân viên', () => {
    expect(activeChatCountByStaff([{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u1' }])).toEqual({ u1: 2, u2: 1 });
  });

  it('chọn nhân viên dưới capacity và ít phiên active nhất', () => {
    const result = pickChatAssignee(
      [member({ id: 'u1' }), member({ id: 'u2' })],
      [{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u2' }],
    );
    expect(result).toEqual({ userId: 'u2', adminAttention: false, reason: 'assigned' });
  });

  it('khi số phiên bằng nhau thì xoay vòng theo lastAssignedAt cũ hơn', () => {
    const result = pickChatAssignee(
      [
        member({ id: 'u1', lastAssignedAt: '2026-07-15T10:00:00Z' }),
        member({ id: 'u2', lastAssignedAt: '2026-07-15T09:00:00Z' }),
      ],
      [{ user_id: 'u1' }, { user_id: 'u2' }],
    );
    expect(result.userId).toBe('u2');
  });

  it('bỏ qua nhân viên không available', () => {
    const result = pickChatAssignee(
      [member({ id: 'u1', isAvailable: false }), member({ id: 'u2' })],
      [],
    );
    expect(result.userId).toBe('u2');
  });

  it('tất cả nhân viên full phiên thì trả adminAttention', () => {
    const result = pickChatAssignee(
      [member({ id: 'u1', maxActiveSessions: 1 }), member({ id: 'u2', maxActiveSessions: 1 })],
      [{ user_id: 'u1' }, { user_id: 'u2' }],
    );
    expect(result).toEqual({ userId: null, adminAttention: true, reason: 'all_staff_full' });
  });

  it('không có nhân viên available thì báo admin', () => {
    const result = pickChatAssignee([member({ id: 'u1', isAvailable: false })], []);
    expect(result).toEqual({ userId: null, adminAttention: true, reason: 'no_available_staff' });
  });

  it('dùng lại nhãn nhân viên hiện có', () => {
    expect(chatMemberLabel(member({ id: 'abcdef123', display_name: 'Lan' }))).toBe('Lan');
    expect(chatMemberLabel(member({ id: 'abcdef123', display_name: ' ', phone: '0909' }))).toBe('0909');
  });
});
