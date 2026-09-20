import React from 'react';
import Link from 'next/link';
import type { NewsListItem } from '@/lib/supabase';
import { stripHtml } from '@/lib/markdown';
import { LocalityImage } from './LocalityImage';
import styles from './localityVisual.module.css';

function articleHref(article: Pick<NewsListItem, 'slug'>): string {
  return `/tin-tuc/${article.slug}`;
}

export function LocalityArticleDate({ value, className = 'text-xs text-gray-500' }: { value: string; className?: string }) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  return <time dateTime={value} className={className}>{date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })}</time>;
}

function readMinutes(article: NewsListItem): number {
  const words = stripHtml(article.excerpt ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function NewsCard({ article, priority = false }: { article: NewsListItem; priority?: boolean }) {
  const category = article.category?.trim();
  return (
    <article className={styles.newsEditorialCard}>
      <Link href={articleHref(article)} className={styles.newsEditorialLink}>
        <LocalityImage
          src={article.image_url}
          alt={article.title}
          className={styles.newsEditorialImage}
          imageClassName={styles.newsImageContent}
          priority={priority}
        />
        <div className={styles.newsEditorialBody}>
          {category && <span className={styles.newsCategory}>{category}</span>}
          <h3 className={styles.newsEditorialTitle}>{article.title}</h3>
          {article.excerpt && <p className={styles.newsEditorialExcerpt}>{stripHtml(article.excerpt)}</p>}
          <div className={styles.newsEditorialMeta}>
            <span><LocalityArticleDate value={article.created_at} /></span>
            <span>{readMinutes(article)} phút đọc</span>
            <span className={styles.newsEditorialArrow}>Đọc <span aria-hidden="true">→</span></span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function TopicChips({ categories }: { categories: string[] }) {
  return (
    <div className={styles.newsTopicChips}>
      {categories.map(category => <span key={category} className={styles.newsTopicChip}>{category}</span>)}
    </div>
  );
}

function TeaserNewsStrip({ areaName, newsPath, articles }: { areaName: string; newsPath?: string; articles: NewsListItem[] }) {
  return <section className={`${styles.scope} ${styles.newsroomSection}`} aria-label="Tin tức khu vực" aria-labelledby="locality-news" data-variant="teaser">
    <header className={styles.newsPanelHeading}>
      <div>
        <p className={styles.newsPanelEyebrow}>Tin tức khu vực</p>
        <h2 id="locality-news" className={styles.newsPanelTitle}>Tin tức bất động sản mới nhất tại {areaName}</h2>
      </div>
      {newsPath && <Link href={newsPath} className={styles.newsPanelLink}>Xem tất cả <span aria-hidden="true">→</span></Link>}
    </header>
    <ul className={styles.newsStrip} data-testid="locality-news-strip">
      {articles.slice(0, 4).map(article => <li key={article.id} className={styles.newsStripItem}>
        <LocalityArticleDate value={article.created_at} />
        <Link href={articleHref(article)} className={styles.newsStripLink}>{article.title}</Link>
      </li>)}
    </ul>
  </section>;
}
export function LocalityNewsSection({ areaName, newsPath, articles, variant = 'teaser' }: {
  areaName: string;
  newsPath?: string;
  articles: NewsListItem[];
  variant?: 'magazine' | 'teaser';
}) {
  if (!articles.length) return null;
  const magazine = variant === 'magazine';
  if (!magazine) return <TeaserNewsStrip areaName={areaName} newsPath={newsPath} articles={articles} />;
  const displayedArticles = articles.slice(0, 6);
  const categories = [...new Set(displayedArticles.map(article => article.category?.trim()).filter((category): category is string => Boolean(category)))].slice(0, 8);

  return (
    <section className={`${styles.scope} ${styles.newsroomSection}`} aria-label="Tin tức khu vực" aria-labelledby="locality-news" data-variant={variant}>
      <header className={styles.newsEditorialHeader}>
        <div>
          <p className={styles.newsPanelEyebrow}>{magazine ? 'Tin tức bất động sản' : 'Tin tức mới nhất'}</p>
          <h2 id="locality-news" className={styles.newsPanelTitle}>Tin tức bất động sản mới nhất tại {areaName}</h2>
          <p className={styles.newsroomIntro}>Cập nhật thông tin thị trường, quy hoạch và những diễn biến đáng chú ý trong khu vực.</p>
        </div>
        <div className={styles.newsPanelActions}>
          <span className={styles.newsPanelCount}>{articles.length} bài viết</span>
          {newsPath && <Link href={newsPath} className={styles.newsPanelLink}>Xem tất cả <span aria-hidden="true">→</span></Link>}
        </div>
      </header>

      <div className={styles.newsEditorialLayout} data-testid="locality-news-main" data-layout="editorial-grid">
        <div className={styles.newsEditorialGrid}>
          {displayedArticles.map((article, index) => <NewsCard key={article.id} article={article} priority={index === 0} />)}
        </div>
        <aside className={styles.newsEditorialSidebar} aria-label="Chủ đề nổi bật">
          <div>
            <p className={styles.newsBlockLabel}>Khám phá thêm</p>
            <h3 className={styles.newsBlockTitle}>Chủ đề nổi bật</h3>
          </div>
          {categories.length > 0 && <TopicChips categories={categories} />}
          {newsPath && (
            <div className={styles.newsEditorialCta}>
              <p className={styles.newsBlockLabel}>Tin tức khu vực</p>
              <p className={styles.newsEditorialCtaText}>Xem toàn bộ bài viết mới nhất tại {areaName}.</p>
              <Link href={newsPath} className={styles.newsRailCta}>Xem tất cả tin tức <span aria-hidden="true">→</span></Link>
            </div>
          )}
        </aside>
      </div>

      {magazine && (
        <>
          <section className={styles.newsEditorialIntro} aria-labelledby="locality-news-intro">
            <div>
              <h3 id="locality-news-intro">Tin tức bất động sản mới nhất tại {areaName}</h3>
              <p>Chuyên trang tổng hợp các bài viết được gắn với {areaName} từ nguồn nội dung công khai. Nội dung được trình bày theo nhóm chủ đề để bạn dễ theo dõi thị trường và khu vực quan tâm.</p>
            </div>
            <div className={styles.newsEditorialIntroColumns}>
              <div><h4>Chuyên mục tin tức đa dạng</h4><p>Thông tin quy hoạch, thị trường, đầu tư, pháp lý và kinh nghiệm mua bán được phân loại rõ ràng.</p></div>
              <div><h4>Giá trị thông tin tại {areaName}</h4><p>Mỗi bài viết giữ nguyên nguồn và thời điểm công khai, không suy diễn thành số liệu thị trường ngoài dữ liệu.</p></div>
            </div>
          </section>

          <section className={styles.newsTrendSection} aria-labelledby="locality-news-trends">
            <h3 id="locality-news-trends">Cập nhật xu hướng - Nắm bắt cơ hội</h3>
            <div className={styles.newsTrendGrid}>
              <div><strong>Cập nhật 24/7</strong><span>Tin tức được bổ sung theo nguồn nội dung đã xuất bản.</span></div>
              <div><strong>Dữ liệu có nguồn</strong><span>Thông tin hiển thị theo bài viết và thời điểm công khai.</span></div>
              <div><strong>Góc nhìn chuyên gia</strong><span>Đọc thêm phân tích và hướng dẫn theo từng chủ đề.</span></div>
            </div>
          </section>

          <section className={styles.newsTrustBlock} aria-label="Cam kết thông tin">
            <h3>Người dùng hoàn toàn tin cậy</h3>
            <p>Chúng tôi ưu tiên nội dung rõ nguồn, đúng phạm vi khu vực và minh bạch về giới hạn dữ liệu.</p>
          </section>
        </>
      )}
    </section>
  );
}
