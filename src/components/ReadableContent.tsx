import type { ReactNode } from 'react';

// Một preset duy nhất cho nội dung dài trên trang public. Giữ typography ở lớp UI
// (không cho admin nhập class CSS), còn nội dung vẫn đi từ DB/editor đã sanitize.
export const readableContentClassName = [
  'readable-content max-w-[72ch] text-[16px] leading-8 text-gray-700',
  'sm:text-[17px] sm:leading-8',
  '[&_p]:my-0 [&_p+_p]:mt-5',
  '[&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:leading-8 [&_h2]:text-gray-900 sm:[&_h2]:text-2xl',
  '[&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-7 [&_h3]:text-gray-900',
  '[&_ul]:my-5 [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:my-5 [&_ol]:space-y-2 [&_ol]:pl-6',
  '[&_li]:pl-1 [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-red-300 [&_blockquote]:bg-red-50 [&_blockquote]:px-5 [&_blockquote]:py-4 [&_blockquote]:text-gray-700',
  '[&_figure]:my-7 [&_img]:my-7 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl',
  '[&_a]:font-medium [&_a]:text-red-700 [&_a]:underline [&_a]:decoration-red-200 [&_a]:underline-offset-4 hover:[&_a]:text-red-800',
  '[&_table]:my-6 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-sm [&_th]:bg-gray-50 [&_th]:font-semibold [&_th]:text-gray-900 [&_th]:p-3 [&_td]:p-3',
].join(' ');

export function ReadableContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${readableContentClassName} ${className}`.trim()}>{children}</div>;
}
