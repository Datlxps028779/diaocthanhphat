import Anthropic from '@anthropic-ai/sdk';

// Sinh bài viết SEO/GEO bằng Claude cho bảng `news`. Chạy SERVER-SIDE (ANTHROPIC_API_KEY
// không bao giờ tới client). Port logic lõi từ bds-seo-toolkit/lib/anthropic.js nhưng:
//  - KHÔNG research web đợt này (viết thẳng từ từ khoá + khu vực).
//  - KHÔNG sinh JSON-LD schema (trang app/tin-tuc/[slug] đã tự sinh — tránh trùng).
//  - Ép JSON qua PROMPT + parse text (proxy-agnostic, tương thích model thinking) — KHÔNG
//    dùng forced tool_use vì tool_choice bắt buộc không kết hợp được extended thinking,
//    và proxy bên thứ 3 chưa chắc hỗ trợ đầy đủ tool_use.

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
    '- Mở đầu bằng mục "Câu trả lời nhanh" trả lời trực tiếp ý định tìm kiếm trong 2-3 câu.',
    '- Có ít nhất 2 mục <h2>, dùng <h3> cho tiểu mục. Đoạn văn ngắn, dễ đọc.',
    '- Bám khu vực cụ thể (thành phố/phường) khi được cung cấp.',
    '- Ít nhất 3 câu hỏi FAQ, trả lời ngắn gọn, đúng trọng tâm.',
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
    '  "contentHtml": "Thân bài HTML sạch: mở đầu <h2>Câu trả lời nhanh</h2> + <p>, rồi <h2>/<h3>/<p>/<ul>/<table>. KHÔNG <script>, KHÔNG JSON-LD, KHÔNG <h1> lặp tiêu đề",',
    '  "category": "Danh mục ngắn, vd Thị trường / Pháp lý / Đầu tư",',
    '  "keywords": ["3-6", "từ khoá", "liên quan"],',
    '  "faq": [{"question": "...", "answer": "..."}],',
    '  "geoArea": "Khu vực địa lý chính, vd Dĩ An, Bình Dương"',
    '}',
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

  // Log chẩn đoán (KHÔNG lộ giá trị key): thấy được trong Vercel → Logs/Functions.
  // Giúp phân biệt: key không được inject vào runtime vs key có nhưng proxy từ chối.
  console.info('[articleGen] cấu hình', JSON.stringify({
    keyPresent: !!apiKey,
    keyLen: apiKey.length,
    keyPrefix: apiKey.slice(0, 6),
    keyHasWhitespace: /\s/.test(apiKey),
    baseURL: baseURL ?? '(mặc định Anthropic)',
    model: MODEL,
  }));

  const client = new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    // Gửi key qua CẢ HAI header: x-api-key (chuẩn Anthropic, SDK tự thêm) và Authorization
    // Bearer. Gateway bên thứ 3 (leeh.dev) đọc key qua Authorization nên phải thêm thủ công;
    // proxy đọc x-api-key vẫn không bị ảnh hưởng.
    ...(baseURL ? { defaultHeaders: { Authorization: `Bearer ${apiKey}` } } : {}),
    // Custom fetch CHỈ để chẩn đoán: log URL đích + tên các header gửi đi (KHÔNG lộ value)
    // → biết chắc x-api-key có tới proxy không. Xoá sau khi xong.
    fetch: async (url, init) => {
      try {
        const h = new Headers(init?.headers as HeadersInit | undefined);
        const headerKeys = Array.from(h.keys());
        console.info('[articleGen] outbound', JSON.stringify({
          url: String(url),
          headerKeys,
          hasApiKey: headerKeys.includes('x-api-key'),
          hasAuth: headerKeys.includes('authorization'),
        }));
      } catch { /* log không được thì bỏ qua, không chặn request */ }
      return fetch(url, init);
    },
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
    geoArea: (out.geoArea || input.district || '').trim(),
  };
}
