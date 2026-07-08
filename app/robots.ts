import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.SITE_URL || 'https://diaocthanhphat.com').replace(/\/$/, '');

// robots.txt động — Next phục vụ tại /robots.txt. Cho phép AI crawler (SEO AI) +
// search engine, chặn khu quản trị và trang riêng tư.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: [
          '*',
          // AI crawler — cho phép rõ ràng để nội dung xuất hiện trong câu trả lời AI
          'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
          'ClaudeBot', 'Claude-Web',
          'PerplexityBot', 'Google-Extended', 'Applebot-Extended',
        ],
        allow: '/',
        disallow: ['/quantrihethong', '/tai-khoan', '/tin-cua-toi'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
