'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import styles from './localityVisual.module.css';

type AreaOption = { slug: string; name: string };

export function LocalityAreaDropdown({ areaName, areaSlug, areaOptions, activePath, active }: { areaName: string; areaSlug: string; areaOptions: AreaOption[]; activePath?: string; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentPath = activePath ?? '';

  const updatePosition = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, left: rect.left });
  };
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const openMenu = () => {
    updatePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) close();
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(true); } };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) close(false);
    };
    const onViewportChange = () => updatePosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', onEscape);
    document.addEventListener('focusin', onFocusIn);
    requestAnimationFrame(() => {
      const current = menuRef.current?.querySelector<HTMLAnchorElement>('[aria-current]') ?? menuRef.current?.querySelector<HTMLAnchorElement>('a');
      current?.focus({ preventScroll: true });
      if (current && menuRef.current) menuRef.current.scrollTop = Math.max(0, current.offsetTop - menuRef.current.clientHeight / 2 + current.offsetHeight / 2);
    });
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  const moveFocus = (direction: 1 | -1) => {
    const links = [...(menuRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (links.length) links[(index + direction + links.length) % links.length]?.focus();
  };

  return <>
    <div ref={rootRef} className={`${styles.subnavMenu} ${active ? styles.subnavActive : ''}`}>
      <Link href={`/khu-vuc/${areaSlug}`} aria-current={currentPath === `/khu-vuc/${areaSlug}` ? 'page' : undefined} className={styles.subnavMenuLink} aria-label={`Trang khu vực ${areaName}`}>{areaName}</Link>
      <button ref={triggerRef} type="button" aria-label="Chọn tỉnh hoặc thành phố" aria-haspopup="true" aria-expanded={open} onClick={() => open ? close() : openMenu()} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
        if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(); }
      }} className={styles.subnavMenuTrigger}>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
    </div>
    {open && typeof document !== 'undefined' && createPortal(
      <div ref={menuRef} data-locality-area-menu aria-label="Chọn khu vực" className={styles.subnavMenuPanel} style={{ top: position.top, left: position.left }} onBlur={event => { const next = event.relatedTarget as Node | null; if (next && !menuRef.current?.contains(next) && !triggerRef.current?.contains(next)) close(false); }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(1); }
        if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(-1); }
        if (event.key === 'Home') { event.preventDefault(); menuRef.current?.querySelector<HTMLAnchorElement>('a')?.focus(); }
        if (event.key === 'End') { event.preventDefault(); [...(menuRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].at(-1)?.focus(); }
        if (event.key === 'Tab') {
          const links = [...(menuRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
          const index = links.indexOf(document.activeElement as HTMLAnchorElement);
          if (!event.shiftKey && index === links.length - 1) {
            event.preventDefault();
            close(false);
            const sibling = rootRef.current?.nextElementSibling as HTMLElement | null;
            const next = sibling?.matches('a,button') ? sibling : sibling?.querySelector<HTMLElement>('a,button');
            next?.focus({ preventScroll: true });
          }
          if (event.shiftKey && index === 0) { event.preventDefault(); close(true); }
        }
      }}>
        {areaOptions.map(area => <Link key={area.slug} href={`/khu-vuc/${area.slug}`} aria-current={currentPath === `/khu-vuc/${area.slug}` ? 'page' : currentPath.startsWith(`/khu-vuc/${area.slug}/`) ? 'location' : undefined} onClick={() => setOpen(false)} className={styles.subnavMenuItem}>{area.name}</Link>)}
      </div>,
      document.body,
    )}
  </>;
}
