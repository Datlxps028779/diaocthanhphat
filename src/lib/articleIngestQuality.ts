import type { ArticleRow } from './apiIngest';
import {
  countImagesWithoutAlt,
  countInternalLinks,
  countWords,
  plainTextFromContent,
} from './contentReadiness';

export const ARTICLE_INGEST_QUALITY_VERSION = 'article-ingest-v1';

export interface ArticleIngestQualityItem {
  code: string;
  field: string;
  message: string;
}

export interface ArticleIngestQualityMetrics {
  word_count: number;
  h2_count: number;
  internal_link_count: number;
  faq_count: number;
  citation_count: number;
  images_without_alt: number;
  related_count?: number;
}

export interface ArticleIngestQualityResult {
  version: typeof ARTICLE_INGEST_QUALITY_VERSION;
  passed: boolean;
  score: number;
  issues: ArticleIngestQualityItem[];
  warnings: ArticleIngestQualityItem[];
  metrics: ArticleIngestQualityMetrics;
}

function compact(value?: string | null) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function item(code: string, field: string, message: string): ArticleIngestQualityItem {
  return { code, field, message };
}

function validHttpUrl(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractH2(content: string) {
  return Array.from(content.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi))
    .map(match => compact(plainTextFromContent(match[1])))
    .filter(Boolean);
}

function uniqueCount(values: string[]) {
  return new Set(values.map(value => compact(value).toLocaleLowerCase('vi'))).size;
}

