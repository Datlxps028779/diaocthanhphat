'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { Cookie, Settings2 } from 'lucide-react';
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
  const loadOptionalAnalytics = mounted && status === 'granted';
  const loadGa = loadOptionalAnalytics && config.destinations.length > 0;

  const chooseConsent = (nextStatus: Exclude<ConsentStatus, 'unset'>) => {
    setConsent(nextStatus);
    setStatus(nextStatus);
    setShowNotice(false);
  };

  const reopenChoices = () => {
    setShowNotice(true);
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

      {mounted && !showNotice && status !== 'unset' && (
        <button
          type="button"
          onClick={reopenChoices}
          className="fixed bottom-4 left-4 z-[70] inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-lg transition hover:border-red-200 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          aria-label="Mở tuỳ chọn cookie"
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Tuỳ chọn cookie</span>
        </button>
      )}

      {mounted && showNotice && (
        <section
          role="region"
          aria-label="Thông báo cookie"
          className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:bottom-5 sm:p-5"
        >
          <div className="flex gap-3">
            <div className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700 sm:flex">
              <Cookie className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-gray-900">Tuỳ chọn cookie</h2>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                Chúng tôi chỉ dùng cookie phân tích khi bạn đồng ý, để hiểu cách website được sử dụng và cải thiện trải nghiệm.{' '}
                <Link href="/trang/chinh-sach-bao-mat" className="font-medium text-red-700 underline underline-offset-2 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
                  Xem chính sách bảo mật
                </Link>
                .
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
                <button
                  type="button"
                  onClick={() => chooseConsent('denied')}
                  className="min-h-11 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  onClick={() => chooseConsent('granted')}
                  className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                >
                  Chấp nhận phân tích
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
