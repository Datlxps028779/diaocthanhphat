import { useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { publicBrowserUrl } from '../../../lib/siteUrl';

// Khối hiển thị URL công khai trong admin: link mở tab mới + nút Mở + nút Copy.
// Nhận relativePath (vd /tin-tuc/abc). Ẩn khi path rỗng.
export function PublicUrlPreview({ path, label = 'URL công khai' }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!path) return null;
  const url = publicBrowserUrl(path);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard không khả dụng — bỏ qua, link vẫn mở được */
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="flex items-center gap-2">
        <a href={path} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs font-semibold text-red-600 hover:text-red-700 hover:underline">
          {url}
        </a>
        <button type="button" onClick={() => window.open(path, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-red-200 hover:text-red-600">
          <ExternalLink className="h-3 w-3" /> Mở
        </button>
        {typeof navigator !== 'undefined' && navigator.clipboard && (
          <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-red-200 hover:text-red-600">
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />} {copied ? 'Đã copy' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}
