import { useState, useRef, useCallback } from 'react';
import { Upload, X, GripVertical, Image as ImageIcon, AlertCircle, FolderOpen } from 'lucide-react';
import { uploadImage } from '../lib/api';
import { ImageLibraryModal } from './ImageLibraryModal';

interface ImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  folder?: string;
  isAdmin?: boolean;
}

export function ImageUpload({ images, onChange, maxImages = 10, folder = 'properties', isAdmin = false }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = maxImages - images.length;
    if (remaining <= 0) { setError(`Tối đa ${maxImages} ảnh`); return; }
    setError('');
    setUploading(true);
    try {
      const toUpload = Array.from(files).slice(0, remaining);
      const urls = await Promise.all(toUpload.map(f => uploadImage(f, folder, isAdmin)));
      onChange([...images, ...urls]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tải ảnh. Vui lòng thử lại.';
      setError(`${msg} Bạn có thể chọn ảnh từ thư viện hoặc dán link ảnh từ dịch vụ bên ngoài.`);
    } finally {
      setUploading(false);
    }
  }, [images, maxImages, folder, isAdmin, onChange]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeImage = (idx: number) => {
    onChange(images.filter((_, i) => i !== idx));
  };

  // Drag-and-drop reorder
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };
  const handleItemDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop2 = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) return;
    const newImages = [...images];
    const [moved] = newImages.splice(dragIdx, 1);
    newImages.splice(targetIdx, 0, moved);
    onChange(newImages);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // Ép buộc luồng: click vào drop zone mở thư viện ảnh
  const openLibrary = () => {
    if (images.length >= maxImages) {
      setError(`Tối đa ${maxImages} ảnh`);
      return;
    }
    setError('');
    setLibraryOpen(true);
  };

  return (
    <div className="space-y-3">
      {/* Drop zone + Library button */}
      {images.length < maxImages && (
        <div className="flex gap-2">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={openLibrary}
            className={`flex-1 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              dragOver ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-red-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Đang tải ảnh...</p>
              </div>
            ) : (
              <>
                <FolderOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Click để chọn ảnh từ thư viện</p>
                <p className="text-xs text-gray-400 mt-1">Hoặc kéo thả file vào đây – Tối đa {maxImages} ảnh</p>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Preview grid with drag-drop reorder */}
      {images.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Kéo thả để sắp xếp thứ tự ảnh. Ảnh đầu tiên là ảnh đại diện.</p>
          <div className="grid grid-cols-3 gap-2">
            {images.map((url, idx) => (
              <div
                key={url}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={e => handleItemDragOver(e, idx)}
                onDrop={e => handleDrop2(e, idx)}
                className={`relative group rounded-xl overflow-hidden border-2 transition-all ${
                  dragOverIdx === idx ? 'border-red-400 scale-95' : 'border-transparent'
                } ${dragIdx === idx ? 'opacity-50' : ''}`}
              >
                <img src={url} alt="" className="w-full h-24 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                {idx === 0 && (
                  <span className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                    Ảnh bìa
                  </span>
                )}
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                >
                  <X className="w-3.5 h-3.5 text-red-600" />
                </button>
                <div className="absolute bottom-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                  <GripVertical className="w-4 h-4 text-white drop-shadow" />
                </div>
              </div>
            ))}
            {images.length < maxImages && images.length > 0 && (
              <button
                onClick={openLibrary}
                className="h-24 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-red-400 hover:text-red-400 transition-colors"
              >
                <ImageIcon className="w-5 h-5 mb-1" />
                <span className="text-[10px]">Thêm ảnh</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Image Library Modal — ép buộc luồng chọn ảnh qua modal */}
      <ImageLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(url) => {
          // Đảm bảo URL được lưu vào state ngay lập tức và preview hiển thị
          if (!images.includes(url) && images.length < maxImages) {
            onChange([...images, url]);
          }
        }}
        folder={folder}
        isAdmin={isAdmin}
        multiple
      />
    </div>
  );
}

interface ImageUrlInputProps {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}

export function ImageUrlInput({ value, onChange, placeholder = 'https://...' }: ImageUrlInputProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tải ảnh lên thất bại.';
      setError(`${msg} Bạn có thể dán link ảnh từ dịch vụ bên ngoài (Pexels, ImgBB...).`);
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setError(''); }}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 text-xs flex items-center gap-1.5 transition-colors flex-shrink-0"
        >
          {uploading ? (
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          {uploading ? 'Tải...' : 'Upload'}
        </button>
        <button
          type="button"
          onClick={() => { setLibraryOpen(true); setError(''); }}
          className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 text-xs flex items-center gap-1.5 transition-colors flex-shrink-0"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Thư viện
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <ImageLibraryModal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onSelect={(url) => { onChange(url); setError(''); }}
          isAdmin
        />
      </div>
      {/* Preview ảnh ngay lập tức */}
      {value && (
        <div className="relative inline-block">
          <img
            src={value}
            alt="preview"
            className="h-20 rounded-lg object-cover border border-gray-100"
            onError={() => setError('Không hiển thị được ảnh từ URL này. Vui lòng kiểm tra lại link.')}
          />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center shadow hover:bg-red-700"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
