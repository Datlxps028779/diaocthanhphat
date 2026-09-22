import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { escapeHtml, serializePropertyCardPopup } from './propertyCardPopup';
import { UNKNOWN_CARD_POSTER, type PropertyCardModel } from '../../lib/propertyCardModel';

function baseModel(overrides: Partial<PropertyCardModel> = {}): PropertyCardModel {
  return {
    id: 'p-1',
    href: '/mua-ban/di-an/nha-di-an-abc-pr123',
    navSlug: 'nha-di-an-abc',
    title: 'Nhà Dĩ An 3 tỷ',
    price: '3 tỷ',
    pricePerSqm: '≈ 35,3 triệu/m²',
    transaction: 'Mua bán',
    typeLabel: 'Nhà riêng',
    areaLabel: '85 m²',
    roomLabels: ['5 phòng ngủ', '3 phòng tắm'],
    legalLabel: 'Sổ hồng',
    address: 'Dĩ An, Bình Dương',
    postedLabel: 'Đăng ngày 18/09/2026',
    postedAt: '2026-09-18T00:00:00.000Z',
    poster: {
      name: UNKNOWN_CARD_POSTER,
      avatarUrl: null,
      href: null,
      identified: false,
    },
    imageCount: 0,
    images: [],
    ...overrides,
  };
}

describe('escapeHtml', () => {
  it('escape đủ 5 ký tự nguy hiểm', () => {
    expect(escapeHtml(`<a href="x" onx='y'>&`)).toBe('&lt;a href=&quot;x&quot; onx=&#39;y&#39;&gt;&amp;');
  });
});

