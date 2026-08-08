'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { Calendar, Clock, Tag, ChevronRight, ArrowRight, Eye, Mail, CheckCircle } from 'lucide-react';
import { type NewsArticle, type NewsListItem, type NewsPageResult } from '../lib/supabase';
import { getNews, getNewsById, getNewsByIds, getNewsPage, getMostViewedNews, getNewsCategories, NEWS_PER_PAGE, subscribe, getPageBlocks, pageBlocksToMap, incrementNewsView } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { nextListingPageParam } from '../lib/listingPaging';
import { type Page, pageToHref } from '../lib/router';
import { NEWS_CATEGORIES, setNewsCategorySlugMap } from '../lib/newsCategories';
import { Breadcrumb } from '../components/Layout';
import { useSetting } from '../lib/cms';
import { renderMarkdownContent, isHtmlContent, stripHtml } from '../lib/markdown';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml';
import { pickRelated } from '../lib/relatedNews';
import { buildNewsImageAlt } from '../lib/propertyImages';
import { BlurFillImage } from '../components/BlurFillImage';
import { useNeighborhoods, useAreas } from '../lib/hooks/useTaxonomy';
import { autoLinkContent, type LinkTarget } from '../lib/autoLink';
import { extractHeadings, injectHeadingIds, TOC_MIN_HEADINGS } from '../lib/tableOfContents';
import { ArticleToc } from '../components/ArticleToc';
import { DetailShareButtons } from '../components/DetailShareButtons';

// Danh mục là chuỗi tự do (đổ động từ news_categories). Giữ alias để đọc dễ.
type NewsCollection = string;

// Màu badge theo KHÓA (khớp news_categories.badge_color + BADGE_COLORS trong admin).
const BADGE_CLASS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  purple: 'bg-purple-100 text-purple-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-gray-100 text-gray-600',
};

// Fallback tĩnh theo nhãn khi chưa nạp màu động từ DB (5 danh mục gốc).
const categoryColors: Record<string, string> = {
  'Thị trường': 'bg-blue-100 text-blue-700',
  'Hạ tầng': 'bg-green-100 text-green-700',
  'Đầu tư': 'bg-amber-100 text-amber-700',
  'Hướng dẫn': 'bg-purple-100 text-purple-700',
  'Tài chính': 'bg-red-100 text-red-700',
};

// Cache màu badge runtime (label→className) nạp từ DB. Cho phép ArticleCard/
// HorizontalCard ở tầng module đọc màu động mà không phải luồn prop xuống từng card.
// Rỗng cho tới khi NewsPage nạp xong → khi rỗng thì rơi về map tĩnh bên trên.
let runtimeCategoryColors: Record<string, string> = {};
function setCategoryColorMap(rows: { label: string; badge_color: string }[]): void {
  const m: Record<string, string> = {};
  for (const r of rows) if (r.label && r.badge_color) m[r.label] = BADGE_CLASS[r.badge_color] ?? '';
  runtimeCategoryColors = m;
}

function categoryBadge(cat: string) {
  return runtimeCategoryColors[cat] || categoryColors[cat] || 'bg-gray-100 text-gray-600';
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function estimateReadTime(content: string) {
  const words = content?.split(/\s+/).length ?? 0;
  return Math.max(1, Math.round(words / 200));
}

function articleHref(article: Pick<NewsArticle, 'id' | 'slug'>) {
  return pageToHref({ name: 'news', slug: article.slug || article.id });
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter(Boolean) as T[] : [];
}

/* ────────────────── Skeletons ────────────────── */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow animate-pulse">
      <div className="h-44 bg-gray-200" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-1/4" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-5/6" />
        <div className="h-3 bg-gray-200 rounded w-1/3 mt-2" />
      </div>
    </div>
  );
}

