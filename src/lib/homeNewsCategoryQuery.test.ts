import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/LandingPage.tsx'), 'utf8');

describe('homepage news category queries', () => {
  it('fetches the selected category instead of filtering the global latest window', () => {
    expect(source).toContain('queryKey: qk.news(selectedNewsCategory, 20)');
    expect(source).toContain('queryFn: () => getNews(selectedNewsCategory, 20)');
    expect(source).toContain('const currentNews = selectedNewsCategory ? selectedCategoryNews : news;');
    expect(source).not.toContain('news.filter(article => article.category === effectiveNewsTab)');
  });

  it('falls back to the all-news tab when an admin category disappears', () => {
    expect(source).toContain("const effectiveNewsTab = homeNewsTabs.includes(activeNewsTab) ? activeNewsTab : 'Tin tức';");
    expect(source).toContain("const selectedNewsCategory = effectiveNewsTab === 'Tin tức' ? undefined : effectiveNewsTab;");
  });
});