describe('serializePropertyCardPopup', () => {
  it('escape title và address — không để HTML thô lọt vào popup', () => {
    const html = serializePropertyCardPopup(
      baseModel({ title: '<img src=x onerror=alert(1)>', address: '<b>Dĩ An</b>' }),
    );
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;Dĩ An&lt;/b&gt;');
  });

  it('giữ nguyên data-nav-id và data-nav-slug để addMarkers vẫn bind được', () => {
    const html = serializePropertyCardPopup(baseModel({ id: 'prop-9', navSlug: 'slug-9' }));
    expect(html).toContain('data-nav-id="prop-9"');
    expect(html).toContain('data-nav-slug="slug-9"');
  });

  it('data-nav-slug rỗng khi tin chưa có slug (router fallback về id)', () => {
    const html = serializePropertyCardPopup(baseModel({ navSlug: null }));
    expect(html).toContain('data-nav-slug=""');
  });

  it('escape navSlug khi chứa ký tự phá attribute', () => {
    const html = serializePropertyCardPopup(baseModel({ navSlug: '/x" onmouseover="alert(1)' }));
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain('&quot;');
  });

  it('loại ảnh có scheme nguy hiểm (javascript:/data:) — không render <img>', () => {
    const html = serializePropertyCardPopup(baseModel({ images: ['javascript:alert(1)'], imageCount: 1 }));
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).not.toContain('<img src="javascript');
  });

  it('render ảnh an toàn khi URL hợp lệ', () => {
    const html = serializePropertyCardPopup(baseModel({ images: ['/hinh-anh/nha.jpg'], imageCount: 1 }));
    expect(html).toContain('src="/hinh-anh/nha.jpg"');
  });

  it('hiện nhãn dùng chung khi poster chưa xác định, không bịa tên', () => {
    const html = serializePropertyCardPopup(baseModel());
    expect(html).toContain(UNKNOWN_CARD_POSTER);
    expect(html).not.toContain('Người đăng ẩn danh');
  });

  it('luôn ghi rõ nhãn vai trò "Người đăng" phía trên tên', () => {
    const unknown = serializePropertyCardPopup(baseModel());
    const named = serializePropertyCardPopup(
      baseModel({ poster: { name: 'Nguyễn Văn A', avatarUrl: null, href: null, identified: true } }),
    );
    for (const html of [unknown, named]) {
      expect(html).toContain('Người đăng');
    }
    // Nhãn vai trò phải đứng trước tên trong cùng khối.
    expect(named.indexOf('Người đăng')).toBeLessThan(named.indexOf('Nguyễn Văn A'));
    expect(unknown.indexOf('Người đăng')).toBeLessThan(unknown.indexOf(UNKNOWN_CARD_POSTER));
  });

  it('hiện tên thật khi poster đã xác định và không tạo link rỗng khi href null', () => {
    const html = serializePropertyCardPopup(
      baseModel({ poster: { name: 'Nguyễn Văn A', avatarUrl: null, href: null, identified: true } }),
    );
    expect(html).toContain('Nguyễn Văn A');
    expect(html).not.toContain('<a href=""');
  });

  it('bọc link khi href đúng dạng đường dẫn hồ sơ người đăng', () => {
    const html = serializePropertyCardPopup(
      baseModel({
        poster: { name: 'Nguyễn Văn A', avatarUrl: null, href: '/nguoi-dang-tin/nguyen-van-a', identified: true },
      }),
    );
    expect(html).toContain('href="/nguoi-dang-tin/nguyen-van-a"');
  });

  it('escape href hợp lệ chứa ký tự đặc biệt của slug đã encode', () => {
    const html = serializePropertyCardPopup(
      baseModel({
        poster: { name: 'A', avatarUrl: null, href: '/nguoi-dang-tin/a%20b', identified: true },
      }),
    );
    expect(html).toContain('href="/nguoi-dang-tin/a%20b"');
  });

  it('TỪ CHỐI href ngoài allowlist hồ sơ người đăng (escape không đủ)', () => {
    const rejected = [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.com/nguoi-dang-tin/a',
      'https://evil.com/nguoi-dang-tin/a',
      '/nguoi-dang-tin/../../admin',
      '/nguoi-dang-tin/',
      '/nguoi-dang-tin',
      '/nguoi-dang-tin/a/b',
      '/nguoi-dang-tin/a?x=1',
      '/nguoi-dang-tin/a%zz',
      '/admin/users',
      '',
    ];
    for (const href of rejected) {
      const html = serializePropertyCardPopup(
        baseModel({ poster: { name: 'Nguyễn Văn A', avatarUrl: null, href, identified: true } }),
      );
      expect(html, `phải từ chối href: ${href}`).not.toContain(`href="${href}`);
      expect(html, `phải render div cho href: ${href}`).toContain('Nguyễn Văn A');
    }
    // Không có href nào bị đưa nguyên văn vào output.
    const html = serializePropertyCardPopup(
      baseModel({
        poster: { name: 'A', avatarUrl: null, href: 'javascript:alert(1)', identified: true },
      }),
    );
    expect(html).not.toContain('javascript:');
  });

  it('nhận cả giá trị giao dịch thô cho_thue lẫn nhãn đã bản địa hoá', () => {
    expect(serializePropertyCardPopup(baseModel({ transaction: 'cho_thue' }))).toContain('Cho thuê');
    expect(serializePropertyCardPopup(baseModel({ transaction: 'Cho thuê' }))).toContain('#1d4ed8');
    expect(serializePropertyCardPopup(baseModel({ transaction: 'mua_ban' }))).toContain('Mua bán');
  });

  it('KHÔNG biến "Bất động sản" (chưa rõ giao dịch) thành Mua bán', () => {
    const unknownCases = ['Bất động sản', '', 'khac_loai_gi_do'];
    for (const transaction of unknownCases) {
      const html = serializePropertyCardPopup(baseModel({ transaction }));
      expect(html, `transaction: ${transaction}`).toContain('Bất động sản');
      expect(html, `transaction: ${transaction}`).not.toContain('Mua bán');
      expect(html, `transaction: ${transaction}`).not.toContain('#b91c1c');
      expect(html, `transaction: ${transaction}`).toContain('#4b5563');
    }
  });

  it('provides an image fallback without executable HTML attributes', () => {
    const html = serializePropertyCardPopup(baseModel({ images: ['/hinh-anh/nha.jpg'], imageCount: 1 }));
    expect(html).toContain('data-card-image');
    expect(html).toContain('data-card-fallback hidden');
    expect(html).toContain('Ảnh chưa có sẵn');
    expect(html).not.toContain('onerror=');
    expect(html).not.toContain('font-size:11px;color:#9ca3af');
  });

  it('khung nội dung cuộn chặn theo % chiều cao khung nhìn', () => {
    const html = serializePropertyCardPopup(baseModel({}));
    expect(html).toContain('max-height:min(160px,25vh)');
    expect(html).not.toContain('max-height:320px;');
  });

  it('giữ CTA bên ngoài vùng thông tin cuộn để luôn thao tác được', () => {
    const html = serializePropertyCardPopup(baseModel({}));
    expect(html.indexOf('overflow-y:auto')).toBeLessThan(html.indexOf('</div>\n\n      <div style="padding:8px 12px 12px'));
    expect(html.indexOf('padding:8px 12px 12px')).toBeLessThan(html.indexOf('data-nav-id'));
  });

  it('ẩn dải specs khi không có diện tích lẫn phòng', () => {
    const html = serializePropertyCardPopup(baseModel({ areaLabel: '', roomLabels: [] }));
    expect(html).not.toContain('85 m²');
    expect(html).not.toContain('phòng ngủ');
  });

  it('thẻ div mở/đóng cân bằng', () => {
    const html = serializePropertyCardPopup(baseModel({ images: ['/a.jpg'], imageCount: 3 }));
    const opens = (html.match(/<div/g) || []).length;
    const closes = (html.match(/<\/div>/g) || []).length;
    expect(opens).toBe(closes);
  });
});

