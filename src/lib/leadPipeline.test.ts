import { describe, it, expect } from 'vitest';
import {
  PIPELINE_STAGES, stageMeta, isTerminal, stageIndex, funnelCounts,
  type StageKey,
} from './leadPipeline';

describe('leadPipeline — pipeline chăm sóc 6 giai đoạn BĐS', () => {
  it('PIPELINE_STAGES có đủ 7 key theo đúng thứ tự phễu', () => {
    expect(PIPELINE_STAGES.map(s => s.key)).toEqual([
      'new', 'contacted', 'nurturing', 'viewing', 'negotiating', 'won', 'lost',
    ]);
  });

  it('mỗi giai đoạn có label + color + type không rỗng', () => {
    for (const s of PIPELINE_STAGES) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.color.trim().length).toBeGreaterThan(0);
      expect(['open', 'won', 'lost']).toContain(s.type);
    }
  });

  describe('stageMeta', () => {
    it('trả metadata đúng cho key hợp lệ', () => {
      expect(stageMeta('new').label).toBe('Mới');
      expect(stageMeta('won').type).toBe('won');
      expect(stageMeta('lost').type).toBe('lost');
    });
    it('key lạ → fallback về giai đoạn "new" (an toàn cho dữ liệu cũ)', () => {
      expect(stageMeta('unknown_xyz' as StageKey).key).toBe('new');
    });
  });

  describe('isTerminal', () => {
    it('won và lost là terminal; còn lại open', () => {
      expect(isTerminal('won')).toBe(true);
      expect(isTerminal('lost')).toBe(true);
      expect(isTerminal('new')).toBe(false);
      expect(isTerminal('nurturing')).toBe(false);
      expect(isTerminal('negotiating')).toBe(false);
    });
  });

  describe('stageIndex', () => {
    it('trả vị trí theo thứ tự phễu', () => {
      expect(stageIndex('new')).toBe(0);
      expect(stageIndex('negotiating')).toBe(4);
      expect(stageIndex('lost')).toBe(6);
    });
    it('key lạ → -1', () => {
      expect(stageIndex('bogus' as StageKey)).toBe(-1);
    });
  });

  describe('funnelCounts', () => {
    it('đếm số lead theo từng giai đoạn (đủ mọi key, kể cả 0)', () => {
      const leads = [
        { status: 'new' }, { status: 'new' }, { status: 'contacted' },
        { status: 'won' }, { status: 'lost' },
      ];
      const c = funnelCounts(leads);
      expect(c.new).toBe(2);
      expect(c.contacted).toBe(1);
      expect(c.nurturing).toBe(0);
      expect(c.won).toBe(1);
      expect(c.lost).toBe(1);
    });
    it('danh sách rỗng → tất cả 0', () => {
      const c = funnelCounts([]);
      expect(Object.values(c).every(n => n === 0)).toBe(true);
      expect(Object.keys(c)).toHaveLength(7);
    });
  });
});