function firstBlock(content: string) {
  const match = content.trim().match(/^<([a-z][a-z0-9]*)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (!match) return { tag: '', text: '' };
  return {
    tag: match[1].toLowerCase(),
    text: compact(plainTextFromContent(match[2])),
  };
}

export function evaluateArticleIngestQuality(
  row: ArticleRow,
  options: { rawContent?: string } = {},
): ArticleIngestQualityResult {
  const issues: ArticleIngestQualityItem[] = [];
  const warnings: ArticleIngestQualityItem[] = [];
  const title = compact(row.title);
  const excerpt = compact(row.excerpt);
  const bodyText = plainTextFromContent(row.content);
  const wordCount = countWords(bodyText);
  const h2 = extractH2(row.content);
  const first = firstBlock(row.content);
  const internalLinks = countInternalLinks(row.content);
  const imagesWithoutAlt = countImagesWithoutAlt(row.content);
  const metaTitle = compact(row.meta_title);
  const metaDescription = compact(row.meta_description);
  const keywords = compact(row.focus_keywords)
    .split(',')
    .map(value => compact(value))
    .filter(Boolean);
  const faq = Array.isArray(row.faq) ? row.faq : [];
  const citations = Array.isArray(row.citations) ? row.citations : [];

  if (title.length < 20 || title.length > 180) {
    issues.push(item('TITLE_LENGTH', 'title', `Tiêu đề phải dài 20–180 ký tự; hiện có ${title.length}.`));
  }
  if (excerpt.length < 80 || excerpt.length > 300) {
    issues.push(item('EXCERPT_LENGTH', 'excerpt', `Tóm tắt phải dài 80–300 ký tự; hiện có ${excerpt.length}.`));
  }
  if (wordCount < 900) {
    issues.push(item('CONTENT_TOO_SHORT', 'content', `Nội dung phải có ít nhất 900 từ; hiện có ${wordCount}.`));
  } else if (wordCount > 1800) {
    warnings.push(item('CONTENT_OUTSIDE_TARGET', 'content', `Nội dung có ${wordCount} từ, vượt khoảng mục tiêu 900–1.800 từ.`));
  }
  if (first.tag !== 'p' || first.text.length < 50) {
    issues.push(item('ANSWER_BLOCK_REQUIRED', 'content', 'Block đầu tiên phải là đoạn <p> trả lời trực tiếp, dài tối thiểu 50 ký tự.'));
  }
  if (/<h1\b/i.test(options.rawContent ?? row.content)) {
    issues.push(item('BODY_H1_FORBIDDEN', 'content', 'Nội dung không được chứa H1; tiêu đề bài đã là H1 của trang.'));
  }
  if (h2.length < 4) {
    issues.push(item('H2_COUNT', 'content', `Nội dung phải có ít nhất 4 H2 có chữ; hiện có ${h2.length}.`));
  }
  if (uniqueCount(h2) !== h2.length) {
    issues.push(item('H2_DUPLICATE', 'content', 'Các H2 phải có tên riêng, không được lặp lại.'));
  }
  if (h2.some(heading => /^(faq|câu hỏi thường gặp)$/i.test(heading))) {
    issues.push(item('FAQ_IN_CONTENT', 'content', 'Không lặp khối FAQ trong nội dung; hãy dùng field faq riêng.'));
  }
  if (!validHttpUrl(row.image_url)) {
    issues.push(item('FEATURED_IMAGE_REQUIRED', 'image_url', 'Ảnh đại diện HTTP(S) hợp lệ là bắt buộc.'));
  }
  if (imagesWithoutAlt > 0) {
    issues.push(item('INLINE_IMAGE_ALT', 'content', `${imagesWithoutAlt} ảnh trong nội dung thiếu alt hoặc alt ngắn hơn 8 ký tự.`));
  }
  if (metaTitle.length < 30 || metaTitle.length > 65) {
    issues.push(item('META_TITLE_LENGTH', 'meta_title', `Meta title phải dài 30–65 ký tự; hiện có ${metaTitle.length}.`));
  }
  if (metaDescription.length < 120 || metaDescription.length > 160) {
    issues.push(item('META_DESCRIPTION_LENGTH', 'meta_description', `Meta description phải dài 120–160 ký tự; hiện có ${metaDescription.length}.`));
  }
  if (keywords.length < 3 || keywords.length > 6 || uniqueCount(keywords) !== keywords.length) {
    issues.push(item('KEYWORD_COUNT', 'focus_keywords', 'Cần 3–6 cụm từ khóa không trùng nhau.'));
  }
  if (!compact(row.geo_area)) {
    issues.push(item('GEO_AREA_REQUIRED', 'geo_area', 'Bắt buộc có khu vực thật của bài viết.'));
  }
  if (!compact(row.geo_entity)) {
    issues.push(item('GEO_ENTITY_REQUIRED', 'geo_entity', 'Bắt buộc có entity/chủ thể chính của bài viết.'));
  }
  if (!compact(row.geo_notes)) {
    issues.push(item('GEO_NOTES_REQUIRED', 'geo_notes', 'Bắt buộc có ngữ cảnh địa phương đã kiểm chứng.'));
  }
  if (internalLinks < 2) {
    issues.push(item('INTERNAL_LINK_COUNT', 'content', `Nội dung phải có ít nhất 2 liên kết nội bộ tương đối; hiện có ${internalLinks}.`));
  } else if (internalLinks > 4) {
    warnings.push(item('TOO_MANY_INTERNAL_LINKS', 'content', `Nội dung có ${internalLinks} liên kết nội bộ; nên giữ trong khoảng 2–4.`));
  }
  if (!compact(row.author)) {
    issues.push(item('AUTHOR_REQUIRED', 'author', 'Bắt buộc có tên tác giả hoặc ban biên tập.'));
  }

  if (faq.length < 4 || faq.length > 6) {
    issues.push(item('FAQ_COUNT', 'faq', `Cần 4–6 cặp FAQ; hiện có ${faq.length}.`));
  }
  faq.forEach((entry, index) => {
    const question = compact(entry.question);
    const answer = compact(entry.answer);
    if (!question.endsWith('?')) {
      issues.push(item('FAQ_QUESTION_FORMAT', `faq.${index}.question`, `Câu hỏi FAQ ${index + 1} phải kết thúc bằng dấu hỏi.`));
    }
    if (answer.length < 40) {
      issues.push(item('FAQ_ANSWER_LENGTH', `faq.${index}.answer`, `Câu trả lời FAQ ${index + 1} phải dài tối thiểu 40 ký tự.`));
    }
  });
  if (uniqueCount(faq.map(entry => entry.question)) !== faq.length) {
    issues.push(item('FAQ_DUPLICATE', 'faq', 'Các câu hỏi FAQ không được trùng nhau.'));
  }

  if (citations.length < 2 || citations.length > 6) {
    issues.push(item('CITATION_COUNT', 'citations', `Cần 2–6 nguồn tham khảo; hiện có ${citations.length}.`));
  }
  citations.forEach((citation, index) => {
    if (!compact(citation.title) || !validHttpUrl(citation.url)) {
      issues.push(item('CITATION_INVALID', `citations.${index}`, `Nguồn ${index + 1} phải có tiêu đề và URL HTTP(S) hợp lệ.`));
    }
  });
  if (uniqueCount(citations.map(citation => citation.url)) !== citations.length) {
    issues.push(item('CITATION_DUPLICATE', 'citations', 'URL nguồn tham khảo không được trùng nhau.'));
  }

  const citationDomains = new Set(
    citations
      .map(citation => {
        try {
          return new URL(citation.url).hostname.toLowerCase();
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );
  if (citations.length >= 2 && citationDomains.size === 1) {
    warnings.push(item('CITATION_DOMAIN_DIVERSITY', 'citations', 'Các nguồn đều cùng một tên miền; nên đối chiếu thêm nguồn độc lập nếu có.'));
  }
  if (wordCount > 1200 && !/<(?:ul|ol|table)\b/i.test(row.content)) {
    warnings.push(item('LONG_CONTENT_WITHOUT_STRUCTURE', 'content', 'Bài dài trên 1.200 từ nên có danh sách hoặc bảng khi dữ liệu thực tế phù hợp.'));
  }

  const score = Math.max(0, 100 - issues.length * 8 - warnings.length * 2);
  return {
    version: ARTICLE_INGEST_QUALITY_VERSION,
    passed: issues.length === 0,
    score,
    issues,
    warnings,
    metrics: {
      word_count: wordCount,
      h2_count: h2.length,
      internal_link_count: internalLinks,
      faq_count: faq.length,
      citation_count: citations.length,
      images_without_alt: imagesWithoutAlt,
    },
  };
}
