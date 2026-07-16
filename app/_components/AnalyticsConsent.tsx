'use client';
import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getConsent, setConsent, CONSENT_EVENT, type ConsentStatus } from '@/lib/consent';

// GA4 dùng cookie → chỉ nạp khi có NEXT_PUBLIC_GA_ID. Consent được auto-grant
// khi user truy cập web (implicit consent theo hành vi), không hiện banner
// popup. Vercel Analytics/Speed Insights cookieless chạy độc lập ở layout.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function AnalyticsConsent() {
  const [status, setStatus] = useState<ConsentStatus>('unset');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const current = getConsent();
    if (current === 'unset') {
      setConsent('granted');
      setStatus('granted');
    } else {
      setStatus(current);
    }
    const onChange = () => setStatus(getConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  const loadGa = mounted && !!GA_ID && status === 'granted';

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
    </>
  );
}
