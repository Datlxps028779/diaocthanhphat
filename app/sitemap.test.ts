import { describe, expect, it } from 'vitest';
import sitemap from './sitemap';

describe('public sitemap', () => {
  it('always emits the approved canonical origin, never the deployment origin', async () => {
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(entry => entry.url.startsWith('https://chonhaviet.com/'))).toBe(true);
    expect(entries.some(entry => entry.url.includes('vercel.app'))).toBe(false);
  });
});
