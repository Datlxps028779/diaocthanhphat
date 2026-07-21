import Anthropic from '@anthropic-ai/sdk';
import { fetchPexelsImage } from './pexels';

// Sinh bài viết SEO/GEO bằng Claude cho bảng `news`. Chạy SERVER-SIDE (ANTHROPIC_API_KEY
// không bao giờ tới client). Port logic lõi từ bds-seo-toolkit/lib/anthropic.js nhưng:
//  - KHÔNG research web đợt này (viết thẳng từ từ khoá + khu vực).
//  - KHÔNG sinh JSON-LD schema (trang app/tin-tuc/[slug] đã tự sinh — tránh trùng).
//  - Ép JSON qua PROMPT + parse text (proxy-agnostic, tương thích model thinking) — KHÔNG
//    dùng forced tool_use vì tool_choice bắt buộc không kết hợp được extended thinking,
//    và proxy bên thứ 3 chưa chắc hỗ trợ đầy đủ tool_use.
//  - Ảnh minh hoạ lấy từ Pexels (Claude không sinh ảnh); citation cho E-E-A-T + GEO.

const MODEL = process.env.ARTICLE_GEN_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = Number(process.env.ARTICLE_GEN_MAX_TOKENS || '8000');

export type GeneratedArticle = {
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  contentHtml: string;
  category: string;
  keywords: string[];
  faq: { question: string; answer: string }[];
  geoArea: string;
  geoEntity: string;
  geoNotes: string;
  citations: { title: string; url: string }[];
  imageUrl: string;
};

export type GenerateArticleInput = {
  keyword: string;
  district?: string;
  ward?: string;
};

