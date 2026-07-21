import { supabase } from '../supabase';

// Client gọi API route /api/admin/generate-article. Đính access_token của phiên hiện tại
// làm Bearer để route xác thực admin. Route sinh bài bằng Claude rồi lưu NHÁP vào news.

export interface GenerateArticleResult {
  id: string;
  slug: string;
  title: string;
}

async function authHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function generateArticleAI(input: {
  keyword: string;
  district?: string;
  ward?: string;
}): Promise<GenerateArticleResult> {
  const res = await fetch('/api/admin/generate-article', {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Không tạo được bài viết.');
  return json as GenerateArticleResult;
}
