// Lấy ảnh minh hoạ từ Pexels API theo từ khoá. Chạy SERVER-SIDE (PEXELS_API_KEY không
// tới client). Degrade êm: thiếu key / lỗi / không kết quả → trả null, KHÔNG chặn tạo bài.

export type PexelsImage = {
  url: string;
  photographer: string;
  sourceUrl: string;
};

export async function fetchPexelsImage(query: string): Promise<PexelsImage | null> {
  const apiKey = process.env.PEXELS_API_KEY || '';
  if (!apiKey || !query.trim()) return null;

  const params = new URLSearchParams({
    query: query.trim(),
    per_page: '1',
    orientation: 'landscape',
    locale: 'vi-VN',
  });

  try {
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data?.photos?.[0];
    if (!photo) return null;
    // Ưu tiên bản "large" (hợp featured image, không quá nặng).
    const url: string | undefined = photo.src?.large || photo.src?.original || photo.src?.medium;
    if (!url) return null;
    return {
      url,
      photographer: photo.photographer || '',
      sourceUrl: photo.url || '',
    };
  } catch {
    return null;
  }
}
