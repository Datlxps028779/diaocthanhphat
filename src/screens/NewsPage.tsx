'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calendar, Clock, Tag, ChevronRight, ArrowRight, Eye, Mail, CheckCircle } from 'lucide-react';
import { type NewsArticle } from '../lib/supabase';
import { getNews, getNewsById, getNewsByIds, subscribe, getPageBlocks, pageBlocksToMap, incrementNewsView } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { type Page, pageToHref } from '../lib/router';
import { Breadcrumb } from '../components/Layout';
import { useSetting } from '../lib/cms';
import { renderMarkdownContent, isHtmlContent, stripHtml } from '../lib/markdown';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml';
import { pickRelated } from '../lib/relatedNews';

const CATEGORIES = ['Tất cả', 'Thị trường', 'Hạ tầng', 'Đầu tư', 'Hướng dẫn', 'Tài chính'];

const categoryColors: Record<string, string> = {
  'Thị trường': 'bg-blue-100 text-blue-700',
  'Hạ tầng': 'bg-green-100 text-green-700',
  'Đầu tư': 'bg-amber-100 text-amber-700',
  'Hướng dẫn': 'bg-purple-100 text-purple-700',
  'Tài chính': 'bg-red-100 text-red-700',
};

function categoryBadge(cat: string) {
  return categoryColors[cat] ?? 'bg-gray-100 text-gray-600';
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
  article: NewsArticle;
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
      <Link href={href} className="block bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow md:flex group">
        <div className="md:w-1/2 h-56 md:h-auto overflow-hidden flex-shrink-0">
          <img src={imgUrl} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        </div>
        <div className="p-6 flex flex-col justify-between md:w-1/2">
          <div>
            <div className="flex items-center gap-2 mb-3">
              {cat && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${categoryBadge(cat)}`}>
                  {cat}
                </span>
              )}
              <span className="text-xs text-gray-400">Nổi bật</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 line-clamp-3 leading-snug group-hover:text-red-600 transition-colors">{article.title}</h2>
            <p className="text-gray-500 text-sm line-clamp-3">{article.excerpt}</p>
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> {formatDate((article as any).published_at ?? (article as any).created_at ?? '')}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {readMin} phút đọc
            </span>
            <span className="ml-auto flex items-center gap-1 text-red-600 font-semibold group-hover:underline text-xs">
              Đọc tiếp <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow flex flex-col group">
      <div className="h-44 overflow-hidden">
        <img src={imgUrl} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      </div>
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
  const href = articleHref(article);
  const canonicalUrl = href;
  const rawContent: string = (article as any).content ?? article.excerpt ?? '';
  const contentIsHtml = isHtmlContent(rawContent);
  const safeHtml = useMemo(
    () => (contentIsHtml ? sanitizeArticleHtml(rawContent) : ''),
    [rawContent, contentIsHtml],
  );
  const markdownBlocks = contentIsHtml ? null : renderMarkdownContent(rawContent);
  const relatedArticles = related.slice(0, 5);
  const relatedHref = (item: NewsArticle) => articleHref(item);
  const phone = useSetting('phone_hotline', '0901 234 567');
  const imgUrl =
    (article as any).image_url ||
    'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&w=1200';
  const tags: string[] = (article as any).tags ?? [];
  const cat = (article as any).category ?? '';
  const geoArea = article.geo_area?.trim();
  const geoEntity = article.geo_entity?.trim();
  const readMin = estimateReadTime(contentIsHtml ? stripHtml(rawContent) : rawContent);
  const pubDate = formatDate((article as any).published_at ?? (article as any).created_at ?? new Date().toISOString());

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative h-64 md:h-96 flex items-end"
        style={{ backgroundImage: `url('${imgUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
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
          <div className="mt-4 text-xs text-gray-400 break-all">URL: {canonicalUrl}</div>
          <div className="sr-only">{href}</div>

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
          {article.faq && article.faq.length > 0 && (
            <div className="mt-10 pt-6 border-t border-gray-200">
              <h2 className="font-bold text-gray-900 text-lg mb-4">Câu hỏi thường gặp</h2>
              <div className="divide-y divide-gray-100">
                {article.faq.map((item, i) => (
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
                    <img src={rImg} alt={r.title} className="w-16 h-16 rounded-lg object-cover shrink-0" />
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
export function NewsPage({ onNavigate, articleId: initialArticleId, initialArticles }: { onNavigate: (p: Page) => void; articleId?: string; initialArticles?: NewsArticle[] }) {
  const [category, setCategory] = useState('Tất cả');
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
  const { data: articles = [], isLoading: loading } = useQuery({
    queryKey: qk.news(newsCategory),
    queryFn: () => getNews(newsCategory),
    // Seed SSR khi ở category mặc định (server prefetch toàn bộ tin mới nhất).
    initialData: !newsCategory && initialArticles ? initialArticles : undefined,
  });

  // activeArticle derive từ detail query — set articleId để mở, undefined để đóng
  const { data: activeArticle = null } = useQuery({
    queryKey: qk.newsArticle(articleId ?? ''),
    queryFn: () => getNewsById(articleId!),
    enabled: !!articleId,
  });

  // Bài liên quan chọn tay (có thể khác category) — resolve theo id để đưa vào pool.
  const manualRelatedIds = activeArticle?.related_ids ?? [];
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Detail view
  if (activeArticle) {
    // Pool = tin đã tải + bài liên quan chọn tay (dedup), rồi xếp: tay trước, tự bù sau.
    const poolMap = new Map<string, NewsArticle>();
    for (const a of [...articles, ...manualRelated]) poolMap.set(a.id, a);
    const related = pickRelated(activeArticle, manualRelatedIds, Array.from(poolMap.values()), 5, Date.now());
    return (
      <ArticleDetail
        article={activeArticle}
        related={related}
        onBack={handleBack}
      />
    );
  }

  const featured = articles[0];
  const rest = articles.slice(1);

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
          <h1 className="text-3xl md:text-4xl font-bold text-white mt-3 mb-2">{g('hero','title','TIN TỨC BẤT ĐỘNG SẢN')}</h1>
          <p className="text-gray-200 text-base md:text-lg max-w-2xl">
            {g('hero','subtitle','Cập nhật thị trường, hạ tầng, cơ hội đầu tư mới nhất tại khu vực miền Nam')}
          </p>
        </div>
      </div>

      {/* Category filter */}
      <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                category === cat
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10 lg:flex gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl overflow-hidden shadow animate-pulse h-64" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            </div>
          ) : articles.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow">
              <p className="text-gray-400 text-lg font-semibold">Chưa có bài viết trong danh mục này.</p>
            </div>
          ) : (
            <>
              {/* Featured */}
              {featured && (
                <div className="mb-8">
                  <ArticleCard
                    article={featured}
                    large
                  />
                </div>
              )}

              {/* Grid */}
              {rest.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {rest.map((a) => (
                    <ArticleCard
                      key={a.id}
                      article={a}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sidebar */}
        <aside className="hidden lg:block w-72 shrink-0 mt-0">
          <div className="bg-white rounded-2xl shadow p-5 sticky top-24">
            <h4 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide">Bài viết nổi bật</h4>
            <div className="space-y-4">
              {articles.slice(0, 5).map((a) => {
                const img = (a as any).image_url || 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&w=200';
                const cat = (a as any).category ?? '';
                return (
                  <Link
                    key={a.id}
                    href={articleHref(a)}
                    className="flex gap-3 text-left w-full hover:opacity-80 transition-opacity group"
                  >
                    <img src={img} alt={a.title} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                    <div>
                      {cat && (
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${categoryBadge(cat)}`}>{cat}</span>
                      )}
                      <p className="text-sm text-gray-700 font-medium line-clamp-2 leading-snug mt-0.5 group-hover:text-red-600 transition-colors">
                        {a.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate((a as any).published_at ?? (a as any).created_at ?? '')}
                      </p>
                    </div>
                  </Link>
                );
              })}
              {loading && (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-16 h-16 bg-gray-200 rounded-lg shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-200 rounded" />
                        <div className="h-3 bg-gray-200 rounded w-4/5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Newsletter CTA */}
            <div className="mt-6 bg-red-50 rounded-xl p-4">
              <h5 className="font-bold text-gray-800 text-sm mb-1 flex items-center gap-1.5"><Mail className="w-4 h-4 text-red-500" />{g('newsletter','title','Nhận tin tức mới nhất')}</h5>
              <p className="text-gray-500 text-xs mb-3">{g('newsletter','subtitle','Đăng ký để nhận cập nhật thị trường hàng tuần')}</p>
              {newsletterSent ? (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />Đã đăng ký thành công!
                </div>
              ) : (
                <>
                  <input
                    type="email"
                    value={newsletterEmail}
                    onChange={e => setNewsletterEmail(e.target.value)}
                    placeholder={g('newsletter','placeholder','Email của bạn')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-red-400 mb-2"
                    onKeyDown={e => e.key === 'Enter' && !newsletterLoading && handleNewsletterSubmit()}
                  />
                  <button
                    onClick={handleNewsletterSubmit}
                    disabled={newsletterLoading || !newsletterEmail.trim()}
                    className="w-full py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
                  >
                    {newsletterLoading ? 'Đang đăng ký...' : g('newsletter','btn','Đăng ký')}
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}