/* ────────────────── Article Card ────────────────── */
function ArticleCard({
  article,
  large = false,
}: {
  article: NewsListItem;
  large?: boolean;
}) {
  const imgUrl =
    (article as any).image_url ||
    'https://images.pexels.com/photos/1396132/pexels-photo-1396132.jpeg?auto=compress&w=600';
  const readMin = estimateReadTime((article as any).content ?? article.excerpt ?? '');
  const cat = (article as any).category ?? '';
  const href = articleHref(article);

  if (large) {
    return (
      <Link href={href} className="group relative block min-h-[22rem] overflow-hidden rounded-2xl bg-gray-900 shadow-md transition-shadow hover:shadow-xl md:min-h-[30rem]">
        <BlurFillImage
          src={imgUrl}
          alt={buildNewsImageAlt(article)}
          sizes="(max-width: 768px) 100vw, 50vw"
          wrapperClassName="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-7">
          {cat && <span className="inline-flex rounded-lg bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{cat}</span>}
          <h2 className="mt-4 line-clamp-3 text-2xl font-black leading-tight md:text-3xl">{article.title}</h2>
          {article.excerpt && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-200 md:text-base">{article.excerpt}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-200">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formatDate((article as any).published_at ?? (article as any).created_at ?? '')}</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {readMin} phút đọc</span>
            <span className="ml-auto flex items-center gap-1 font-bold text-white">Đọc tiếp <ArrowRight className="h-3.5 w-3.5" /></span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow flex flex-col group">
      <BlurFillImage src={imgUrl} alt={buildNewsImageAlt(article)} sizes="(max-width: 768px) 100vw, 33vw" wrapperClassName="h-44" />

      <div className="p-4 flex flex-col flex-1">
        {cat && (
          <span className={`self-start px-2 py-0.5 rounded-full text-xs font-semibold mb-2 ${categoryBadge(cat)}`}>
            {cat}
          </span>
        )}
        <h3 className="font-bold text-gray-900 text-sm mb-1 line-clamp-2 leading-snug flex-1 group-hover:text-red-600 transition-colors">{article.title}</h3>
        <p className="text-gray-500 text-xs line-clamp-2 mb-3">{article.excerpt}</p>
        <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {formatDate((article as any).published_at ?? (article as any).created_at ?? '')}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {readMin} phút
          </span>
        </div>
        <span className="mt-2 flex items-center gap-1 text-red-600 text-xs font-semibold group-hover:underline self-end">
          Đọc tiếp <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  );
}

/* ────────────────── Horizontal Card (khối phụ cạnh bài nổi bật) ────────────────── */
function HorizontalCard({ article }: { article: NewsListItem }) {
  const imgUrl =
    (article as any).image_url ||
    'https://images.pexels.com/photos/1396132/pexels-photo-1396132.jpeg?auto=compress&w=300';
  const cat = (article as any).category ?? '';
  const href = articleHref(article);
  return (
    <Link href={href} className="group relative block min-h-40 overflow-hidden rounded-xl bg-gray-900 shadow-sm transition-shadow hover:shadow-lg sm:min-h-48">
      <img src={imgUrl} alt={buildNewsImageAlt(article)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-900/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        {cat && <span className="inline-flex rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">{cat}</span>}
        <h4 className="mt-2 line-clamp-2 text-base font-bold leading-snug">{article.title}</h4>
        <span className="mt-2 flex items-center gap-1 text-xs text-gray-200">
          <Calendar className="h-3 w-3" /> {formatDate((article as any).published_at ?? (article as any).created_at ?? '')}
        </span>
      </div>
    </Link>
  );
}

/* ────────────────── Article Detail ────────────────── */
function ArticleDetail({
  article,
  related,
  onBack,
}: {
  article: NewsArticle;
  related: NewsArticle[];
  onBack: () => void;
}) {
  const rawContent: string = (article as any).content ?? article.excerpt ?? '';
  const contentIsHtml = isHtmlContent(rawContent);
  // Nguồn target cho auto internal-link: khu dân cư + khu vực (mục 8 doc).
  const { data: neighborhoods = [] } = useNeighborhoods();
  const { data: areas = [] } = useAreas();
  // Bài viết khác cũng làm đích link. `related` chỉ có 5 bài nên không đủ; lấy rộng
  // hơn bằng query riêng. Key riêng (không dùng qk.news) vì limit khác — chung key
  // sẽ ghi đè cache của danh sách tin tức.
  const { data: linkableArticles = [] } = useQuery({
    queryKey: ['news-link-targets'],
    queryFn: () => getNews(undefined, 100),
    staleTime: 5 * 60_000,
  });
  const linkTargets = useMemo<LinkTarget[]>(() => [
    ...neighborhoods.map(n => ({ name: n.name, href: `/khu-dan-cu/${n.slug}`, group: 'place' as const })),
    ...areas.map(a => ({ name: a.name, href: `/khu-vuc/${a.slug}`, group: 'place' as const })),
    // Loại chính bài đang đọc, nếu không bài sẽ tự link vào mình.
    ...linkableArticles
      .filter(n => n.id !== article.id && n.title && (n.slug || n.id))
      .map(n => ({
        name: n.title,
        href: pageToHref({ name: 'news', slug: n.slug || n.id }),
        group: 'article' as const,
      })),
  ], [neighborhoods, areas, linkableArticles, article.id]);
  // Sanitize TRƯỚC rồi mới auto-link: link chèn vào HTML đã sạch, anchor không bị strip.
  // Mục lục tự sinh từ h2. Trích heading từ nội dung GỐC, nhưng gắn id vào bản đã
  // sanitize — sanitizeHtml không cho thuộc tính id nên gắn trước sẽ bị xoá sạch và
  // bấm mục lục không nhảy đâu cả.
  const tocHeadings = useMemo(
    () => (contentIsHtml ? extractHeadings(rawContent) : []),
    [rawContent, contentIsHtml],
  );
  const safeHtml = useMemo(
    () => {
      if (!contentIsHtml) return '';
      const clean = autoLinkContent(sanitizeArticleHtml(rawContent), linkTargets);
      return injectHeadingIds(clean, tocHeadings);
    },
    [rawContent, contentIsHtml, linkTargets, tocHeadings],
  );
  const markdownBlocks = contentIsHtml ? null : renderMarkdownContent(rawContent);
  const relatedArticles = related.slice(0, 5);
  const relatedHref = (item: NewsArticle) => articleHref(item);
  const phone = useSetting('phone_hotline', '0901 234 567');
  const imgUrl =
    (article as any).image_url ||
    'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&w=1200';
  const tags = asArray<string>((article as any).tags);
  const faqItems = asArray<{ question: string; answer: string }>(article.faq);
  const citations = asArray<{ title?: string; url: string }>(article.citations);
  const cat = (article as any).category ?? '';
  const geoArea = article.geo_area?.trim();
  const geoEntity = article.geo_entity?.trim();
  const readMin = estimateReadTime(contentIsHtml ? stripHtml(rawContent) : rawContent);
  const pubRaw = (article as any).published_at ?? (article as any).created_at ?? new Date().toISOString();
  const pubDate = formatDate(pubRaw);
  // "Cập nhật" chỉ hiện khi bài đã sửa sau đăng đáng kể (>1 ngày) — tránh nhiễu khi vừa tạo.
  const updatedRaw = (article as any).updated_at;
  const showUpdated = updatedRaw && new Date(updatedRaw).getTime() - new Date(pubRaw).getTime() > 86400000;
  const updatedDate = showUpdated ? formatDate(updatedRaw) : '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="relative h-64 md:h-96 flex items-end overflow-hidden bg-gray-900">
        <div className="absolute inset-0">
          <BlurFillImage src={imgUrl} alt={buildNewsImageAlt(article)} sizes="100vw" hover={false} priority wrapperClassName="w-full h-full bg-gray-900" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/40 to-transparent" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 w-full pb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-white/80 hover:text-white text-sm mb-3 transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" /> Quay lại tin tức
          </button>
          {cat && (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold mb-2 inline-block ${categoryBadge(cat)}`}>
              {cat}
            </span>
          )}
          <h1 className="article-headline text-2xl md:text-3xl font-bold text-white leading-snug max-w-3xl">{article.title}</h1>
          <DetailShareButtons title={article.title} canonicalPathname={articleHref(article)} className="mt-4" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 lg:flex gap-8">
        {/* Main */}
        <article className="flex-1 min-w-0">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-6 pb-4 border-b border-gray-200">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" /> {pubDate}
            </span>
            {updatedDate && (
              <span className="flex items-center gap-1 text-gray-400">
                Cập nhật {updatedDate}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" /> {readMin} phút đọc
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" /> {article.views ?? 0} lượt xem
            </span>
          </div>

          {/* Excerpt */}
          {article.excerpt && (
            <p className="article-excerpt text-gray-600 text-base italic border-l-4 border-red-400 pl-4 mb-6 leading-relaxed">
              {article.excerpt}
            </p>
          )}

          {(geoArea || geoEntity) && (
            <div className="mb-6 flex flex-wrap gap-2 text-xs">
              {geoArea && <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">Khu vực: {geoArea}</span>}
              {geoEntity && <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">Chủ thể: {geoEntity}</span>}
            </div>
          )}

          {/* Mục lục — ẩn hẳn khi bài quá ít mục (1/23 bài thật không có heading nào) */}
          {tocHeadings.length >= TOC_MIN_HEADINGS && <ArticleToc headings={tocHeadings} />}

          {/* Content */}
          {contentIsHtml ? (
            <div
              className="prose prose-gray max-w-none text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : (
            <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed space-y-4">
              {markdownBlocks}
            </div>
          )}
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-gray-200">
              <Tag className="w-4 h-4 text-gray-400 mt-0.5" />
              {tags.map((t) => (
                <span key={t} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* FAQ — admin nhập tay, khớp 1:1 với FAQPage JSON-LD ở page.tsx */}
          {faqItems.length > 0 && (
            <div className="mt-10 pt-6 border-t border-gray-200">
              <h2 className="font-bold text-gray-900 text-lg mb-4">Câu hỏi thường gặp</h2>
              <div className="divide-y divide-gray-100">
                {faqItems.map((item, i) => (
                  <details key={i} className="group py-3 first:pt-0">
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-sm font-semibold text-gray-900">
                      {item.question}
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Nguồn tham khảo — khớp 1:1 với schema citation ở page.tsx (tránh cloaking) */}
          {citations.length > 0 && (
            <div className="mt-10 pt-6 border-t border-gray-200">
              <h2 className="font-bold text-gray-900 text-lg mb-4">Nguồn tham khảo</h2>
              <ul className="space-y-2 list-disc pl-5 marker:text-red-500">
                {citations.map((c, i) => (
                  <li key={i} className="text-sm text-gray-700 break-words">
                    {c.title || c.url}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA Banner */}
          <div className="mt-10 bg-gradient-to-r from-red-700 to-red-500 rounded-2xl p-6 text-white text-center">
            <h3 className="text-lg font-bold mb-2">Bạn cần tư vấn về bất động sản?</h3>
            <p className="text-red-100 text-sm mb-4">Đội ngũ chuyên gia sẵn sàng hỗ trợ bạn 24/7</p>
            <a
              href={`tel:${phone.replace(/\s/g, '')}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-red-600 rounded-xl font-semibold text-sm hover:bg-red-50 transition-colors"
            >
              Gọi ngay: {phone}
            </a>
          </div>
          <DetailShareButtons title={article.title} canonicalPathname={articleHref(article)} className="mt-5" />
        </article>

        {/* Sidebar */}
        <aside className="hidden lg:block w-72 shrink-0">
          <div className="bg-white rounded-2xl shadow p-5 sticky top-24">
            <h4 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide">Bài viết liên quan</h4>
            <div className="space-y-4">
              {relatedArticles.map((r) => {
                const rImg = (r as any).image_url || 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&w=200';
                return (
                  <Link
                    key={r.id}
                    href={relatedHref(r)}
                    className="flex gap-3 text-left w-full hover:opacity-80 transition-opacity group"
                  >
                    <img src={rImg} alt={buildNewsImageAlt(r)} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                    <div>
                      <p className="text-sm text-gray-700 font-medium line-clamp-2 leading-snug group-hover:text-red-600 transition-colors">{r.title}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate((r as any).published_at ?? (r as any).created_at ?? '')}
                      </p>
                    </div>
                  </Link>
                );
              })}
              {related.length === 0 && (
                <p className="text-gray-400 text-sm">Chưa có bài viết liên quan.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ────────────────── NewsPage ────────────────── */
export function NewsPage({ onNavigate, articleId: initialArticleId, initialPage, initialMostViewed, initialCategory }: { onNavigate: (p: Page) => void; articleId?: string; initialPage?: NewsPageResult; initialMostViewed?: NewsListItem[]; initialCategory?: string }) {
  const [category, setCategory] = useState<NewsCollection>(initialCategory || 'Tất cả');
  const [articleId, setArticleId] = useState<string | undefined>(initialArticleId);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSent, setNewsletterSent] = useState(false);

  const { data: cms = {} } = useQuery({
    queryKey: qk.pageBlocks('news'),
    queryFn: () => getPageBlocks('news'),
    select: pageBlocksToMap,
  });
  const g = (section: string, key: string, def: string) => cms[section]?.[key] || def;

  const newsCategory = category === 'Tất cả' ? undefined : category;
  // Category mà server đã prefetch (route /tin-tuc → 'Tất cả', route
  // /tin-tuc/danh-muc/{slug} → nhãn danh mục). Seed SSR trang 1 khi view khớp đúng
  // cái server fetch để không nháy loading (kể cả trang danh mục).
  const seedCategory: NewsCollection = initialCategory || 'Tất cả';
  const seedMatch = category === seedCategory;

  // Feed phân trang nhẹ: mỗi trang là NewsListItem (không có content), nối tiếp bằng
  // "Tải thêm"/observer. Key riêng cho feed — KHÔNG dùng qk.news cũ (limit khác, shape
  // khác) để không ghi đè cache danh sách link-target ở ArticleDetail.
  const {
    data: infiniteResult,
    isLoading: loadingFeed,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['news-feed', newsCategory ?? 'all'],
    queryFn: ({ pageParam }) => getNewsPage({ category: newsCategory, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => nextListingPageParam({
      startPage: 1,
      perPage: NEWS_PER_PAGE,
      total: lastPage.total,
      loaded: allPages.reduce((sum, part) => sum + part.data.length, 0),
    }),
    initialData: seedMatch && initialPage
      ? { pages: [initialPage], pageParams: [1] }
      : undefined,
  });
  const articles = useMemo<NewsListItem[]>(
    () => (infiniteResult?.pages ?? []).flatMap(part => part.data),
    [infiniteResult],
  );
  const total = infiniteResult?.pages[0]?.total ?? 0;
  const loading = loadingFeed && !isFetchingNextPage;

  // "Đọc nhiều nhất" là query riêng sắp views DESC — không giới hạn bởi các bài đã
  // load ở feed. Seed bằng SSR để không nháy. Key inline (queryKeys.ts bị khoá).
  const { data: mostViewedRaw = [] } = useQuery({
    queryKey: ['news-most-viewed'],
    queryFn: () => getMostViewedNews(8),
    initialData: initialMostViewed && initialMostViewed.length > 0 ? initialMostViewed : undefined,
    staleTime: 5 * 60_000,
  });

  // Danh mục động từ DB (news_categories) cho tabs/topic-links/preview-group + màu badge.
  // Fallback danh sách chuẩn NEWS_CATEGORIES khi chưa nạp. Nạp xong thì đồng bộ 2 cache
  // runtime (slug-map cho pageToHref, color-map cho badge) để các link/badge ra đúng.
  const { data: categoryRows = [] } = useQuery({
    queryKey: ['news-categories'],
    queryFn: () => getNewsCategories(),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (categoryRows.length) {
      setNewsCategorySlugMap(categoryRows);
      setCategoryColorMap(categoryRows);
    }
  }, [categoryRows]);
  // Nhãn danh mục theo order_index (fallback hằng số khi DB chưa nạp). tabLabels có
  // "Tất cả" ở đầu cho bộ lọc trang tổng.
  const categoryLabels = useMemo<string[]>(
    () => (categoryRows.length ? categoryRows.map(r => r.label) : [...NEWS_CATEGORIES]),
    [categoryRows],
  );
  const tabLabels = useMemo<string[]>(() => ['Tất cả', ...categoryLabels], [categoryLabels]);

  // Sentinel tự bấm "Tải thêm" khi cuộn tới cuối. Nút vẫn bấm tay được nếu observer
  // không chạy (trình duyệt cũ). Chỉ đổi trạng thái ở control, không thay cả feed.
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // activeArticle derive từ detail query — set articleId để mở, undefined để đóng
  const { data: activeArticle = null } = useQuery({
    queryKey: qk.newsArticle(articleId ?? ''),
    queryFn: () => getNewsById(articleId!),
    enabled: !!articleId,
  });

  // Bài liên quan chọn tay (có thể khác category) — resolve theo id để đưa vào pool.
  const manualRelatedIds = asArray<string>(activeArticle?.related_ids);
  const { data: manualRelated = [] } = useQuery({
    queryKey: ['news-related', activeArticle?.id, manualRelatedIds.join(',')],
    queryFn: () => getNewsByIds(manualRelatedIds),
    enabled: manualRelatedIds.length > 0,
  });

  // Tăng view 1 lần mỗi articleId, độc lập cache/refetch
  const viewedRef = useRef<string | null>(null);
  const viewMutation = useMutation({ mutationFn: (id: string) => incrementNewsView(id) });
  useEffect(() => {
    if (articleId && viewedRef.current !== articleId) {
      viewedRef.current = articleId;
      viewMutation.mutate(articleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const newsletterMutation = useMutation({
    mutationFn: (email: string) => subscribe(email, undefined, 'Tin tức'),
    onSuccess: () => { setNewsletterSent(true); setNewsletterEmail(''); },
    onError: () => setNewsletterSent(true), // đã đăng ký hoặc lỗi mạng — vẫn báo thành công
  });
  const newsletterLoading = newsletterMutation.isPending;

  const handleNewsletterSubmit = () => {
    if (!newsletterEmail.trim() || !newsletterEmail.includes('@')) return;
    newsletterMutation.mutate(newsletterEmail.trim());
  };

  const handleBack = () => {
    setArticleId(undefined);
    onNavigate({ name: 'news' }); // điều hướng thật → URL về /tin-tuc, không kẹt ở /tin-tuc/{slug}
  };

  // Layout tạp chí: 1 bài nổi bật lớn + tối đa 4 bài phụ trong lưới 2x2. Phần còn
  // lại KHÔNG cắt — mọi bài đã load đều xuống feed bên dưới để không rơi bài nào.
  const featured = articles[0];
  const heroSide = articles.slice(1, 5);
  const restArticles = articles.slice(5);
  const heroIds = useMemo(
    () => new Set([featured, ...heroSide].filter(Boolean).map((a) => a.id)),
    [featured, heroSide],
  );

  // "Đọc nhiều nhất": query riêng theo views. Loại bài đang ở hero nếu vẫn đủ 5 kết
  // quả, còn không thì giữ nguyên để không trống sidebar.
  const mostViewed = useMemo(() => {
    const filtered = mostViewedRaw.filter((a) => !heroIds.has(a.id));
    return (filtered.length >= 5 ? filtered : mostViewedRaw).slice(0, 5);
  }, [mostViewedRaw, heroIds]);

  // Trang tổng (/tin-tuc): nhóm preview theo danh mục như thiết kế editorial. Route
  // danh mục: một luồng "Mới cập nhật" phẳng gồm mọi bài sau hero.
  const showGroups = category === 'Tất cả';
  const grouped = useMemo(() => {
    if (!showGroups) return [];
    const byCat = new Map<string, NewsListItem[]>();
    for (const a of restArticles) {
      const c = a.category ?? 'Khác';
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(a);
    }
    const ordered = categoryLabels.filter(c => byCat.has(c));
    const extras = Array.from(byCat.keys()).filter(c => !categoryLabels.includes(c));
    return [...ordered, ...extras].map(c => ({ category: c, items: byCat.get(c)! }));
  }, [restArticles, showGroups, categoryLabels]);

  // Feed đầy đủ ở dưới. Route danh mục: mọi bài sau hero. Trang tổng: mọi bài không
  // nằm trong hero VÀ không thuộc preview chuyên mục (lead + 3 phụ mỗi nhóm) để một
  // bài không xuất hiện lặp trong cùng view.
  const feedArticles = useMemo<NewsListItem[]>(() => {
    if (!showGroups) return restArticles;
    const previewIds = new Set<string>();
    for (const group of grouped) for (const a of group.items.slice(0, 4)) previewIds.add(a.id);
    return articles.filter(a => !heroIds.has(a.id) && !previewIds.has(a.id));
  }, [showGroups, restArticles, grouped, articles, heroIds]);

  // Detail view. LƯU Ý: đặt SAU mọi hook (useMemo ở trên) để không vi phạm
  // Rules-of-Hooks — nếu return sớm trước useMemo, render lúc activeArticle=null và
  // lúc có bài sẽ gọi số hook khác nhau → React throw "Rendered fewer hooks".
  if (activeArticle) {
    // Pool = tin tóm tắt đã tải + bài liên quan chọn tay (dedup), xếp: tay trước, tự
    // bù sau. Feed giờ là NewsListItem (không content); pickRelated chỉ chấm điểm theo
    // id/category/focus_keywords/created_at và sidebar chỉ đọc title/slug/image_url —
    // đều có trong NewsListItem, nên cast an toàn ở runtime. manualRelated (NewsArticle
    // đủ trường) ghi đè lên bản tóm tắt cùng id.
    const poolMap = new Map<string, NewsArticle>();
    for (const a of articles) poolMap.set(a.id, a as unknown as NewsArticle);
    for (const a of manualRelated) poolMap.set(a.id, a);
    const related = pickRelated(activeArticle, manualRelatedIds, Array.from(poolMap.values()), 5, Date.now());
    return (
      <ArticleDetail
        article={activeArticle}
        related={related}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative h-64 md:h-80 flex items-center"
        style={{
          backgroundImage:
            `url('${g('hero','image','https://images.pexels.com/photos/261662/pexels-photo-261662.jpeg?auto=compress&w=1200')}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 to-gray-700/60" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 w-full">
          <Breadcrumb
            items={[
              { label: 'Trang chủ', onClick: () => onNavigate({ name: 'home' }) },
              { label: 'Tin tức' },
            ]}
          />
          <h1 className="text-3xl md:text-4xl font-bold text-white mt-3 mb-2">
            {category === 'Tất cả' ? g('hero','title','TIN TỨC BẤT ĐỘNG SẢN') : `TIN ${category.toUpperCase()} BẤT ĐỘNG SẢN`}
          </h1>
          <p className="text-gray-200 text-base md:text-lg max-w-2xl">
            {category === 'Tất cả'
              ? g('hero','subtitle','Cập nhật thị trường, hạ tầng, cơ hội đầu tư mới nhất tại khu vực miền Nam')
              : `Tổng hợp tin tức, phân tích và kiến thức mới nhất về ${category.toLowerCase()} bất động sản.`}
          </p>
        </div>
      </div>

      {/* Category filter */}
      <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          {tabLabels.map((cat) => (
            <Link
              key={cat}
              href={pageToHref({ name: 'news', category: cat })}
              onClick={() => setCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                category === cat
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
              }`}
            >
              {cat}
            </Link>
          ))}
          {!loading && total > 0 && (
            <span className="ml-auto text-xs text-gray-400">Đã xem {articles.length}/{total} bài viết</span>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10 lg:flex gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl overflow-hidden shadow animate-pulse h-72" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-xl h-24 animate-pulse shadow-sm" />)}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            </div>
          ) : articles.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow">
              <p className="text-gray-400 text-lg font-semibold">Chưa có bài viết trong danh mục này.</p>
            </div>
          ) : (
            <>
              {/* Khối nổi bật: 1 bài lớn (2/3) + tối đa 3 bài phụ (1/3) giãn đều theo
                  chiều cao bài lớn để không hở khoảng trống. */}
              {featured && (
                <div className="grid grid-cols-1 gap-5 mb-8 lg:grid-cols-2 lg:items-stretch">
                  <div>
                    <ArticleCard article={featured} large />
                  </div>
                  {heroSide.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:h-full">
                      {heroSide.map((a) => (
                        <div key={a.id} className="min-h-24 lg:min-h-0">
                          <HorizontalCard article={a} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Trang tổng (/tin-tuc): preview theo danh mục — mỗi nhóm 1 card chính
                  + tối đa 3 bài phụ. Đây chỉ là điểm nhấn editorial; feed đầy đủ ở dưới. */}
              {showGroups && grouped.map((group) => {
                const sectionLead = group.items[0];
                const sectionSide = group.items.slice(1, 4);
                return (
                  <section key={group.category} className="mb-10">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="flex items-center gap-3 text-xl font-black text-gray-900">
                        <span className="h-7 w-1 rounded-full bg-red-600" />
                        {group.category}
                      </h2>
                      <Link
                        href={pageToHref({ name: 'news', category: group.category })}
                        className="flex items-center gap-1 text-sm font-semibold text-red-600 hover:underline"
                      >
                        Xem thêm <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    <div className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                      {sectionLead && <ArticleCard article={sectionLead} />}
                      {sectionSide.length > 0 && (
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
                          {sectionSide.map(article => <HorizontalCard key={article.id} article={article} />)}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}

              {/* Feed đầy đủ: route danh mục = "Mới cập nhật" mọi bài sau hero; trang
                  tổng = "Tất cả tin tức" mọi bài không nằm trong hero. Không slice —
                  mọi bài đã load đều render, trang tải thêm nối vào đây. */}
              {feedArticles.length > 0 && (
                <section className="mb-10">
                  <h2 className="mb-4 flex items-center gap-3 text-xl font-black text-gray-900">
                    <span className="h-7 w-1 rounded-full bg-red-600" />
                    {showGroups ? 'Tất cả tin tức' : 'Mới cập nhật'}
                  </h2>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {feedArticles.map(article => <ArticleCard key={article.id} article={article} />)}
                  </div>
                </section>
              )}

              {/* Nút "Tải thêm" (bấm tay/bàn phím) + sentinel observer. Chỉ đổi trạng
                  thái ở đây, không thay cả feed khi tải trang kế. */}
              {(hasNextPage || isFetchingNextPage) && (
                <div ref={loadMoreRef} className="mt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage || !hasNextPage}
                    className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                  >
                    {isFetchingNextPage ? 'Đang tải...' : 'Tải thêm bài viết'}
                  </button>
                </div>
              )}
              {!hasNextPage && total > 0 && articles.length >= total && (
                <p className="mt-2 text-center text-xs text-gray-400">Đã hiển thị tất cả {total} bài viết.</p>
              )}
            </>
          )}
        </div>

        {/* Sidebar */}
        <aside className="mt-8 w-full shrink-0 lg:mt-0 lg:w-72">
          <div className="space-y-5 lg:sticky lg:top-24">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h4 className="mb-4 flex items-center gap-2 text-lg font-black text-gray-900">
                <span className="h-7 w-1 rounded-full bg-red-600" /> Đọc nhiều nhất
              </h4>
              <div className="space-y-4">
                {mostViewed.map((a, i) => {
                  const img = (a as any).image_url || 'https://images.pexels.com/photos/1396132/pexels-photo-1396132.jpeg?auto=compress&w=200';
                  const views = (a as any).views ?? 0;
                  return (
                    <Link key={a.id} href={articleHref(a)} className="group flex w-full gap-3 text-left transition-opacity hover:opacity-80">
                      <span className="w-5 shrink-0 pt-0.5 text-center text-lg font-black leading-none text-gray-300">{i + 1}</span>
                      <img src={img} alt={buildNewsImageAlt(a)} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-700 transition-colors group-hover:text-red-600">{a.title}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-gray-400"><Eye className="h-3 w-3" /> {views.toLocaleString('vi-VN')} lượt xem</p>
                      </div>
                    </Link>
                  );
                })}
                {loading && <div className="h-20 animate-pulse rounded-lg bg-gray-100" />}
                {!loading && mostViewed.length === 0 && <p className="text-sm text-gray-400">Chưa có bài viết nào khác.</p>}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h4 className="mb-4 flex items-center gap-2 text-lg font-black text-gray-900">
                <span className="h-7 w-1 rounded-full bg-red-600" /> Chủ đề nổi bật
              </h4>
              <div className="flex flex-wrap gap-2">
                {categoryLabels.map(cat => (
                  <Link key={cat} href={pageToHref({ name: 'news', category: cat })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:border-red-300 hover:text-red-600">
                    {cat}
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-red-50 p-5">
              <h5 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-gray-800"><Mail className="h-4 w-4 text-red-500" />{g('newsletter','title','Nhận tin tức mới nhất')}</h5>
              <p className="mb-3 text-xs text-gray-500">{g('newsletter','subtitle','Đăng ký để nhận cập nhật thị trường hàng tuần')}</p>
              {newsletterSent ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"><CheckCircle className="h-4 w-4" />Đã đăng ký thành công!</div>
              ) : (
                <>
                  <input type="email" value={newsletterEmail} onChange={e => setNewsletterEmail(e.target.value)} placeholder={g('newsletter','placeholder','Email của bạn')} className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400" onKeyDown={e => e.key === 'Enter' && !newsletterLoading && handleNewsletterSubmit()} />
                  <button onClick={handleNewsletterSubmit} disabled={newsletterLoading || !newsletterEmail.trim()} className="w-full rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60">{newsletterLoading ? 'Đang đăng ký...' : g('newsletter','btn','Đăng ký')}</button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}