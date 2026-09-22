import { normalizeSafeImageSource } from '../SafeImage';
import type { PropertyCardModel } from '../../lib/propertyCardModel';

/**
 * Serializer popup bản đồ tiêu thụ CHÍNH model card dùng chung (`buildPropertyCardModel`)
 * để popup và React card không lệch shape/giá trị.
 *
 * Popup KHÔNG tự truy vấn dữ liệu và KHÔNG fetch poster: poster chưa xác định thì model đã
 * mang nhãn trung tính `UNKNOWN_CARD_POSTER` — serializer không bịa tên người đăng.
 */
export type PropertyCardPopupModel = PropertyCardModel;

// Hai màu gốc của popup: thuê = xanh dương, mua bán = đỏ, chưa rõ = xám trung tính.
const RENT_BADGE_BG = '#1d4ed8';
const SALE_BADGE_BG = '#b91c1c';
const UNKNOWN_BADGE_BG = '#4b5563';

const RENT_LABEL = 'Cho thuê';
const SALE_LABEL = 'Mua bán';
const UNKNOWN_TRANSACTION_LABEL = 'Bất động sản';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type TransactionKind = 'rent' | 'sale' | 'unknown';

function transactionKind(transaction: string): TransactionKind {
  // `transaction` có thể là nhãn đã bản địa hoá ('Cho thuê'/'Mua bán') hoặc giá trị thô
  // ('cho_thue'/'mua_ban'). Giá trị lạ (vd model trả 'Bất động sản') KHÔNG được suy diễn
  // thành mua bán — phải giữ nhãn trung thực và tô màu xám.
  const t = transaction.trim().toLowerCase();
  if (t === 'cho thuê' || t === 'cho_thue') return 'rent';
  if (t === 'mua bán' || t === 'mua_ban') return 'sale';
  return 'unknown';
}

function badgeBackground(transaction: string): string {
  const kind = transactionKind(transaction);
  if (kind === 'rent') return RENT_BADGE_BG;
  if (kind === 'sale') return SALE_BADGE_BG;
  return UNKNOWN_BADGE_BG;
}

function transactionLabel(transaction: string): string {
  const kind = transactionKind(transaction);
  if (kind === 'rent') return RENT_LABEL;
  if (kind === 'sale') return SALE_LABEL;
  return UNKNOWN_TRANSACTION_LABEL;
}

const SPEC_ICON_STYLE = 'width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"';

function specItem(icon: string, text: string): string {
  return `<div style="display:flex;align-items:center;gap:3px;">${icon}<span>${escapeHtml(text)}</span></div>`;
}

