import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// JSX trong component biên dịch theo runtime cổ điển (React.createElement) nên
// component cần React có mặt trong phạm vi module lúc chạy.
beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());

const { submitLead, track } = vi.hoisted(() => ({ submitLead: vi.fn(), track: vi.fn() }));

vi.mock('@/lib/api', () => ({ submitLead }));
vi.mock('@/lib/cms', () => ({ useSetting: (_key: string, fallback: string) => fallback }));
vi.mock('@/lib/analytics', () => ({ track, EVENTS: { CONTACT_OPEN: 'contact_open', LEAD_SUBMIT: 'lead_submit' } }));
vi.mock('lucide-react', () => {
  const Icon = () => React.createElement('svg', { 'aria-hidden': 'true' });
  return { X: Icon, Phone: Icon, MessageSquare: Icon, ChevronDown: Icon, ShieldCheck: Icon, Clock: Icon };
});

import { ContactModal, CONTACT_AUTOFOCUS_SELECTOR, isOutsidePanel, isSubmitCurrent } from './ContactModal';

const PROPERTY = { id: 'tin-1', title: 'Nhà 3 tầng mặt tiền trung tâm', price: 3.2, price_unit: 'tỷ' };

function render(overrides: Partial<React.ComponentProps<typeof ContactModal>> = {}) {
  return renderToStaticMarkup(
    <ContactModal property={PROPERTY} onClose={() => {}} {...overrides} />,
  );
}

/** Số phần tử mở ra trong một chuỗi HTML (dùng đếm phần tử render đúng một lần). */
function count(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length;
}

