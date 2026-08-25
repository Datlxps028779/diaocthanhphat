'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { Cookie } from 'lucide-react';
import { getConsent, setConsent, CONSENT_EVENT, type ConsentStatus } from '@/lib/consent';
import { getSiteSettings } from '@/lib/api';
import { resolveGoogleTagConfig, type GoogleTagConfig } from '@/lib/googleTag';

interface AnalyticsConsentProps {
  environmentGaId?: string;
}

const EMPTY_CONFIG: GoogleTagConfig = { destinations: [], leadConversion: null };

export function AnalyticsConsent({ environmentGaId }: AnalyticsConsentProps) {
  const [status, setStatus] = useState<ConsentStatus>('unset');
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<GoogleTagConfig>(EMPTY_CONFIG);
  const [tagReady, setTagReady] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [showNotice, setShowNotice] = useState(false);
  const pathname = usePathname();
  const isPrivateWorkspace = pathname === '/noi-bo' || pathname.startsWith('/noi-bo/') || pathname === '/quantrihethong' || pathname.startsWith('/quantrihethong/');
  const loadOptionalAnalytics = mounted && !isPrivateWorkspace && status === 'granted';
  const loadGa = loadOptionalAnalytics && config.destinations.length > 0;

  const chooseConsent = (nextStatus: Exclude<ConsentStatus, 'unset'>) => {
    setConsent(nextStatus);
    setStatus(nextStatus);
    setShowNotice(false);
  };

  useEffect(() => {
    getSiteSettings()
      .then(settings => setConfig(resolveGoogleTagConfig(settings, environmentGaId)))
      .catch(() => setConfig(resolveGoogleTagConfig({}, environmentGaId)));
  }, [environmentGaId]);

  useEffect(() => {
    setMounted(true);
    const current = getConsent();
    setStatus(current);
    setShowNotice(current === 'unset');
    const onChange = () => {
      const nextStatus = getConsent();
      setStatus(nextStatus);
      if (nextStatus === 'unset') setShowNotice(true);
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    window.googleAnalyticsConsentGranted = loadGa;
    if (loadGa && config.leadConversion) window.googleAdsLeadConversion = config.leadConversion;
    else delete window.googleAdsLeadConversion;
    if (!loadGa) {
      setTagReady(false);
      window.gtag?.('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
    }
    return () => {
      window.googleAnalyticsConsentGranted = false;
      delete window.googleAdsLeadConversion;
    };
  }, [config.leadConversion, loadGa]);

  useEffect(() => {
    if (!loadGa) return;
    const notify = () => setCurrentPath(`${window.location.pathname}${window.location.search}`);
    notify();
    window.addEventListener('popstate', notify);
    const { pushState, replaceState } = window.history;
    const emit = (method: typeof pushState) => function (this: History, ...args: Parameters<typeof pushState>) {
      const result = method.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
      return result;
    };
    window.history.pushState = emit(pushState);
    window.history.replaceState = emit(replaceState);
    window.addEventListener('locationchange', notify);
    return () => {
      window.removeEventListener('popstate', notify);
      window.removeEventListener('locationchange', notify);
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
    };
  }, [loadGa]);

  useEffect(() => {
    if (!loadGa || !tagReady || !currentPath || typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', {
      page_location: `${window.location.origin}${currentPath}`,
      page_path: currentPath,
    });
  }, [loadGa, tagReady, currentPath]);

  return (
    <>
      {loadOptionalAnalytics && (
        <Script id="ahrefs-analytics-loader" src="https://analytics.ahrefs.com/analytics.js" data-key="qx938+eyaGeeHH4c8CZ0HA" strategy="afterInteractive" />
      )}
      {loadGa && (
        <Script id="google-tag-loader" src={`https://www.googletagmanager.com/gtag/js?id=${config.destinations[0]}`} strategy="afterInteractive" onLoad={() => setTagReady(true)} />
      )}
      {loadGa && (
        <Script id="google-tag-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments);};gtag('consent','default',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});gtag('js',new Date());${config.destinations.map(id => `gtag('config','${id}',{send_page_view:false});`).join('')}`}
        </Script>
      )}

      {mounted && !isPrivateWorkspace && showNotice && (
        <section
          role="region"
          aria-label="Thông báo chính sách Cookie"
          className="fixed bottom-6 left-3 z-[200] w-[calc(100%-1.5rem)] max-w-sm sm:left-6 sm:w-full"
        >
          <div className="rounded-2xl border border-gray-100 bg-white shadow-2xl">
            <div className="p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                <Cookie className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Chính sách Cookie</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  Chúng tôi sử dụng cookies để cải thiện trải nghiệm sử dụng dịch vụ. Bạn có thể xem chi tiết trong{' '}
                  <Link href="/trang/chinh-sach-bao-mat" className="font-medium text-orange-600 underline underline-offset-2 hover:text-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
                    Chính sách cookie
                  </Link>
                  .
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => chooseConsent('granted')}
              className="mt-4 min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:from-orange-600 hover:to-amber-600 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            >
              Chấp nhận
            </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
