import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/siteUrl';

const SITE_URL = getSiteUrl();

// robots.txt động — Next phục vụ tại /robots.txt. Private routes dùng authorization
// và noindex trực tiếp; không liệt kê chúng ở đây để tránh biến robots thành chỉ dẫn discovery.
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
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemap-images.xml`],
  };
}
