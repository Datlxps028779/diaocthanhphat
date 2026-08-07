'use client';
import { useState } from 'react';
import { List, ChevronDown } from 'lucide-react';
import type { TocHeading } from '@/lib/tableOfContents';

// Mục lục tự sinh từ h2 của bài viết. Đặt ở đầu bài, cuộn xuống là trôi (không dính).
//
// Vì sao thu gọn: đo dữ liệu thật thấy 14/23 bài có từ 10 mục trở lên — liệt kê hết
// thì mục lục dài hơn cả phần mở bài.

const VISIBLE = 5;

export function ArticleToc({ headings }: { headings: TocHeading[] }) {
  const [expanded, setExpanded] = useState(false);

  // Phía gọi đã chặn theo TOC_MIN_HEADINGS, đây là chốt phòng hờ.
  if (headings.length === 0) return null;

  const shown = expanded ? headings : headings.slice(0, VISIBLE);
  const hidden = headings.length - shown.length;

  // Không dùng <a href="#id"> mặc định: cần bù chiều cao header dính, nếu không
  // tiêu đề bị header che mất.
  const jumpTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return; // để trình duyệt xử lý mặc định nếu không tìm thấy
    e.preventDefault();
    const top = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top, behavior: 'smooth' });
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <nav
      data-testid="article-toc"
      aria-label="Mục lục bài viết"
      className="mb-8 rounded-xl border border-gray-200 bg-gray-50 p-5"
    >
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-gray-900">
        <List className="h-4 w-4 text-red-600" />
        Nội dung chính
      </h2>
      <ol className="space-y-1">
        {shown.map((h, i) => (
          <li key={h.id} className="flex gap-2 text-sm leading-6">
            <span className="min-w-[1.25rem] flex-shrink-0 font-semibold text-red-600">{i + 1}.</span>
            <a
              data-testid="article-toc-link"
              href={`#${h.id}`}
              onClick={(e) => jumpTo(e, h.id)}
              className="text-gray-700 hover:text-red-600 hover:underline"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          data-testid="article-toc-more"
          onClick={() => setExpanded(true)}
          className="mt-3 flex items-center gap-1 text-sm font-bold text-red-600 hover:text-red-700"
        >
          <ChevronDown className="h-4 w-4" />
          Xem thêm {hidden} mục
        </button>
      )}
    </nav>
  );
}
