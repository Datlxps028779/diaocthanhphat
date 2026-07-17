export type AppendImageUrlsResult = {
  images: string[];
  added: string[];
  skippedDuplicate: string[];
  skippedOverflow: string[];
};

function cleanUrl(url: string): string {
  return url.trim();
}

export function appendImageUrls(existing: string[], incoming: string[], maxImages: number): AppendImageUrlsResult {
  const images = existing.map(cleanUrl).filter(Boolean);
  const seen = new Set(images);
  const added: string[] = [];
  const skippedDuplicate: string[] = [];
  const skippedOverflow: string[] = [];

  for (const raw of incoming) {
    const url = cleanUrl(raw);
    if (!url) continue;
    if (seen.has(url)) {
      skippedDuplicate.push(url);
      continue;
    }
    if (images.length >= maxImages) {
      skippedOverflow.push(url);
      continue;
    }
    images.push(url);
    seen.add(url);
    added.push(url);
  }

  return { images, added, skippedDuplicate, skippedOverflow };
}