describe('ContactModal — vỏ hộp thoại native', () => {
  it('dùng <dialog> native và tiêu đề gắn bằng aria-labelledby', () => {
    const html = render();
    expect(html).toContain('<dialog');
    const titleId = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(titleId).toBeTruthy();
    expect(html).toContain(`id="${titleId}"`);
  });

  it('nút đóng có nhãn tiếng Việt và không nhỏ hơn 44px', () => {
    const html = render();
    expect(html).toContain('aria-label="Đóng biểu mẫu liên hệ"');
    expect(html).toContain('h-11');
    expect(html).toContain('w-11');
  });

  it('bố cục mobile là bottom sheet, desktop là hộp thoại giữa màn hình cuộn trong', () => {
    const html = render();
    const panel = html.match(/data-testid="contact-modal-panel"[^>]*class="([^"]*)"/)?.[1] ?? '';
    const dialog = html.match(/<dialog[^>]*class="([^"]*)"/)?.[1] ?? '';
    // Mobile: neo đáy, bo góc trên, cao tối đa 90% và cuộn bên trong.
    expect(panel).toContain('bottom-0');
    expect(panel).toContain('inset-x-0');
    expect(panel).toContain('rounded-t-3xl');
    expect(panel).toContain('max-h-[90dvh]');
    expect(panel).toContain('overflow-y-auto');
    expect(panel).toContain('overscroll-contain');
    // Desktop: hộp thoại giữa màn hình (dialog là flex container), panel trở về
    // relative + inset-auto để nút X absolute neo vào PANEL chứ không phải dialog
    // phủ kín màn hình.
    expect(dialog).toContain('sm:flex');
    expect(dialog).toContain('sm:items-center');
    expect(dialog).toContain('sm:justify-center');
    expect(panel).toContain('sm:relative');
    expect(panel).toContain('sm:inset-auto');
    expect(panel).not.toContain('sm:static');
    expect(panel).toContain('sm:mx-auto');
    expect(panel).toContain('sm:max-w-md');
    expect(panel).toContain('sm:rounded-2xl');
  });

  it('nút X neo vào panel (panel là containing block), không phải dialog toàn màn hình', () => {
    const html = render();
    const panel = html.match(/data-testid="contact-modal-panel"[^>]*class="([^"]*)"/)?.[1] ?? '';
    const closeButton = html.match(/data-testid="contact-modal-close"[^>]*class="([^"]*)"/)?.[1] ?? '';
    // Nút X định vị absolute → cần tổ tiên gần nhất có position làm mốc.
    expect(closeButton).toContain('absolute');
    expect(panel).toMatch(/\bsm:relative\b/);
    expect(panel).not.toMatch(/\bsm:static\b/);
  });

  it('ô nhập là 16px trên mobile để iOS không tự phóng to, 14px ở desktop', () => {
    const html = render();
    expect(html).toContain('text-base');
    expect(html).toContain('sm:text-sm');
  });

  it('mọi ô nhập đều có nhãn liên kết, nhãn thật nằm trong DOM', () => {
    const html = render();
    for (const label of ['Họ và tên (bắt buộc)', 'Số điện thoại (bắt buộc)', 'Khu vực quan tâm', 'Nội dung cần tư vấn (không bắt buộc)']) {
      expect(html).toContain(label);
    }
    expect((html.match(/<label\b/g) ?? []).length).toBe(4);
    for (const match of html.matchAll(/for="([^"]+)"/g)) expect(html).toContain(`id="${match[1]}"`);
  });

  it('tải trước không chạm tới mạng: hệ quả chỉ chạy ở client', () => {
    render();
    expect(submitLead).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it('không dựng gì khi chưa chọn tin', () => {
    expect(renderToStaticMarkup(<ContactModal property={null} onClose={() => {}} />)).toBe('');
  });

  it('không lặp lại id giữa hai lần render trong cùng cây', () => {
    const html = `${render()}`;
    const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g)).map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ContactModal — nhánh xem trước', () => {
  const preview = () => render({ preview: true });

  it('nói rõ bản xem trước không nhận yêu cầu tư vấn', () => {
    const html = preview();
    expect(html).toContain('Bản xem trước không nhận yêu cầu tư vấn');
    expect(html).toContain('Khi tin được xuất bản');
  });

  it('không dựng biểu mẫu và không lộ giá/tên tin qua form', () => {
    const html = preview();
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain(PROPERTY.title);
  });

  it('vẫn giữ vỏ hộp thoại có thể đóng được', () => {
    const html = preview();
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-label="Đóng bản xem trước"');
    expect(html).toContain('Đóng');
  });

  it('không hứa hẹn thời gian phản hồi khi không có biểu mẫu', () => {
    expect(preview()).not.toContain('Mục tiêu phản hồi');
  });
});

describe('ContactModal — nhánh thường', () => {
  beforeEach(() => {
    submitLead.mockReset();
    track.mockReset();
  });

  it('dựng đúng một biểu mẫu với đủ bốn ô nhập bắt buộc/tuỳ chọn', () => {
    const html = render();
    expect(count(html, 'form')).toBe(1);
    expect(count(html, 'input')).toBe(2);
    expect(count(html, 'select')).toBe(1);
    expect(count(html, 'textarea')).toBe(1);
  });

  it('giữ nguyên ràng buộc số điện thoại Việt Nam', () => {
    const html = render();
    expect(html).toContain('inputMode="tel"');
    expect(html).toContain('pattern="(\\+?84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}"');
    expect(html).toContain('Nhập số di động Việt Nam, ví dụ 0901234567');
  });

  it('hiển thị tên tin và giá qua bộ định dạng dùng chung', () => {
    const html = render();
    expect(html).toContain(PROPERTY.title);
    expect(html).toContain('3.2 tỷ');
  });

  it('chỉ nêu mục tiêu phản hồi từ cấu hình, không hứa bảo đảm', () => {
    const html = render();
    expect(html).toContain('Mục tiêu phản hồi 30 phút');
    expect(html).toContain('Hỏi thêm thông tin trước khi quyết định');
    expect(html).not.toMatch(/cam kết|bảo đảm|100%/i);
  });

  it('không lộ trạng thái thành công/lỗi hay thông tin liên hệ ở lần dựng đầu', () => {
    const html = render();
    expect(html).not.toContain('Đã nhận thông tin!');
    expect(html).not.toContain('Có lỗi xảy ra');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('Tư vấn viên sẽ liên hệ');
  });

  it('nút gửi nêu rõ hành động và trạng thái chờ', () => {
    const html = render();
    expect(html).toContain('Gửi yêu cầu tư vấn');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain('Đang gửi...');
  });

  it('không thay đổi tin đầu vào khi dựng', () => {
    const property = { ...PROPERTY };
    const before = JSON.stringify(property);
    renderToStaticMarkup(<ContactModal property={property} onClose={() => {}} />);
    expect(JSON.stringify(property)).toBe(before);
  });
});

