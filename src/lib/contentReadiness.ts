import { isHtmlContent, stripHtml } from './markdown';

export type ReadinessLevel = 'error' | 'warning' | 'pass';
export type ReadinessStatus = 'blocked' | 'needs-work' | 'ready';

export interface ReadinessItem {
  key: string;
  label: string;
  level: ReadinessLevel;
  message: string;
}

export interface ReadinessResult {
  status: ReadinessStatus;
  score: number;
  items: ReadinessItem[];
  errors: ReadinessItem[];
  warnings: ReadinessItem[];
  passes: ReadinessItem[];
  canPublish: boolean;
}

export interface NewsReadinessInput {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  metaTitle: string;
  metaDescription: string;
  focusKeywords: string;
  schemaError?: string | null;
  geoArea?: string;
  geoEntity?: string;
  relatedCount?: number;
}

function compact(value?: string | null) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function plainTextFromContent(content: string) {
  const raw = content.trim();
  if (!raw) return '';
  return isHtmlContent(raw) ? stripHtml(raw) : compact(raw);
}

export function countWords(value: string) {
  return compact(value).split(/\s+/).filter(Boolean).length;
}

export function countInternalLinks(content: string) {
  return (content.match(/href=["']\/[^"']+["']/gi) ?? []).length;
}

export function countImagesWithoutAlt(content: string) {
  const matches = content.match(/<img\b[^>]*>/gi) ?? [];
  return matches.filter(tag => !/\salt=["'][^"']{8,}["']/i.test(tag)).length;
}

function item(key: string, label: string, level: ReadinessLevel, message: string): ReadinessItem {
  return { key, label, level, message };
}

export function evaluateNewsReadiness(input: NewsReadinessInput): ReadinessResult {
  const title = compact(input.title);
  const slug = compact(input.slug);
  const excerpt = compact(input.excerpt);
  const body = plainTextFromContent(input.content);
  const wordCount = countWords(body);
  const metaTitle = compact(input.metaTitle);
  const metaDescription = compact(input.metaDescription);
  const keywords = compact(input.focusKeywords).split(',').map(s => s.trim()).filter(Boolean);
  const geoArea = compact(input.geoArea);
  const geoEntity = compact(input.geoEntity);
  const internalLinks = countInternalLinks(input.content);
  const missingAlt = countImagesWithoutAlt(input.content);
  const relatedCount = input.relatedCount ?? 0;

  const items: ReadinessItem[] = [
    title
      ? item('title', 'Tiêu đề bài viết', 'pass', 'Đã có tiêu đề chính.')
      : item('title', 'Tiêu đề bài viết', 'error', 'Bắt buộc nhập tiêu đề thật, không để trống.'),
    slug
      ? item('slug', 'Slug URL', 'pass', 'Đã có slug canonical.')
      : item('slug', 'Slug URL', 'error', 'Slug cần được tự sinh hoặc nhập rõ để URL ổn định.'),
    excerpt.length >= 80
      ? item('excerpt', 'Tóm tắt', 'pass', 'Tóm tắt đủ ngữ cảnh cho SERP và AEO.')
      : excerpt
        ? item('excerpt', 'Tóm tắt', 'warning', 'Tóm tắt nên dài tối thiểu 80 ký tự để Google/AI hiểu rõ.')
        : item('excerpt', 'Tóm tắt', 'error', 'Bắt buộc có tóm tắt cho public SEO.'),
    wordCount >= 300
      ? item('content', 'Nội dung', 'pass', `${wordCount} từ — đủ nền nội dung để index.`)
      : wordCount >= 120
        ? item('content', 'Nội dung', 'warning', `${wordCount} từ — nên bổ sung thêm dữ liệu thật, địa danh, pháp lý, hạ tầng.`)
        : item('content', 'Nội dung', 'error', `${wordCount} từ — nội dung quá mỏng để đăng public.`),
    compact(input.imageUrl)
      ? item('image', 'Ảnh đại diện', 'pass', 'Đã có ảnh đại diện cho OG và NewsArticle schema.')
      : item('image', 'Ảnh đại diện', 'error', 'Bắt buộc có ảnh đại diện thật.'),
    missingAlt === 0
      ? item('image-alt', 'Alt ảnh trong bài', 'pass', 'Ảnh trong bài đều có alt đủ dài.')
      : item('image-alt', 'Alt ảnh trong bài', 'error', `${missingAlt} ảnh trong nội dung thiếu alt hoặc alt quá ngắn.`),
    metaTitle.length >= 30 && metaTitle.length <= 65
      ? item('meta-title', 'SEO title', 'pass', `${metaTitle.length} ký tự — trong vùng tối ưu.`)
      : metaTitle
        ? item('meta-title', 'SEO title', 'warning', `${metaTitle.length} ký tự — nên tối ưu khoảng 30–65 ký tự.`)
        : item('meta-title', 'SEO title', 'error', 'Bắt buộc có SEO title.'),
    metaDescription.length >= 120 && metaDescription.length <= 160
      ? item('meta-description', 'Meta description', 'pass', `${metaDescription.length} ký tự — trong vùng tối ưu.`)
      : metaDescription
        ? item('meta-description', 'Meta description', 'warning', `${metaDescription.length} ký tự — nên tối ưu khoảng 120–160 ký tự.`)
        : item('meta-description', 'Meta description', 'error', 'Bắt buộc có meta description.'),
    keywords.length >= 3
      ? item('keywords', 'Focus keywords', 'pass', `Đã có ${keywords.length} nhóm từ khóa.`)
      : keywords.length > 0
        ? item('keywords', 'Focus keywords', 'warning', 'Nên có tối thiểu 3 nhóm từ khóa, gồm chủ đề + địa danh + loại nhu cầu.')
        : item('keywords', 'Focus keywords', 'error', 'Bắt buộc có focus keywords.'),
    geoArea && geoEntity
      ? item('geo', 'GEO/entity bài viết', 'pass', 'Đã có khu vực và entity riêng cho bài viết.')
      : geoArea || geoEntity
        ? item('geo', 'GEO/entity bài viết', 'warning', 'Nên đủ cả khu vực và entity để AI/GEO trích xuất chính xác.')
        : item('geo', 'GEO/entity bài viết', 'error', 'Bắt buộc nhập GEO/entity riêng cho bài public.'),
    input.schemaError
      ? item('schema', 'Schema JSON-LD', 'error', input.schemaError)
      : item('schema', 'Schema JSON-LD', 'pass', 'Schema hợp lệ và sẵn sàng merge với dữ liệu thật.'),
    internalLinks > 0
      ? item('internal-links', 'Liên kết nội bộ', 'pass', `Đã có ${internalLinks} backlink nội bộ trong nội dung.`)
      : item('internal-links', 'Liên kết nội bộ', 'warning', 'Nên có ít nhất 1 link nội bộ tới bài/trang liên quan.'),
    relatedCount > 0
      ? item('related', 'Bài viết liên quan', 'pass', `Đã chọn ${relatedCount} bài liên quan thủ công.`)
      : item('related', 'Bài viết liên quan', 'warning', 'Nên chọn bài liên quan thủ công; hệ thống vẫn tự bù nếu thiếu.'),
  ];

  const errors = items.filter(i => i.level === 'error');
  const warnings = items.filter(i => i.level === 'warning');
  const passes = items.filter(i => i.level === 'pass');
  const score = Math.round((passes.length / items.length) * 100);
  const status: ReadinessStatus = errors.length ? 'blocked' : warnings.length ? 'needs-work' : 'ready';
  return { status, score, items, errors, warnings, passes, canPublish: errors.length === 0 };
}
