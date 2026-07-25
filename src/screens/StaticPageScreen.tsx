'use client';
import Link from 'next/link';
import type { ManagedPage, PageBlock } from '../lib/supabase';
import { Breadcrumb } from '../components/Layout';
import { isHtmlContent } from '../lib/markdown';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml';

type StaticPageScreenProps = {
  page: ManagedPage;
  blocks: PageBlock[];
};

function renderBlock(block: PageBlock) {
  const value = block.value?.trim() ?? '';
  if (!value) return null;

  if (block.type === 'html' || isHtmlContent(value)) {
    return (
      <div
        key={block.id}
        className="prose max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(value) }}
      />
    );
  }

  if (block.type === 'list') {
    return (
      <ul key={block.id} className="space-y-2 text-sm leading-7 text-gray-700">
        {value.split('\n').filter(Boolean).map(item => <li key={item} className="flex gap-2"><span className="mt-3 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />{item}</li>)}
      </ul>
    );
  }

  if (block.type === 'image') {
    return <img key={block.id} src={value} alt={block.label} className="w-full rounded-2xl object-cover shadow-sm" />;
  }

  return <p key={block.id} className="whitespace-pre-line text-sm leading-7 text-gray-700">{value}</p>;
}

export function StaticPageScreen({ page, blocks }: StaticPageScreenProps) {
  const bodyBlocks = blocks.length ? blocks : [];
  const heroImage = page.hero_image?.trim();

  return (
    <main className="min-h-screen bg-gray-50">
      <section className="relative overflow-hidden bg-gray-950 text-white">
        {heroImage && <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-950/90 to-red-950/80" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 md:py-16">
          <nav className="mb-6 text-xs text-white/70">
            <Link href="/" className="hover:text-white">Trang chủ</Link>
            <span className="mx-2">/</span>
            <span className="text-white">{page.title}</span>
          </nav>
          <div className="max-w-3xl rounded-3xl border border-white/10 bg-black/55 p-6 shadow-2xl backdrop-blur-sm md:p-8">
            <p className="mb-3 inline-flex rounded-full bg-red-600/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">Thông tin</p>
            <h1 className="text-3xl font-black leading-tight md:text-5xl">{page.title}</h1>
            {page.description && <p className="mt-4 text-sm font-medium leading-7 text-white/85 md:text-base">{page.description}</p>}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        <Breadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: page.title }]} />
        <article className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-8">
          <div className="space-y-6">
            {bodyBlocks.map(renderBlock)}
            {bodyBlocks.length === 0 && <p className="text-sm leading-7 text-gray-600">Nội dung đang được cập nhật.</p>}
          </div>
        </article>
      </section>
    </main>
  );
}
