import { describe, expect, it } from 'vitest';
import {
  canUseDetailInteraction,
  leadActionFeedback,
  type DetailInteraction,
} from './propertyDetailActions';

describe('canUseDetailInteraction', () => {
  const interactions: DetailInteraction[] = ['contact', 'callback', 'phone_reveal'];

  it('cho phép các thao tác chuyển đổi ở trang công khai', () => {
    for (const interaction of interactions) {
      expect(canUseDetailInteraction(false, interaction)).toBe(true);
    }
  });

  it('chặn mọi thao tác chuyển đổi trong preview', () => {
    for (const interaction of interactions) {
      expect(canUseDetailInteraction(true, interaction)).toBe(false);
    }
  });
});

describe('leadActionFeedback', () => {
  it('không bịa thành công khi form đang rỗi hoặc đang gửi', () => {
    expect(leadActionFeedback('idle')).toBeNull();
    expect(leadActionFeedback('pending')).toBeNull();
  });

  it('nói rõ lỗi có thể thử lại và thành công chỉ khi mutation thành công', () => {
    expect(leadActionFeedback('error')).toContain('thử lại');
    expect(leadActionFeedback('success')).toContain('Đã ghi nhận');
  });
});
