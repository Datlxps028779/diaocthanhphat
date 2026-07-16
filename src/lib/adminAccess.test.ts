import { describe, it, expect } from 'vitest';
import { canAccessPanel, visibleTabs, STAFF_TABS, type Role } from './adminAccess';

describe('adminAccess — phân quyền truy cập admin panel theo role', () => {
  describe('canAccessPanel', () => {
    it('admin và staff vào được panel; user và null thì không', () => {
      expect(canAccessPanel('admin')).toBe(true);
      expect(canAccessPanel('staff')).toBe(true);
      expect(canAccessPanel('user')).toBe(false);
      expect(canAccessPanel(null)).toBe(false);
      expect(canAccessPanel(undefined)).toBe(false);
    });
  });

  describe('visibleTabs', () => {
    it('admin thấy tất cả tab', () => {
      const tabs = visibleTabs('admin');
      expect(tabs).toContain('dashboard');
      expect(tabs).toContain('users');
      expect(tabs).toContain('settings');
      expect(tabs).toContain('leads');
      expect(tabs).toContain('nurture');
      expect(tabs.length).toBeGreaterThanOrEqual(19);
    });

    it('staff thấy CRM khách hàng + phiên chat + duyệt tin đăng', () => {
      expect(visibleTabs('staff')).toEqual(['leads', 'chat-sessions', 'user-listings']);
    });

    it('staff KHÔNG thấy khu nhạy cảm', () => {
      const tabs = visibleTabs('staff');
      for (const forbidden of ['users', 'settings', 'cms', 'backup', 'dashboard', 'properties', 'news', 'projects', 'nurture']) {
        expect(tabs).not.toContain(forbidden);
      }
    });

    it('user (không vào được panel) → không tab nào', () => {
      expect(visibleTabs('user')).toEqual([]);
      expect(visibleTabs(null)).toEqual([]);
    });

    it('STAFF_TABS khớp tập tab staff', () => {
      expect(STAFF_TABS).toEqual(['leads', 'chat-sessions', 'user-listings']);
    });
  });

  describe('type Role', () => {
    it('nhận đúng 3 giá trị', () => {
      const roles: Role[] = ['user', 'staff', 'admin'];
      expect(roles).toHaveLength(3);
    });
  });
});
