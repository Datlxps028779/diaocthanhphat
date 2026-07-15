export const FALLBACK_PROPERTY_IMAGE = 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg';

export function buildPropertyGallery(
  imageUrl: string | null | undefined,
  images: Array<string | null | undefined> | null | undefined,
): string[] {
  const seen = new Set<string>();
  const gallery: string[] = [];
  for (const raw of [imageUrl, ...(images ?? [])]) {
    const url = raw?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    gallery.push(url);
  }
  return gallery.length > 0 ? gallery : [FALLBACK_PROPERTY_IMAGE];
}
