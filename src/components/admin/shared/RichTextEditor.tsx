'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Heading2, Heading3, List, Quote, Link as LinkIcon, Unlink, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { uploadImage } from '../../../lib/api';
import { safeUrl } from '../../../lib/markdown';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

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
      <span>{label}</span>
    </button>
  );
}

function Toolbar({ editor, onImageClick, uploading }: { editor: Editor; onImageClick: () => void; uploading: boolean }) {
  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const input = window.prompt('Nhập URL liên kết (để trống để bỏ liên kết):', previous ?? '');
    if (input === null) return;
    const url = input.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const safe = safeUrl(url);
    if (!safe) {
      window.alert('URL không hợp lệ. Chỉ chấp nhận liên kết http(s) hoặc đường dẫn nội bộ.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run();
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-t-lg border-b border-gray-100 bg-gray-50 p-2">
      <ToolButton label="H2" icon={<Heading2 className="h-3.5 w-3.5" />} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolButton label="H3" icon={<Heading3 className="h-3.5 w-3.5" />} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <ToolButton label="Đậm" icon={<Bold className="h-3.5 w-3.5" />} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolButton label="Nghiêng" icon={<Italic className="h-3.5 w-3.5" />} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolButton label="Danh sách" icon={<List className="h-3.5 w-3.5" />} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolButton label="Trích dẫn" icon={<Quote className="h-3.5 w-3.5" />} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolButton label="Liên kết" icon={<LinkIcon className="h-3.5 w-3.5" />} active={editor.isActive('link')} onClick={setLink} />
      {editor.isActive('link') && (
        <ToolButton label="Bỏ liên kết" icon={<Unlink className="h-3.5 w-3.5" />} onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()} />
      )}
      <button
        type="button"
        title="Chèn ảnh"
        aria-label="Chèn ảnh"
        onClick={onImageClick}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
      >
        {uploading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" /> : <ImageIcon className="h-3.5 w-3.5" />}
        <span>{uploading ? 'Đang tải...' : 'Ảnh'}</span>
      </button>
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder = 'Viết nội dung bài viết...' }: RichTextEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image.configure({ HTMLAttributes: { class: 'rounded-xl border border-gray-200' } }),
      Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { rel: 'nofollow noopener', target: '_blank' } }),
      Placeholder.configure({ placeholder }),
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

  const handleFile = async (file: File) => {
    if (!editor) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadImage(file, 'news', true);
      editor.chain().focus().setImage({ src: url, alt: '' }).run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tải ảnh lên thất bại.';
      setError(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!editor) {
    return <div className="min-h-[320px] rounded-lg border border-gray-200 bg-gray-50" aria-hidden />;
  }

  return (
    <div className="rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-red-400">
      <Toolbar editor={editor} uploading={uploading} onImageClick={() => fileRef.current?.click()} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <EditorContent editor={editor} />
      {error && (
        <div className="flex items-start gap-2 border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