function areaSpec(areaLabel: string | null): string {
  if (!areaLabel) return '';
  return specItem(
    `<svg ${SPEC_ICON_STYLE}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
    areaLabel,
  );
}

function roomSpec(label: string): string {
  return specItem(
    `<svg ${SPEC_ICON_STYLE}><path d="M3 22V12M21 22V12M1 12h22M3 12V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5"/><path d="M10 12V7H6v5"/></svg>`,
    label,
  );
}

/**
 * Allowlist hẹp cho link hồ sơ người đăng: chỉ chấp nhận đúng dạng do model sinh ra
 * (`/nguoi-dang-tin/{slug}` với slug đã encodeURIComponent, một đoạn, không slash). Nhờ đó
 * `javascript:`, `data:`, `//evil.com` hay URL tuyệt đối đều bị loại — escapeHtml chỉ chống
 * phá vỡ cú pháp attribute, KHÔNG chống được scheme/protocol.
 */
const POSTER_PROFILE_PATH = /^\/nguoi-dang-tin\/[^/?#\s]+$/;

function safePosterHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!POSTER_PROFILE_PATH.test(trimmed)) return null;
  // Slug đã encodeURIComponent: `%20` hợp lệ, nhưng `%` đứng trước ký tự không phải hex
  // nghĩa là encode hỏng → từ chối thay vì phát ra URL rác.
  if (/%(?![0-9a-fA-F]{2})/.test(trimmed)) return null;
  return trimmed;
}

function posterRow(poster: PropertyCardModel['poster'] | null): string {
  if (!poster) return '';
  const name = poster.name;
  const nameLine = `<span style="font-size:13px;color:#4b5563;font-weight:600;line-height:1.35;overflow-wrap:anywhere;"><span style="font-size:12px;color:#4b5563;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;">Người đăng</span><br />${escapeHtml(name)}</span>`;
  const avatar = normalizeSafeImageSource(poster.avatarUrl);
  const avatarHtml = avatar
    ? `<img src="${escapeHtml(avatar)}" alt="" loading="lazy" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;align-self:flex-start;" />`
    : `<span style="width:24px;height:24px;border-radius:50%;background:#e5e7eb;flex-shrink:0;display:inline-block;align-self:flex-start;"></span>`;
  const inner = `${avatarHtml}${nameLine}`;
  const href = safePosterHref(poster.href);
  // Chỉ bọc <a> khi href vượt qua allowlist; ngược lại render <div> để không tạo link rỗng.
  if (href) {
    return `<a href="${escapeHtml(href)}" style="display:flex;align-items:center;gap:8px;text-decoration:none;margin-bottom:10px;">${inner}</a>`;
  }
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">${inner}</div>`;
}

/**
 * Serialize model card thành chuỗi HTML cho Leaflet marker popup.
 *
 * Thuần, zero-side-effect: không React, không fetch, không truy cập DOM. Caller (PropertyMap)
 * dựng model và bind nút `[data-nav-id]` / `[data-nav-slug]`.
 *
 * An toàn: mọi giá trị nội suy đều qua `escapeHtml`; ảnh qua `normalizeSafeImageSource`
 * (chặn data:/blob:/javascript:); link hồ sơ người đăng qua allowlist đường dẫn ở
 * `safePosterHref`. `escapeHtml` một mình chỉ chống phá cú pháp attribute, KHÔNG chống
 * scheme — nên URL không được truyền thẳng.
 */
export function serializePropertyCardPopup(model: PropertyCardPopupModel): string {
  const bg = badgeBackground(model.transaction);
  const primaryImage = normalizeSafeImageSource(model.images[0] ?? null);

  const imageHtml = primaryImage
    ? `<img data-card-image src="${escapeHtml(primaryImage)}" alt="${escapeHtml(model.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" />`
    : '';

  const galleryBadge = model.imageCount > 1
    ? `<div style="position:absolute;bottom:8px;right:8px;background:rgba(17,24,39,0.78);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:20px;">${model.imageCount} ảnh</div>`
    : '';

  const specs = [areaSpec(model.areaLabel), ...model.roomLabels.map(roomSpec)].filter(Boolean);

  const typeBadge = model.typeLabel
    // Chừa 44px lề phải cho nút đóng Leaflet (44x44) để badge không chui xuống dưới nút.
    ? `<div style="position:absolute;top:8px;right:44px;max-width:min(150px,calc(64% - 44px));background:rgba(17,24,39,0.78);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:20px;overflow-wrap:anywhere;">${escapeHtml(model.typeLabel)}</div>`
    : '';

  const pricePerSqmHtml = model.pricePerSqm
    ? `<span style="font-size:13px;color:#4b5563;font-weight:600;">${escapeHtml(model.pricePerSqm)}</span>`
    : '';

  const legalHtml = model.legalLabel
    ? `<span style="font-size:13px;color:#047857;background:#ecfdf5;border-radius:20px;padding:3px 8px;font-weight:600;overflow-wrap:anywhere;">${escapeHtml(model.legalLabel)}</span>`
    : '';

  const postedHtml = model.postedLabel
    ? `<span style="font-size:13px;color:#4b5563;">${escapeHtml(model.postedLabel)}</span>`
    : '';

  const metaRow = (legalHtml || postedHtml)
    ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;flex-wrap:wrap;">${legalHtml}${postedHtml}</div>`
    : '';

  return `
    <div style="width:100%;max-width:240px;min-width:0;font-family:Inter,system-ui,sans-serif;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.16);">
      <div style="position:relative;height:105px;overflow:hidden;background:linear-gradient(135deg,#f3f4f6,#e5e7eb);">
        <span data-card-fallback ${primaryImage ? 'hidden' : ''} style="position:absolute;inset:0;padding-top:42px;text-align:center;font-size:12px;color:#4b5563;">Ảnh chưa có sẵn</span>
        ${imageHtml}
        <div style="position:absolute;top:8px;left:8px;background:${bg};color:#fff;font-size:12px;font-weight:800;padding:3px 8px;border-radius:20px;letter-spacing:0.3px;">${escapeHtml(transactionLabel(model.transaction))}</div>
        ${typeBadge}
        ${galleryBadge}
      </div>

      <!-- Nội dung cuộn được, chặn theo % chiều cao khung nhìn để popup không bao giờ cao
           hơn màn hình (Leaflet tự đặt maxHeight bằng px cứng, không co theo viewport). -->
      <div style="padding:10px 12px 8px;background:#fff;max-height:min(160px,25vh);overflow-y:auto;">
        <div style="font-size:14px;font-weight:700;color:#111827;line-height:1.35;margin-bottom:6px;">${escapeHtml(model.title)}</div>

        <div style="display:flex;align-items:baseline;gap:7px;margin-bottom:6px;flex-wrap:wrap;">
          <span style="font-size:18px;font-weight:900;color:${bg};line-height:1;">${escapeHtml(model.price)}</span>
          ${pricePerSqmHtml}
        </div>

        <div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:${specs.length ? '8px' : '12px'};">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span style="font-size:13px;color:#4b5563;line-height:1.4;overflow-wrap:anywhere;">${escapeHtml(model.address)}</span>
        </div>

        ${specs.length ? `
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#4b5563;background:#f9fafb;border-radius:8px;padding:7px 10px;margin-bottom:12px;">
          ${specs.join('')}
        </div>` : ''}

        ${metaRow}

        ${posterRow(model.poster)}
      </div>

      <div style="padding:8px 12px 12px;background:#fff;border-top:1px solid #f3f4f6;">
        <button
          data-nav-id="${escapeHtml(model.id)}"
          data-nav-slug="${escapeHtml(model.navSlug ?? '')}"
          class="pcpopup-cta"
          style="
            width:100%;min-height:44px;background:${bg};color:#fff;border:none;
            border-radius:8px;padding:10px 12px;font-size:14px;font-weight:700;
            cursor:pointer;letter-spacing:0.2px;display:flex;align-items:center;
            justify-content:center;gap:6px;
          "
        >
          Xem chi tiết
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </div>
  `;
}
