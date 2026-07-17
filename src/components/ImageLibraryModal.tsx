import { useState, useEffect, useCallback } from 'react';
import { X, Upload, Trash2, Image as ImageIcon, Search, FolderOpen, HardDrive, AlertCircle } from 'lucide-react';
import { getUserMedia, deleteUserMedia, getUserMediaUsage, uploadImages } from '../lib/api';
import { type UserMedia } from '../lib/supabase';

interface ImageLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  onSelectMany?: (urls: string[]) => void;
  folder?: string;
  isAdmin?: boolean;
  multiple?: boolean;
}

export function ImageLibraryModal({ open, onClose, onSelect, onSelectMany, folder = 'properties', isAdmin = false, multiple = false }: ImageLibraryModalProps) {
  const [medias, setMedias] = useState<UserMedia[]>([]);
  const [usage, setUsage] = useState({ used: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [view, setView] = useState<'library' | 'upload'>('library');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, usageData] = await Promise.all([
        getUserMedia(folder),
        getUserMediaUsage(),
      ]);
      setMedias(data);
      setUsage(usageData);
    } catch {
      setMedias([]);
      setError('Không tải được thư viện ảnh. Vui lòng thử lại.');
    }
    setLoading(false);
  }, [folder]);

  useEffect(() => {
    if (open) {
      load();
      setSelectedUrls(new Set());
      setSearch('');
      setView('library');
      setError('');
    }
  }, [open, load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const urls = await uploadImages(Array.from(files), folder, isAdmin);
      if (urls.length > 0) {
        if (multiple) (onSelectMany ?? ((selected: string[]) => selected.forEach(onSelect)))(urls);
        else onSelect(urls[0]);
        onClose();
      } else {
        await load();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tải ảnh lên thất bại.';
      setError(`${msg} Bạn có thể chọn ảnh từ thư viện hoặc dán link ảnh từ dịch vụ bên ngoài (Pexels, ImgBB...).`);
    }
    setUploading(false);
    if (e.target) e.target.value = '';
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await deleteUserMedia(id);
      setMedias(prev => prev.filter(m => m.id !== id));
    } catch {
      setError('Xóa ảnh thất bại. Vui lòng thử lại.');
    }
    setConfirmDelete(null);
  };

  const handleSelect = (url: string) => {
    if (multiple) {
      setSelectedUrls(prev => {
        const n = new Set(prev);
        if (n.has(url)) n.delete(url);
        else n.add(url);
        return n;
      });
    } else {
      onSelect(url);
      onClose();
    }
  };

  const handleConfirmMultiple = () => {
    const urls = Array.from(selectedUrls);
    if (onSelectMany) onSelectMany(urls);
    else urls.forEach(url => onSelect(url));
    onClose();
  };

  const filtered = search.trim()
    ? medias.filter(m => m.filename.toLowerCase().includes(search.toLowerCase()))
    : medias;

  const formatSize = (bytes: number | null): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!open) return null;

  const usagePercent = usage.total > 0 ? Math.round((usage.used / usage.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <ImageIcon className="w-5 h-5 text-red-500" />
            <h2 className="font-bold text-lg text-gray-900">Thư viện ảnh</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{medias.length} ảnh</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Usage bar */}
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <HardDrive className="w-3.5 h-3.5" />
            <span>Đã dùng {formatSize(usage.used)} / {formatSize(usage.total)}</span>
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
              <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${Math.min(usagePercent, 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm ảnh..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <button
            onClick={() => { setView(view === 'library' ? 'upload' : 'library'); setError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            {view === 'library' ? 'Tải lên' : 'Quay lại thư viện'}
          </button>
          {multiple && selectedUrls.size > 0 && (
            <button
              onClick={handleConfirmMultiple}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Chọn ({selectedUrls.size})
            </button>
          )}
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-start gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg p-2.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {view === 'upload' ? (
            <div className="flex flex-col items-center justify-center py-16">
              <label className="cursor-pointer border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:border-red-400 hover:bg-red-50/30 transition-all">
                <input
                  type="file"
                  accept="image/*"
                  multiple={multiple}
                  className="hidden"
                  onChange={handleUpload}
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Đang tải lên...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">Click để chọn ảnh tải lên</p>
                    <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP</p>
                  </>
                )}
              </label>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <FolderOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">{search ? 'Không tìm thấy ảnh phù hợp' : 'Thư viện trống. Hãy tải ảnh lên.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
              {filtered.map(media => {
                const isSelected = selectedUrls.has(media.url);
                const isDeleting = confirmDelete === media.id;
                return (
                  <div key={media.id} className="relative group">
                    <button
                      onClick={() => handleSelect(media.url)}
                      className={`w-full aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-red-500 ring-2 ring-red-200' : 'border-transparent hover:border-gray-300'
                      }`}
                    >
                      <img
                        src={media.url}
                        alt={media.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </button>
                    {isSelected && (
                      <div className="absolute top-1 left-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">✓</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-b-xl">
                      <p className="text-[9px] text-white truncate">{media.filename}</p>
                      <p className="text-[8px] text-white/70">{formatSize(media.size_bytes)}</p>
                    </div>
                    {isDeleting ? (
                      <div className="absolute inset-0 bg-white/90 rounded-xl flex flex-col items-center justify-center gap-1.5">
                        <p className="text-xs font-medium text-gray-700">Xóa?</p>
                        <div className="flex gap-1.5">
                          <button onClick={() => handleDelete(media.id)} className="px-2 py-1 bg-red-600 text-white text-[10px] rounded-md">Xóa</button>
                          <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 bg-gray-200 text-gray-600 text-[10px] rounded-md">Hủy</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(media.id)}
                        className="absolute top-1 right-1 w-6 h-6 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>Click ảnh để chọn{multiple ? ' (chọn nhiều)' : ''}</span>
          {usage.used > 0 && <span>Đã dùng {formatSize(usage.used)}</span>}
        </div>
      </div>
    </div>
  );
}