import Link from 'next/link';
import type { LocalityPageData } from '@/lib/localityPageData';
import type { LocalityLink } from './LocalitySections';
import styles from './localityVisual.module.css';

function SidebarLinks({ title, items }: { title: string; items: LocalityLink[] }) {
  return <>
    <ul className="space-y-0.5">{items.slice(0, 6).map(item => <li key={item.href}><Link href={item.href} className={`${styles.sidebarLink} flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-gray-600 hover:text-red-700`}><span>{item.label}</span><span className="shrink-0 text-xs tabular-nums text-gray-500">{item.count}</span></Link></li>)}</ul>
    {items.length > 6 && <a href="#locality-discovery" className="inline-flex min-h-11 items-center text-xs text-red-700 hover:underline">Xem đầy đủ {title.toLocaleLowerCase('vi-VN')} →</a>}
  </>;
}

export function LocalityLandingSidebar({ data }: { data: LocalityPageData }) {
  const groups = [
    { title: 'Theo loại hình', items: data.links.types },
    { title: 'Theo khoảng giá', items: data.links.prices },
    { title: 'Quận / huyện', items: data.links.districts },
    { title: 'Phường / xã', items: data.links.wards },
  ].filter(group => group.items.length);
  if (!groups.length) return null;
  return <aside aria-label="Tìm tin theo khu vực" className={`${styles.scope} ${styles.sidebar}`}>
    <h2 className="mb-5 border-l-2 border-red-600 pl-2 text-base font-medium text-gray-900">Tìm theo nhu cầu</h2>
    <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:hidden">
      {groups.map(group => <details key={group.title} className="group border-t border-gray-100 pt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-gray-800 marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 [&::-webkit-details-marker]:hidden">{group.title}<span aria-hidden="true" className="text-gray-400 group-open:rotate-45">+</span></summary>
        <SidebarLinks {...group} />
      </details>)}
    </div>
    <div className="hidden space-y-4 lg:block">{groups.map(group => <section key={group.title} className="border-t border-gray-100 pt-3"><h3 className="mb-2 text-sm font-medium text-gray-800">{group.title}</h3><SidebarLinks {...group} /></section>)}</div>
  </aside>;
}
