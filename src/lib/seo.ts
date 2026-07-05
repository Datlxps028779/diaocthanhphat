type SeoMeta = {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogType?: string;
  twitterCard?: string;
};

function setMeta(name: string, content: string, property = false) {
  const attr = property ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLinkTag(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function applySeoMeta(meta: SeoMeta) {
  if (meta.title) document.title = meta.title;
  if (meta.description) setMeta('description', meta.description);
  if (meta.keywords) setMeta('keywords', meta.keywords);

  const ogTitle = meta.ogTitle ?? meta.title ?? '';
  const ogDesc = meta.ogDescription ?? meta.description ?? '';

  if (ogTitle) setMeta('og:title', ogTitle, true);
  if (ogDesc) setMeta('og:description', ogDesc, true);
  if (meta.ogImage) setMeta('og:image', meta.ogImage, true);
  setMeta('og:url', meta.ogUrl ?? window.location.href, true);
  setMeta('og:type', meta.ogType ?? 'website', true);

  // Open Graph cho Zalo/Facebook
  if (meta.ogImage) {
    setMeta('og:image:width', '1200', true);
    setMeta('og:image:height', '630', true);
  }

  // Twitter Cards
  if (ogTitle) setMeta('twitter:title', ogTitle);
  if (ogDesc) setMeta('twitter:description', ogDesc);
  if (meta.ogImage) setMeta('twitter:image', meta.ogImage);
  setMeta('twitter:card', meta.twitterCard ?? 'summary_large_image');

  // Canonical URL
  if (meta.ogUrl) setLinkTag('canonical', meta.ogUrl);
}

// Hàm áp dụng SEO cho Property — hỗ trợ meta_title, meta_description, focus_keywords, schema_markup
export function applyPropertySeo(property: {
  title: string;
  description?: string;
  price?: number;
  priceUnit?: string;
  image_url?: string;
  city?: string;
  district?: string;
  slug?: string;
  meta_title?: string | null;
  meta_description?: string | null;
  focus_keywords?: string | null;
  schema_markup?: Record<string, unknown> | null;
}) {
  // Ưu tiên meta_title/meta_description nếu có, fallback tự động
  const title = property.meta_title
    ?? `${property.title} - ${property.price ? property.price + ' ' + (property.priceUnit ?? 'tỷ') : ''} | BĐS Bình Dương`;
  const description = property.meta_description
    ?? property.description
    ?? `Bất động sản ${property.title} tại ${property.district ?? ''}, ${property.city ?? 'Bình Dương'}. Giá tốt, pháp lý minh bạch. Liên hệ ngay!`;
  const keywords = property.focus_keywords
    ?? `bất động sản, ${property.city ?? 'Bình Dương'}, ${property.district ?? ''}, ${property.title}`;

  const canonicalUrl = property.slug
    ? `${window.location.origin}/bat-dong-san/${property.slug}`
    : window.location.href;

  applySeoMeta({
    title,
    description,
    keywords,
    ogTitle: title,
    ogDescription: description,
    ogImage: property.image_url,
    ogUrl: canonicalUrl,
    ogType: 'article',
    twitterCard: 'summary_large_image',
  });

  // Render JSON-LD schema markup nếu có
  if (property.schema_markup) {
    let script = document.querySelector('script[type="application/ld+json"]') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(property.schema_markup);
  }
}

// Hàm áp dụng SEO cho News
export function applyNewsSeo(article: {
  title: string;
  excerpt?: string;
  image_url?: string;
  slug?: string;
}) {
  const title = `${article.title} | BĐS Bình Dương`;
  const description = article.excerpt 
    ?? article.title;
  
  applySeoMeta({
    title,
    description,
    keywords: `tin tức bất động sản, ${article.title}`,
    ogTitle: title,
    ogDescription: description,
    ogImage: article.image_url,
    ogUrl: article.slug ? `${window.location.origin}/tin-tuc/${article.slug}` : window.location.href,
    ogType: 'article',
    twitterCard: 'summary_large_image',
  });
}
