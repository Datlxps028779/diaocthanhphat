// Tự chèn internal link vào body bài viết (mục 8 updateweb.md): khi tên một khu
// dân cư / khu vực đã biết xuất hiện trong bài, chèn 1 link tới Entity Page tương
// ứng. Bảo thủ để không phá HTML: chỉ chèn ở TEXT ngoài thẻ, bỏ qua nội dung nằm
// trong <a>...</a> và trong heading (<h1>-<h4>), mỗi target chỉ link LẦN ĐẦU,
// và giới hạn tổng số link để tránh spam (xấu cho SEO/AIO).

export interface LinkTarget {
  name: string; // cụm chính xác cần dò, vd "Phú Hồng Thịnh 8"
  href: string; // vd "/khu-dan-cu/phu-hong-thinh-8"
}

const MAX_LINKS = 4;

// Tách HTML thành mảng đoạn: mỗi phần tử là {text, linkable}. Không linkable khi:
// nằm trong 1 thẻ (<...>), trong <a>...</a>, hoặc trong heading.
type Segment = { raw: string; linkable: boolean };

function segment(html: string): Segment[] {
  const segments: Segment[] = [];
  // Chẻ theo thẻ để giữ nguyên markup; đồng thời theo dõi ngữ cảnh a/heading.
  const tokenRe = /<[^>]+>/g;
  let last = 0;
  let inAnchor = false;
  let inHeading = false;
  let m: RegExpExecArray | null;
  const pushText = (txt: string) => {
    if (!txt) return;
    segments.push({ raw: txt, linkable: !inAnchor && !inHeading });
  };
  while ((m = tokenRe.exec(html)) !== null) {
    pushText(html.slice(last, m.index));
    const tag = m[0];
    segments.push({ raw: tag, linkable: false });
    const lower = tag.toLowerCase();
    if (/^<a\b/.test(lower)) inAnchor = true;
    else if (/^<\/a>/.test(lower)) inAnchor = false;
    else if (/^<h[1-4]\b/.test(lower)) inHeading = true;
    else if (/^<\/h[1-4]>/.test(lower)) inHeading = false;
    last = tokenRe.lastIndex;
  }
  pushText(html.slice(last));
  return segments;
}

export function autoLinkContent(html: string, targets: LinkTarget[]): string {
  if (!html || targets.length === 0) return html;
  try {
    // Ưu tiên cụm dài trước để "Phú Hồng Thịnh 8" không bị "Phú Hồng Thịnh" nuốt.
    const sorted = [...targets].filter(t => t.name.trim() && t.href.trim())
      .sort((a, b) => b.name.length - a.name.length);
    const used = new Set<string>();
    let linkCount = 0;
    const segs = segment(html);

    for (const seg of segs) {
      if (!seg.linkable || linkCount >= MAX_LINKS) continue;

      // Thu thập match trên TEXT GỐC của đoạn (chưa chèn gì) rồi mới chèn một lượt
      // từ phải sang trái. Không exec lại trên chuỗi đã có markup → không bao giờ
      // chèn link lồng vào giữa href/thẻ <a> của link vừa tạo.
      const hits: { index: number; length: number; href: string; name: string }[] = [];
      for (const t of sorted) {
        if (used.has(t.href)) continue;
        const idx = seg.raw.indexOf(t.name);
        if (idx === -1) continue;
        hits.push({ index: idx, length: t.name.length, href: t.href, name: t.name });
      }
      if (hits.length === 0) continue;

      // Loại chồng lấn (giữ cái bắt đầu sớm hơn; cụm dài đã được ưu tiên qua sorted).
      hits.sort((a, b) => a.index - b.index);
      const nonOverlap: typeof hits = [];
      let cursor = -1;
      for (const h of hits) {
        if (h.index < cursor) continue;
        nonOverlap.push(h);
        cursor = h.index + h.length;
      }

      // Áp mức trần tổng số link; cắt phần vượt.
      const room = MAX_LINKS - linkCount;
      const applied = nonOverlap.slice(0, Math.max(0, room));
      if (applied.length === 0) continue;

      // Chèn từ PHẢI sang TRÁI để index của các match trước không bị lệch.
      let out = seg.raw;
      for (let i = applied.length - 1; i >= 0; i--) {
        const h = applied[i];
        // Không gắn class: sanitizeArticleHtml chỉ giữ href (bỏ class), nên anchor
        // sạch sẽ sống sót và thừa hưởng style từ .prose của bài viết.
        const anchor = `<a href="${h.href}">${h.name}</a>`;
        out = out.slice(0, h.index) + anchor + out.slice(h.index + h.length);
        used.add(h.href); // đánh dấu ĐÃ dùng chỉ khi thật sự chèn (mỗi target 1 lần/bài)
      }
      seg.raw = out;
      linkCount += applied.length;
    }
    return segs.map(s => s.raw).join('');
  } catch {
    // Bất kỳ lỗi bất ngờ nào (regex, dữ liệu lạ) KHÔNG được làm sập trang bài viết.
    return html;
  }
}
