'use client';

import { useState } from 'react';
import { Check, Copy, Facebook, Share2 } from 'lucide-react';

type DetailShareButtonsProps = {
  title: string;
  canonicalPathname: string;
  compact?: boolean;
  className?: string;
};

function getShareUrl(canonicalPathname: string) {
  return `${window.location.origin}${canonicalPathname}`;
}

export function DetailShareButtons({ title, canonicalPathname, compact = false, className = '' }: DetailShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    const url = getShareUrl(canonicalPathname);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Sao chép link để chia sẻ:', url);
    }
  };

  const share = async () => {
    const url = getShareUrl(canonicalPathname);
    const shareData = { title, text: title, url };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    await copyUrl();
  };

  const openFacebookShare = () => {
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl(canonicalPathname))}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };
  const buttonClass = compact
    ? 'h-9 w-9 justify-center rounded-full'
    : 'min-h-9 px-3 rounded-lg';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Chia sẻ nội dung">
      <button
        type="button"
        onClick={share}
        aria-label="Chia sẻ"
        className={`inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors ${buttonClass}`}
      >
        <Share2 className="w-4 h-4" />
        {!compact && 'Chia sẻ'}
      </button>
      <button
        type="button"
        onClick={copyUrl}
        aria-label={copied ? 'Đã sao chép liên kết' : 'Sao chép liên kết'}
        className={`inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors ${buttonClass}`}
      >
        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
        {!compact && (copied ? 'Đã sao chép' : 'Sao chép')}
      </button>
      <button
        type="button"
        onClick={openFacebookShare}
        aria-label="Chia sẻ trên Facebook"
        className={`inline-flex items-center gap-1.5 bg-[#1877F2] text-white text-sm font-semibold hover:bg-[#166FE5] transition-colors ${buttonClass}`}
      >
        <Facebook className="w-4 h-4" />
        {!compact && 'Facebook'}
      </button>
      <button
        type="button"
        onClick={share}
        aria-label="Chia sẻ qua Zalo"
        className={`inline-flex items-center gap-1.5 bg-[#0068FF] text-white text-sm font-semibold hover:bg-[#0059D9] transition-colors ${buttonClass}`}
      >
        <Share2 className="w-4 h-4" />
        {!compact && 'Zalo'}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Đã sao chép liên kết.' : ''}</span>
    </div>
  );
}
