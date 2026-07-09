import Link from 'next/link';

// Trang 404 có thương hiệu (thay trang mặc định tiếng Anh của Next). Được dùng khi
// notFound() gọi ở property/news detail hoặc route không tồn tại.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      <div className="text-7xl font-black text-red-600 mb-2">404</div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Không tìm thấy trang</h1>
      <p className="text-gray-500 text-sm mb-6 max-w-md">
        Bất động sản hoặc trang bạn tìm có thể đã được bán, gỡ hoặc đổi đường dẫn.
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <Link href="/" className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
          Về trang chủ
        </Link>
        <Link href="/danh-sach" className="border border-red-500 text-red-600 hover:bg-red-50 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
          Xem tất cả bất động sản
        </Link>
      </div>
    </div>
  );
}
