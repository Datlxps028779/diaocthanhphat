'use client';
import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getConsent, setConsent, CONSENT_EVENT, type ConsentStatus } from '@/lib/consent';

// GA4 dùng cookie → chỉ nạp khi (1) có NEXT_PUBLIC_GA_ID và (2) user đã bấm "Đồng ý".
// Vercel Analytics/Speed Insights cookieless đã chạy độc lập ở layout, không phụ
// thuộc consent này. Banner chỉ hiện khi trạng thái 'unset' (chưa quyết định).
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function AnalyticsConsent() {
  const [status, setStatus] = useState<ConsentStatus>('unset');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setStatus(getConsent());
    const onChange = () => setStatus(getConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  const loadGa = mounted && !!GA_ID && status === 'granted';
  const showBanner = mounted && !!GA_ID && status === 'unset';

  return (
    <>
      {loadGa && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      )}

      {showBanner && (
        <div className="fixed bottom-0 inset-x-0 z-[60] bg-gray-900 text-white px-4 py-3 shadow-2xl">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-3 text-sm">
            <p className="flex-1 text-gray-200 text-center sm:text-left">
              Chúng tôi dùng cookie phân tích để cải thiện trải nghiệm. Bạn đồng ý cho phép đo lường ẩn danh chứ?
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setConsent('denied')}
                className="px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                Từ chối
              </button>
              <button
                onClick={() => setConsent('granted')}
                className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-colors"
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