function buildSystemPrompt(): string {
  return [
    'Bạn là biên tập viên nội dung bất động sản khu vực Bình Dương, viết tiếng Việt chuẩn SEO và GEO.',
    'Mục tiêu: bài hữu ích, chính xác, bám địa phương (local SEO), tối ưu để cả Google lẫn công cụ AI',
    '(ChatGPT, AI Overview, Perplexity) trích dẫn được.',
    '',
    'Quy tắc nội dung bắt buộc:',
    '- MỞ BÀI: bắt đầu NGAY bằng 1-2 đoạn <p> dẫn nhập trả lời trực tiếp ý định tìm kiếm trong 3-4 câu (tối ưu AI Overview/đoạn trích nổi bật). TUYỆT ĐỐI KHÔNG mở bằng heading, KHÔNG có mục "Câu trả lời nhanh".',
    '- ĐỘ DÀI: thân bài 900-1400 từ (KHÔNG kể FAQ). Bài đủ sâu mới xếp hạng tốt — không viết sơ sài, mỗi mục phải có nội dung thực chất.',
    '- CẤU TRÚC PHÂN CẤP RÕ RÀNG: ít nhất 4-6 mục <h2>, mỗi <h2> có 2-4 đoạn <p> và nên có 1-2 tiểu mục <h3> khi hợp lý.',
    '- MỌI thẻ tiêu đề (<h2>/<h3>) PHẢI có chữ mô tả cụ thể — TUYỆT ĐỐI KHÔNG để tiêu đề rỗng hay chỉ khoảng trắng.',
    '- Tiêu đề H2/H3 phải mô tả (chứa từ khoá/khu vực khi tự nhiên), KHÔNG chung chung kiểu "Giới thiệu", "Kết luận" đơn thuần — viết thành câu/cụm có ngữ nghĩa.',
    '- Mỗi đoạn <p> dài 2-4 câu, mạch lạc, tách đoạn hợp lý (KHÔNG gộp cả mục vào 1 đoạn khổng lồ). Dùng <ul>/<ol> cho danh sách và <table> khi so sánh số liệu/khu vực để tăng khả năng được AI trích dẫn.',
    '- Kết bài bằng 1 mục <h2> tổng kết (có chữ, vd "Tổng kết và gợi ý bước tiếp theo") + gợi ý hành động (KHÔNG phải FAQ).',
    '- Bám khu vực cụ thể (thành phố/phường) khi được cung cấp — nhắc lại địa danh xuyên suốt để mạnh local SEO/GEO.',
    '- Ít nhất 4-6 câu hỏi FAQ, trả lời ngắn gọn 2-4 câu, đúng trọng tâm — ĐẶT RIÊNG ở khoá "faq", KHÔNG đưa vào thân bài.',
    '- KHÔNG bịa số liệu quá cụ thể (giá chính xác, phần trăm) nếu không chắc; nói theo khoảng/xu hướng.',
    '- KHÔNG sao chép văn phong hay nội dung của bất kỳ nguồn nào; viết mới hoàn toàn.',
    '- Văn phong khách quan, không hứa hẹn lợi nhuận, không lời khuyên đầu tư mang tính cam kết.',
    '',
    'ĐỊNH DẠNG ĐẦU RA — cực kỳ quan trọng:',
    'Chỉ trả về DUY NHẤT một object JSON hợp lệ, KHÔNG kèm lời dẫn, KHÔNG bọc trong ```.',
    'JSON có đúng các khóa sau (đều bắt buộc):',
    '{',
    '  "title": "Tiêu đề bài, 50-65 ký tự, có từ khoá + khu vực",',
    '  "metaTitle": "Thẻ title SEO, ≤ 60 ký tự",',
    '  "metaDescription": "Meta description, 140-160 ký tự, có từ khoá",',
    '  "excerpt": "Tóm tắt 1-2 câu hiển thị ở danh sách",',
    '  "contentHtml": "Thân bài HTML sạch 900-1400 từ: MỞ ĐẦU bằng 1-2 đoạn <p> dẫn nhập (KHÔNG heading mở đầu, KHÔNG mục Câu trả lời nhanh), rồi 4-6 mục <h2> (mỗi <h2>/<h3> đều PHẢI có chữ, KHÔNG rỗng; mỗi mục 2-4 <p>, có <h3> tiểu mục khi hợp lý), dùng <ul>/<ol>/<table> để cấu trúc, kết bằng <h2> tổng kết có tiêu đề. KHÔNG <script>, KHÔNG JSON-LD, KHÔNG <h1> lặp tiêu đề. TUYỆT ĐỐI KHÔNG chèn mục FAQ / Câu hỏi thường gặp vào thân bài — FAQ nằm RIÊNG ở khoá faq",',
    '  "category": "Danh mục ngắn, vd Thị trường / Pháp lý / Đầu tư",',
    '  "keywords": ["3-6", "từ khoá", "liên quan"],',
    '  "faq": [{"question": "...", "answer": "..."}],',
    '  "geoArea": "Khu vực địa lý chính, vd Dĩ An, Bình Dương",',
    '  "geoEntity": "Thực thể địa lý cụ thể nhất bài nói tới: tên tuyến đường/KCN/dự án/phường, vd Vành đai 3, KCN VSIP, phường Dĩ An",',
    '  "geoNotes": "Ngữ cảnh địa phương phụ: khu lân cận, tiện ích, mốc quy hoạch liên quan (1 câu ngắn)",',
    '  "citations": [{"title": "Tên nguồn", "url": "https://..."}]',
    '}',
    'Ghi chú các khoá GEO/nguồn:',
    '- geoEntity, geoNotes: điền entity + ngữ cảnh THẬT của khu vực (giúp Google/AI hiểu đúng địa phương).',
    '- citations: 2-4 nguồn tham khảo THẬT và uy tín (cổng thông tin tỉnh/huyện, quy hoạch, báo lớn, cơ quan',
    '  nhà nước). Ưu tiên URL trang chuyên mục/bài cụ thể liên quan nội dung (vd trang chuyên mục quy hoạch,',
    '  thống kê BĐS) NẾU bạn tự tin trang đó có thật; nếu không chắc trang con, dùng trang chủ chính thức của',
    '  cơ quan/tờ báo đó. TUYỆT ĐỐI KHÔNG bịa đường dẫn sâu không có thật. "title" ghi rõ tên trang/chuyên mục',
    '  cụ thể (vd "Tổng cục Thống kê - Số liệu kinh tế xã hội"), KHÔNG chỉ ghi tên chung. Không chắc nguồn nào thì để [].',
    'Giá trị chuỗi phải escape đúng chuẩn JSON (dấu " bên trong dùng \\").',
  ].join('\n');
}

