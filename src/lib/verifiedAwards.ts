import type { ContentCollectionItem } from './pageContentSchema';

export type VerifiedAward = {
  title: string;
  issuer: string;
  year: string;
  description: string;
  image: string;
  sourceUrl: string;
};

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function verifiedAwards(items: ContentCollectionItem[]): VerifiedAward[] {
  return items.flatMap(item => {
    const title = String(item.title ?? '').trim();
    const sourceUrl = safeExternalUrl(String(item.source_url ?? ''));
    if (!title || !sourceUrl) return [];

    return [{
      title,
      issuer: String(item.issuer ?? '').trim(),
      year: String(item.year ?? '').trim(),
      description: String(item.description ?? '').trim(),
      image: String(item.image ?? '').trim(),
      sourceUrl,
    }];
  });
}
