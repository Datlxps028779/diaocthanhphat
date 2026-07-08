import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Endpoint chẩn đoán: báo server THẤY biến env nào (chỉ boolean, KHÔNG lộ giá trị).
// Dùng để phân biệt lỗi "tên biến sai" vs "chưa set" trên Vercel. Xoá sau khi xong.
export async function GET() {
  const present = (v?: string) => Boolean(v && v.length > 0);
  return NextResponse.json({
    ok: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: present(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: present(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      VITE_SUPABASE_URL: present(process.env.VITE_SUPABASE_URL),
      VITE_SUPABASE_ANON_KEY: present(process.env.VITE_SUPABASE_ANON_KEY),
      SITE_URL: present(process.env.SITE_URL),
    },
    // Prefix URL (an toàn để lộ — không phải secret) giúp xác nhận project ref đúng
    urlPrefix: (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').slice(0, 30),
  });
}
