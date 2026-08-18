import type { NewsArticle } from './supabase';

export const MIN_PUBLIC_ARTICLE_CITATIONS = 2;

export type EditorialIssueCode =
  | 'CITATION_COUNT'
  | 'CITATION_TITLE'
  | 'CITATION_URL'
  | 'CITATION_DUPLICATE'
  | 'FAQ_COUNT'
  | 'FAQ_QUESTION'
  | 'FAQ_ANSWER';

export interface EditorialIssue {
  code: EditorialIssueCode;
  message: string;
}

export interface NewsEditorialQuality {
  canPublish: boolean;
  citationCount: number;
  validCitationCount: number;
  faqCount: number;
  validFaqCount: number;
  citationIssues: EditorialIssue[];
  faqIssues: EditorialIssue[];
}

type Citation = { title?: unknown; url?: unknown };
type Faq = { question?: unknown; answer?: unknown };

function compact(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function validHttpUrl(value: unknown): boolean {
  const raw = compact(value);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function citationsOf(value: unknown): Citation[] {
  return Array.isArray(value) ? value.filter((item): item is Citation => typeof item === 'object' && item !== null) : [];
}

function faqOf(value: unknown): Faq[] {
  return Array.isArray(value) ? value.filter((item): item is Faq => typeof item === 'object' && item !== null) : [];
}

/**
 * Editorial quality is deliberately narrower than the full ingest gate. It is shared
 * by Admin publication controls and the production transition trigger contract:
 * public articles need real, reviewable sources; FAQ remains an AEO improvement,
 * not a reason to invent answers just to publish.
 */
export function evaluateNewsEditorialQuality(
  article: Pick<NewsArticle, 'citations' | 'faq'>,
): NewsEditorialQuality {
  const citations = citationsOf(article.citations);
  const faq = faqOf(article.faq);
  const citationIssues: EditorialIssue[] = [];
  const faqIssues: EditorialIssue[] = [];

  const validCitations = citations.filter(citation =>
    Boolean(compact(citation.title)) && validHttpUrl(citation.url),
  );
  const citationUrls = validCitations.map(citation => compact(citation.url).toLowerCase());
  const sourceFloorMet = validCitations.length >= MIN_PUBLIC_ARTICLE_CITATIONS
    && new Set(citationUrls).size === citationUrls.length;
  if (!sourceFloorMet) {
    citationIssues.push({
      code: 'CITATION_COUNT',
      message: `Cần tối thiểu ${MIN_PUBLIC_ARTICLE_CITATIONS} nguồn tham khảo hợp lệ trước khi đăng công khai.`,
    });
  }
  citations.forEach(citation => {
    if (!compact(citation.title)) {
      citationIssues.push({ code: 'CITATION_TITLE', message: 'Mỗi nguồn tham khảo cần có tiêu đề rõ ràng.' });
    }
    if (!validHttpUrl(citation.url)) {
      citationIssues.push({ code: 'CITATION_URL', message: 'Mỗi nguồn tham khảo cần có URL HTTP(S) hợp lệ.' });
    }
  });
  if (citationUrls.length > 0 && new Set(citationUrls).size !== citationUrls.length) {
    citationIssues.push({ code: 'CITATION_DUPLICATE', message: 'URL nguồn tham khảo không được trùng nhau.' });
  }

  const validFaq = faq.filter(item => Boolean(compact(item.question)) && Boolean(compact(item.answer)));
  if (faq.length === 0) {
    faqIssues.push({ code: 'FAQ_COUNT', message: 'Chưa có FAQ; đây là mục cần biên tập thêm cho AEO, không chặn xuất bản.' });
  }
  faq.forEach(item => {
    if (!compact(item.question)) faqIssues.push({ code: 'FAQ_QUESTION', message: 'FAQ có câu hỏi trống.' });
    if (!compact(item.answer)) faqIssues.push({ code: 'FAQ_ANSWER', message: 'FAQ có câu trả lời trống.' });
  });

  return {
    canPublish: citationIssues.length === 0,
    citationCount: citations.length,
    validCitationCount: validCitations.length,
    faqCount: faq.length,
    validFaqCount: validFaq.length,
    citationIssues,
    faqIssues,
  };
}
