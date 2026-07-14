'use client';
import { useEffect } from 'react';
import Link from 'next/link';

// Nhận diện lỗi tải chunk (xảy ra sau khi deploy bản mới: client cache đi tải chunk
// lazy có hash cũ đã biến mất). Tải lại trang là lấy được manifest mới → hết lỗi.
function isChunkLoadError(error: Error): boolean {
  return error.name === 'ChunkLoadError'
    || /Loading chunk [\w-]+ failed/i.test(error.message)
    || /Failed to fetch dynamically imported module/i.test(error.message);
}

// Error boundary toàn cục cho App Router. Bắt lỗi runtime ở server/client component,
// hiển thị UI có thương hiệu thay vì màn hình lỗi trắng, kèm nút thử lại.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[App error boundary]', error);
    // Lỗi tải chunk sau deploy → tự tải lại 1 lần. Dùng dấu thời gian để chỉ chặn
    // lặp trong 10s (phòng bản deploy hỏng gây reload vô hạn); deploy lần sau vẫn
    // tự phục hồi được. Người dùng không phải bấm "Thử lại" thủ công.
    if (isChunkLoadError(error)) {
      const KEY = 'chunk-reload-at';
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Đã có lỗi xảy ra</h1>
      <p className="text-gray-500 text-sm mb-6 max-w-md">
        Xin lỗi vì sự bất tiện. Bạn thử tải lại trang, nếu vẫn lỗi vui lòng quay lại sau ít phút.
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <button onClick={reset} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
          Thử lại
        </button>
        <Link href="/" className="border border-red-500 text-red-600 hover:bg-red-50 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
