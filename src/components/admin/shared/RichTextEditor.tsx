'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import {
  Bold, Italic, Heading2, Heading3, List, Quote, Link as LinkIcon, Unlink,
  Image as ImageIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, Search, X,
} from 'lucide-react';
import { safeUrl } from '../../../lib/markdown';
import { ImageLibraryModal } from '../../ImageLibraryModal';

export interface InternalLinkTarget {
  title: string;
  slug: string;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  internalLinks?: InternalLinkTarget[];
}

const AlignableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: el => el.getAttribute('data-align'),
        renderHTML: attrs => (attrs.align ? { 'data-align': attrs.align } : {}),
      },
    };
  },
});

type AlignDir = 'left' | 'center' | 'right' | 'justify';

function ToolButton({ label, icon, active, onClick }: { label: string; icon: ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700'
      }`}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

function Toolbar({
  editor,
  onImageClick,
  internalLinks,
}: {
  editor: Editor;
  onImageClick: () => void;
  internalLinks: InternalLinkTarget[];
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNewTab, setLinkNewTab] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [selHadText, setSelHadText] = useState(false);

  const openLinkDialog = () => {
    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    const prevHref = (editor.getAttributes('link').href as string | undefined) ?? '';
    const prevTarget = editor.getAttributes('link').target as string | undefined;
    setLinkText(selectedText);
    setLinkUrl(prevHref);
    setLinkNewTab(prevHref ? prevTarget === '_blank' : false);
    setSelHadText(Boolean(selectedText));
    setLinkSearch('');
    setLinkOpen(true);
  };

  const closeLinkDialog = () => { setLinkOpen(false); setLinkSearch(''); };

  const pickInternal = (t: InternalLinkTarget) => {
    setLinkUrl(`/tin-tuc/${t.slug}`);
    setLinkNewTab(false);
    setLinkText(prev => (prev.trim() ? prev : t.title));
    setLinkSearch('');
  };

  const submitLink = () => {
    const safe = safeUrl(linkUrl);
    if (!safe) {
      window.alert('URL không hợp lệ. Chỉ chấp nhận liên kết http(s) hoặc đường dẫn nội bộ (bắt đầu bằng /).');
      return;
    }
    const isInternal = safe.startsWith('/');
    // Nội bộ: mặc định dofollow + cùng tab (tốt cho internal-linking), cho tick mở tab mới.
    // Ngoài: luôn _blank + nofollow noopener.
    const useNewTab = isInternal ? linkNewTab : true;
    const attrs = {
      href: safe,
      target: useNewTab ? '_blank' : null,
      rel: isInternal ? (useNewTab ? 'noopener' : null) : 'nofollow noopener',
    };
    const text = linkText.trim();
    const chain = editor.chain().focus();
    if (!selHadText) {
      chain.insertContent({ type: 'text', text: text || safe, marks: [{ type: 'link', attrs }] });
    } else if (text) {
      chain.deleteSelection().insertContent({ type: 'text', text, marks: [{ type: 'link', attrs }] });
    } else {
      chain.extendMarkRange('link').setLink(attrs);
    }
    chain.run();
    closeLinkDialog();
  };

  const removeLink = () => editor.chain().focus().extendMarkRange('link').unsetLink().run();

  const linkMatches = (linkSearch.trim()
    ? internalLinks.filter(t => t.title.toLowerCase().includes(linkSearch.trim().toLowerCase()))
    : internalLinks
  ).slice(0, 6);

  const applyAlign = (dir: AlignDir) => {
    if (editor.isActive('image')) editor.chain().focus().updateAttributes('image', { align: dir }).run();
    else editor.chain().focus().setTextAlign(dir).run();
  };
  const alignActive = (dir: AlignDir) =>
    editor.isActive('image') ? editor.getAttributes('image').align === dir : editor.isActive({ textAlign: dir });

  return (
    <>
    <div className="sticky top-0 z-20 flex flex-wrap gap-1 rounded-t-lg border-b border-gray-100 bg-gray-50/95 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-gray-50/80">
      <ToolButton label="H2" icon={<Heading2 className="h-3.5 w-3.5" />} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolButton label="H3" icon={<Heading3 className="h-3.5 w-3.5" />} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <ToolButton label="Đậm" icon={<Bold className="h-3.5 w-3.5" />} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolButton label="Nghiêng" icon={<Italic className="h-3.5 w-3.5" />} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolButton label="Danh sách" icon={<List className="h-3.5 w-3.5" />} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolButton label="Trích dẫn" icon={<Quote className="h-3.5 w-3.5" />} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />

      <span className="mx-1 w-px self-stretch bg-gray-200" aria-hidden />
      <ToolButton label="" icon={<AlignLeft className="h-3.5 w-3.5" />} active={alignActive('left')} onClick={() => applyAlign('left')} />
      <ToolButton label="" icon={<AlignCenter className="h-3.5 w-3.5" />} active={alignActive('center')} onClick={() => applyAlign('center')} />
      <ToolButton label="" icon={<AlignRight className="h-3.5 w-3.5" />} active={alignActive('right')} onClick={() => applyAlign('right')} />
      <ToolButton label="" icon={<AlignJustify className="h-3.5 w-3.5" />} active={alignActive('justify')} onClick={() => applyAlign('justify')} />

      <span className="mx-1 w-px self-stretch bg-gray-200" aria-hidden />
      <ToolButton label="Liên kết" icon={<LinkIcon className="h-3.5 w-3.5" />} active={editor.isActive('link')} onClick={openLinkDialog} />
      {editor.isActive('link') && (
        <ToolButton label="Bỏ liên kết" icon={<Unlink className="h-3.5 w-3.5" />} onClick={removeLink} />
      )}

      <span className="mx-1 w-px self-stretch bg-gray-200" aria-hidden />
      <ToolButton label="Ảnh" icon={<ImageIcon className="h-3.5 w-3.5" />} onClick={onImageClick} />
    </div>

    {linkOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={closeLinkDialog}>
        <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onMouseDown={e => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Chèn / sửa liên kết</h3>
            <button type="button" onClick={closeLinkDialog}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
          </div>

          <label className="mb-1 block text-xs font-semibold text-gray-700">Văn bản hiển thị</label>
          <input
            autoFocus
            value={linkText}
            onChange={e => setLinkText(e.target.value)}
            placeholder={selHadText ? 'Giữ nguyên đoạn đã bôi đen' : 'Chữ sẽ hiện ra trong bài'}
            className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />

          <label className="mb-1 block text-xs font-semibold text-gray-700">Đường dẫn (URL)</label>
          <input
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitLink(); } }}
            placeholder="https://... hoặc /tin-tuc/bai-viet"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />

          {internalLinks.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <Search className="h-3.5 w-3.5" /> Liên kết tới bài viết nội bộ
              </div>
              <input
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                placeholder="Tìm bài theo tiêu đề..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              {linkMatches.length > 0 && (
                <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-gray-100">
                  {linkMatches.map(t => {
                    const href = `/tin-tuc/${t.slug}`;
                    const active = linkUrl.trim() === href;
                    return (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => pickInternal(t)}
                        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${active ? 'bg-red-50 text-red-700' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        <span className="flex-1 truncate">{t.title}</span>
                        {active && <span className="text-[10px] font-semibold text-red-600">đã chọn</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <label className="mt-3 flex items-center gap-2 text-xs font-medium text-gray-600">
            <input type="checkbox" checked={linkNewTab} onChange={e => setLinkNewTab(e.target.checked)} className="accent-red-600" />
            Mở trong tab mới
          </label>
          <p className="mt-1 text-[11px] text-gray-400">Link ngoài luôn mở tab mới và gắn nofollow. Link nội bộ mặc định cùng tab, dofollow (tốt cho SEO).</p>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={closeLinkDialog} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
            <button type="button" onClick={submitLink} disabled={!linkUrl.trim()} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Chèn liên kết</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export function RichTextEditor({ value, onChange, placeholder = 'Viết nội dung bài viết...', internalLinks = [] }: RichTextEditorProps) {
  const [libOpen, setLibOpen] = useState(false);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [altText, setAltText] = useState('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      AlignableImage.configure({ HTMLAttributes: { class: 'rounded-xl border border-gray-200' } }),
      Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { rel: 'nofollow noopener', target: '_blank' } }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-gray max-w-none min-h-[280px] px-3 py-2.5 focus:outline-none',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  const confirmAlt = () => {
    const alt = altText.trim();
    if (!alt || !pendingSrc || !editor) return;
    editor.chain().focus().setImage({ src: pendingSrc, alt }).run();
    setPendingSrc(null);
    setAltText('');
  };

  if (!editor) {
    return <div className="min-h-[320px] rounded-lg border border-gray-200 bg-gray-50" aria-hidden />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-red-400">
      <Toolbar editor={editor} internalLinks={internalLinks} onImageClick={() => setLibOpen(true)} />
      <div className="max-h-[65vh] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>

      <ImageLibraryModal
        open={libOpen}
        onClose={() => setLibOpen(false)}
        onSelect={url => { setLibOpen(false); setPendingSrc(url); setAltText(''); }}
        folder="news"
        isAdmin
      />

      {pendingSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Mô tả ảnh (alt) — bắt buộc cho SEO</h3>
              <button type="button" onClick={() => { setPendingSrc(null); setAltText(''); }}>
                <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <img src={pendingSrc} alt="" className="mb-3 max-h-40 w-full rounded-lg object-cover" />
            <input
              autoFocus
              value={altText}
              onChange={e => setAltText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAlt(); } }}
              placeholder="Ví dụ: Dự án căn hộ ven sông tại Dĩ An, Bình Dương"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <p className="mt-1.5 text-[11px] text-gray-400">Mô tả ngắn, có địa danh/từ khóa để tối ưu SEO và GEO. Không được để trống.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setPendingSrc(null); setAltText(''); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
              <button type="button" onClick={confirmAlt} disabled={!altText.trim()} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Chèn ảnh</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
