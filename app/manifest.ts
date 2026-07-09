import type { MetadataRoute } from 'next';

// Web manifest — Next phục vụ tại /manifest.webmanifest. Hỗ trợ mobile SEO,
// "Thêm vào màn hình chính", và giúp Google hiểu metadata ứng dụng.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BĐS Bình Dương – Mua Bán Cho Thuê Bất Động Sản',
    short_name: 'BĐS Bình Dương',
    description: 'Mua bán, cho thuê bất động sản, đất nền sổ đỏ chính chủ tại Bình Dương và khu vực lân cận.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#dc2626',
    lang: 'vi',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
