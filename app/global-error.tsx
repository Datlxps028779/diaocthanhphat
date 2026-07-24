'use client';
import { useEffect } from 'react';

// Global error boundary — chỉ kích hoạt khi chính root layout.tsx throw (app/error.tsx
// KHÔNG bắt được lỗi ở tầng layout). Phải tự render <html>/<body> vì thay thế toàn
// bộ cây. Giữ tối giản, không phụ thuộc CSS/asset (có thể chưa tải được khi lỗi shell).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[Global error boundary]', error);
  }, [error]);

  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>Đã có lỗi xảy ra</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '28rem' }}>
            Xin lỗi vì sự bất tiện. Bạn thử tải lại trang, nếu vẫn lỗi vui lòng quay lại sau ít phút.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={reset} style={{ background: '#dc2626', color: '#fff', fontWeight: 600, padding: '0.625rem 1.25rem', borderRadius: '0.5rem', fontSize: '0.875rem', border: 'none', cursor: 'pointer' }}>
              Thử lại
            </button>
            <a href="/" style={{ border: '1px solid #ef4444', color: '#dc2626', fontWeight: 600, padding: '0.625rem 1.25rem', borderRadius: '0.5rem', fontSize: '0.875rem', textDecoration: 'none' }}>
              Về trang chủ
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
