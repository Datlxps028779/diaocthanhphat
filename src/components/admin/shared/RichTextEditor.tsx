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
  Image as ImageIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, Network, X,
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
  const [internalOpen, setInternalOpen] = useState(false);

  const applyLink = (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const safe = safeUrl(url);
    if (!safe) {
      window.alert('URL không hợp lệ. Chỉ chấp nhận liên kết http(s) hoặc đường dẫn nội bộ.');
      return;
    }
    const isInternal = safe.startsWith('/');
    editor.chain().focus().extendMarkRange('link').setLink({
      href: safe,
      target: isInternal ? null : '_blank',
      rel: isInternal ? null : 'nofollow noopener',
    }).run();
  };

  const promptLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const input = window.prompt('Nhập URL liên kết ngoài (để trống để bỏ liên kết):', previous ?? '');
    if (input === null) return;
    applyLink(input);
  };

  const applyAlign = (dir: AlignDir) => {
    if (editor.isActive('image')) editor.chain().focus().updateAttributes('image', { align: dir }).run();
    else editor.chain().focus().setTextAlign(dir).run();
  };
  const alignActive = (dir: AlignDir) =>
    editor.isActive('image') ? editor.getAttributes('image').align === dir : editor.isActive({ textAlign: dir });

  return (
    <div className="flex flex-wrap gap-1 rounded-t-lg border-b border-gray-100 bg-gray-50 p-2">
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
      <ToolButton label="Liên kết" icon={<LinkIcon className="h-3.5 w-3.5" />} active={editor.isActive('link')} onClick={promptLink} />
      {internalLinks.length > 0 && (
        <div className="relative">
          <ToolButton label="Nội bộ" icon={<Network className="h-3.5 w-3.5" />} active={internalOpen} onClick={() => setInternalOpen(o => !o)} />
          {internalOpen && (
            <div className="absolute z-20 mt-1 max-h-64 w-72 overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
              {internalLinks.map(t => (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => { applyLink(`/tin-tuc/${t.slug}`); setInternalOpen(false); }}
                  className="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs text-gray-700 hover:bg-red-50 hover:text-red-700"
                >
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {editor.isActive('link') && (
        <ToolButton label="Bỏ liên kết" icon={<Unlink className="h-3.5 w-3.5" />} onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()} />
      )}

      <span className="mx-1 w-px self-stretch bg-gray-200" aria-hidden />
      <ToolButton label="Ảnh" icon={<ImageIcon className="h-3.5 w-3.5" />} onClick={onImageClick} />
    </div>
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
    <div className="rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-red-400">
      <Toolbar editor={editor} internalLinks={internalLinks} onImageClick={() => setLibOpen(true)} />
      <EditorContent editor={editor} />

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
