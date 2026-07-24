/** @type {import('next').NextConfig} */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Supabase Storage
      ...(supabaseHost ? [{ protocol: 'https', hostname: supabaseHost }] : []),
      // Ảnh minh hoạ/nguồn ngoài thường dùng
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  async rewrites() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return [];
    return [
      {
        source: '/hinh-anh/:bucket/:path*',
        destination: `${supabaseUrl}/storage/v1/object/public/:bucket/:path*`,
      },
    ];
  },
};

export default nextConfig;
