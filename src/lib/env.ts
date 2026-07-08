// Đọc cấu hình Supabase. Ưu tiên NEXT_PUBLIC_* (Next inline vào client bundle),
// fallback VITE_* để phía SERVER vẫn chạy nếu Vercel còn đặt tên biến cũ.
// LƯU Ý: client bundle CHỈ nhận được NEXT_PUBLIC_* (Next inline lúc build) — fallback
// VITE_* chỉ có tác dụng ở server (process.env đọc mọi tên).
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