/**
 * Popup do Leaflet tiêm vào DOM nằm ngoài tầm với của React/Tailwind, nên bề rộng và
 * vùng chạm của nút đóng phải được khoá bằng test: serializer khai báo bề rộng nào thì
 * PropertyMap.bindPopup phải khai báo đúng bề rộng đó.
 */
describe('popup khớp bề rộng với bindPopup của PropertyMap', () => {
  const mapSource = readFileSync(resolve(process.cwd(), 'src/components/PropertyMap.tsx'), 'utf8');

  it('serializer dùng bề rộng co giãn thay vì cố định 240px', () => {
    const html = serializePropertyCardPopup(baseModel({}));
    expect(html).toContain('width:100%;max-width:240px');
    expect(html).not.toMatch(/style="width:240px/);
    // ...nhưng vẫn phải chừa chỗ cho nút đóng 44x44 ở góc trên-phải.
    expect(html).toContain('top:8px;right:44px');
  });

  it('bật auto-pan và keep-in-view để popup không che hoặc tràn map rail', () => {
    expect(mapSource).toContain('autoPan: true');
    expect(mapSource).toContain('keepInView: true');
    expect(mapSource).toContain('autoPanPaddingBottomRight: [72, 72]');
  });

  it('preserves the inline content width measured by Leaflet', () => {
    const contentRule = mapSource.match(/\.leaflet-popup-content\s*\{([^}]*)\}/)?.[1];
    expect(contentRule).toBeDefined();
    expect(contentRule).not.toMatch(/\bwidth\s*:/);
  });

  it('bindPopup khai báo maxWidth bằng đúng 240px của serializer', () => {
    const serializerMax = serializePropertyCardPopup(baseModel({})).match(/max-width:(\d+)px/)?.[1];
    const bindMax = mapSource.match(/bindPopup\([\s\S]*?maxWidth:\s*(\d+)/)?.[1];
    expect(serializerMax, 'serializer should declare a max width').toBe('240');
    expect(bindMax, 'bindPopup should declare maxWidth').toBe(serializerMax);
  });
});

describe('map result panels', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/screens/ListingsPage.tsx'), 'utf8');

  it('uses the shared compact card for desktop and mobile results', () => {
    expect(source.match(/<MapResultCard\s/g)).toHaveLength(2);
    expect(source).toContain('<UnifiedPropertyCard property={property} variant="compact"');
    expect(source).not.toContain('formatPropertyPrice');
    expect(source).not.toContain('FALLBACK_PROPERTY_IMAGE');
  });
});

/**
 * Cột chat của panel AI hẹp kể cả trên desktop, nên thẻ kết quả phải xếp dọc: ở `list`,
 * CSS bật bố cục ngang (ảnh 32%) từ 640px trở lên và bóp nát phần chữ.
 */
describe('thẻ kết quả panel AI dùng biến thể xếp dọc', () => {
  const chatSource = readFileSync(resolve(process.cwd(), 'src/components/AiSearchChat.tsx'), 'utf8');
  const cardCss = readFileSync(resolve(process.cwd(), 'src/components/property/PropertyCard.module.css'), 'utf8');

  it('panel AI dùng variant compact, không dùng list', () => {
    expect(chatSource).toContain('variant="compact"');
    expect(chatSource).not.toContain('variant="list"');
  });

  it('compact không ẩn bớt trường nào so với hợp đồng thông tin đầy đủ', () => {
    // Chỉ được chỉnh khoảng cách/cỡ chữ; nếu có thuộc tính ẩn thì test này phải đổi theo.
    const compactRules = cardCss.match(/\.compact[^{]*\{[^}]*\}/g) ?? [];
    expect(compactRules.length).toBeGreaterThan(0);
    for (const rule of compactRules) {
      expect(rule).not.toMatch(/display\s*:\s*none/);
      expect(rule).not.toMatch(/visibility\s*:\s*hidden/);
    }
  });
});