function buildUserPrompt(input: GenerateArticleInput): string {
  const parts = [`Từ khoá chính: "${input.keyword}".`];
  if (input.district) parts.push(`Khu vực (quận/huyện/thành phố): ${input.district}.`);
  if (input.ward) parts.push(`Phường/xã: ${input.ward}.`);
  parts.push('Hãy soạn một bài viết hoàn chỉnh và trả về DUY NHẤT object JSON theo đúng định dạng đã nêu.');
  return parts.join('\n');
}

// Bóc JSON từ text trả về: bỏ fence ```json, cắt từ dấu { đầu tới } cuối.
function parseArticleJson(text: string): Partial<GeneratedArticle> {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Claude không trả về JSON hợp lệ. Thử lại hoặc đổi từ khoá.');
  }
  try {
    return JSON.parse(s.slice(start, end + 1)) as Partial<GeneratedArticle>;
  } catch {
    throw new Error('Không phân tích được JSON bài viết. Thử lại.');
  }
}

// Sinh bài. Ném Error kèm message tiếng Việt khi lỗi cấu hình/đầu ra.
export async function generateArticle(input: GenerateArticleInput): Promise<GeneratedArticle> {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    const err = new Error('Chưa cấu hình ANTHROPIC_API_KEY trên server.');
    (err as { code?: string }).code = 'NO_API_KEY';
    throw err;
  }

  // baseURL: dùng proxy bên thứ 3 nếu đặt ANTHROPIC_BASE_URL, else endpoint Anthropic mặc định.
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;

  const client = new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    // Gửi key qua CẢ HAI header: x-api-key (chuẩn Anthropic, SDK tự thêm) và Authorization
    // Bearer. Gateway bên thứ 3 (leeh.dev) đọc key qua Authorization nên phải thêm thủ công;
    // proxy đọc x-api-key vẫn không bị ảnh hưởng.
    ...(baseURL ? { defaultHeaders: { Authorization: `Bearer ${apiKey}` } } : {}),
  });

  // Stream để tránh request timeout khi output dài; lấy message hoàn chỉnh ở cuối.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  });
  const message = await stream.finalMessage();

  // Ghép các block text (bỏ qua thinking block nếu model có suy nghĩ).
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  if (!text) {
    throw new Error('Claude không trả về nội dung bài viết. Thử lại hoặc đổi từ khoá.');
  }

  const out = parseArticleJson(text);
  if (!out.title?.trim() || !out.contentHtml?.trim()) {
    throw new Error('Bài viết sinh ra thiếu tiêu đề hoặc nội dung. Thử lại.');
  }

  const geoArea = (out.geoArea || input.district || '').trim();

  // Ảnh minh hoạ từ Pexels theo từ khoá + khu vực. Thiếu key/lỗi → '' (không chặn tạo bài).
  const imageQuery = [input.keyword, input.district].filter(Boolean).join(' ');
  const pexels = await fetchPexelsImage(imageQuery);

  return {
    title: out.title.trim(),
    metaTitle: (out.metaTitle || out.title).trim(),
    metaDescription: (out.metaDescription || '').trim(),
    excerpt: (out.excerpt || '').trim(),
    contentHtml: out.contentHtml.trim(),
    category: (out.category || 'Thị trường').trim(),
    keywords: Array.isArray(out.keywords) ? out.keywords.filter(k => typeof k === 'string' && k.trim()) : [],
    faq: Array.isArray(out.faq)
      ? out.faq
          .filter(f => f && typeof f.question === 'string' && typeof f.answer === 'string' && f.question.trim() && f.answer.trim())
          .map(f => ({ question: f.question.trim(), answer: f.answer.trim() }))
      : [],
    geoArea,
    geoEntity: (out.geoEntity || '').trim(),
    geoNotes: (out.geoNotes || '').trim(),
    citations: Array.isArray(out.citations)
      ? out.citations
          .filter(c => c && typeof c.url === 'string' && /^https?:\/\//i.test(c.url.trim()))
          .map(c => ({ title: (c.title || c.url).trim(), url: c.url.trim() }))
      : [],
    imageUrl: pexels?.url ?? '',
  };
}