describe('ContactModal — focus ban đầu', () => {
  it('chọn ô họ tên làm đích focus, không phải nút đóng', () => {
    // showModal() mặc định focus control đầu tiên trong DOM — đó là nút X. Selector
    // này phải trỏ vào ô nhập để đè lại hành vi mặc định đó.
    expect(CONTACT_AUTOFOCUS_SELECTOR).toBe("input[name='full_name']");
    expect(CONTACT_AUTOFOCUS_SELECTOR).not.toContain('button');
  });

  it('đích focus khớp đúng một ô nhập có thật trong markup', () => {
    const html = render();
    expect(html).toContain('name="full_name"');
    expect((html.match(/name="full_name"/g) ?? []).length).toBe(1);
    expect(html.indexOf('name="full_name"')).toBeGreaterThan(html.indexOf('data-testid="contact-modal-close"'));
  });

  it('nhánh xem trước không có ô nhập nên không đặt đích focus', () => {
    const html = render({ preview: true });
    expect(html).not.toContain('name="full_name"');
  });
});

describe('ContactModal — bấm ra ngoài panel', () => {
  const box = { left: 100, right: 500, top: 200, bottom: 600 };

  it('điểm trong khung panel thì KHÔNG đóng', () => {
    expect(isOutsidePanel({ x: 300, y: 400 }, box)).toBe(false);
    expect(isOutsidePanel({ x: 100, y: 200 }, box)).toBe(false);
    expect(isOutsidePanel({ x: 500, y: 600 }, box)).toBe(false);
  });

  it('điểm ngoài khung panel theo cả bốn phía thì đóng', () => {
    expect(isOutsidePanel({ x: 99, y: 400 }, box)).toBe(true);
    expect(isOutsidePanel({ x: 501, y: 400 }, box)).toBe(true);
    expect(isOutsidePanel({ x: 300, y: 199 }, box)).toBe(true);
    expect(isOutsidePanel({ x: 300, y: 601 }, box)).toBe(true);
  });

  it('so với panel chứ không phải dialog toàn màn hình', () => {
    // Góc trên-trái màn hình nằm trong dialog (0,0 → 1440x900) nhưng ngoài panel:
    // nếu so với dialog thì cú bấm này bị coi là "trong" và modal không bao giờ đóng.
    const dialogBox = { left: 0, right: 1440, top: 0, bottom: 900 };
    expect(isOutsidePanel({ x: 10, y: 10 }, dialogBox)).toBe(false);
    expect(isOutsidePanel({ x: 10, y: 10 }, box)).toBe(true);
  });
});

describe('ContactModal — chống kết quả gửi cũ', () => {
  it('chỉ nhận kết quả khi thế hệ gửi chưa đổi', () => {
    expect(isSubmitCurrent(3, 3)).toBe(true);
  });

  it('bỏ kết quả khi khách đã đổi tin hoặc đóng modal trong lúc chờ', () => {
    expect(isSubmitCurrent(3, 4)).toBe(false);
    expect(isSubmitCurrent(3, 5)).toBe(false);
  });
});
