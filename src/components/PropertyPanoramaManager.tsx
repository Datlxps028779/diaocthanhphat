'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle, Eye, EyeOff, GripVertical, ImagePlus, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import type { PropertyPanorama } from '../lib/supabase';
import { deletePropertyPanorama, getPropertyPanoramas, replacePropertyPanorama, updatePropertyPanorama } from '../lib/api/properties';
import { inspectPanorama360, uploadPanorama360 } from '../lib/api/media';

export type PendingPanoramaUpload = {
  id: string;
  file: File;
  label: string;
  status: 'checking' | 'valid' | 'invalid' | 'error';
  message: string;
};

type PendingPanorama = PendingPanoramaUpload & {
  previewUrl: string;
  previewError?: boolean;
  width?: number;
  height?: number;
  replaceId?: string;
};

type UploadResult = { name: string; ok: boolean; message: string };

type PropertyPanoramaManagerProps = {
  propertyId: string | null;
  onPendingChange?: (items: PendingPanoramaUpload[]) => void;
  clearPendingIds?: string[];
};

export function PropertyPanoramaManager({ propertyId, onPendingChange, clearPendingIds = [] }: PropertyPanoramaManagerProps) {
  const [panoramas, setPanoramas] = useState<PropertyPanorama[]>([]);
  const [pending, setPending] = useState<PendingPanorama[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingPanorama[]>([]);

  const load = useCallback(async () => {
    if (!propertyId) {
      setPanoramas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setPanoramas(await getPropertyPanoramas(propertyId, true));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách ảnh 360.');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    onPendingChange?.(propertyId ? [] : pending.map(({ id, file, label, status, message }) => ({ id, file, label, status, message })));
  }, [onPendingChange, pending, propertyId]);
  useEffect(() => {
    if (clearPendingIds.length === 0) return;
    setPending(items => {
      const cleared = items.filter(item => !clearPendingIds.includes(item.id));
      items.filter(item => clearPendingIds.includes(item.id)).forEach(item => URL.revokeObjectURL(item.previewUrl));
      return cleared;
    });
  }, [clearPendingIds]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => () => {
    pendingRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const updatePending = (id: string, patch: Partial<PendingPanorama>) => {
    setPending(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const handleSelection = async (files: FileList | null) => {
    if (!files?.length) return;
    const replaceId = replaceTargetId ?? undefined;
    const selectedFiles = Array.from(files);
    setReplaceTargetId(null);
    setError('');
    setUploadResults([]);
    const items = selectedFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'checking' as const,
      message: 'Đang kiểm tra ảnh...',
      label: file.name.replace(/\.[^.]+$/, ''),
      replaceId,
    }));
    setPending(current => [...current, ...items]);
    if (fileRef.current) fileRef.current.value = '';

    for (const item of items) {
      try {
        const inspection = await inspectPanorama360(item.file);
        updatePending(item.id, {
          status: 'valid',
          message: 'Ảnh hợp lệ, sẵn sàng tải lên.',
          width: inspection.width,
          height: inspection.height,
        });
      } catch (err) {
        updatePending(item.id, {
          status: 'invalid',
          message: err instanceof Error ? err.message : 'Ảnh không hợp lệ.',
        });
      }
    }
  };

  const removePending = (id: string) => {
    const item = pending.find(row => row.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    setPending(items => items.filter(row => row.id !== id));
  };

  const movePending = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pending.length) return;
    setPending(items => {
      const next = [...items];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleUpload = async () => {
    if (!propertyId) return;
    const candidates = pending.filter(item => item.status === 'valid' || item.status === 'error');
    if (candidates.length === 0) return;
    setBusy(true);
    setError('');
    setUploadResults([]);
    const results: UploadResult[] = [];
    const successfulIds = new Set<string>();

    for (const item of candidates) {
      try {
        if (item.replaceId) {
          await replacePropertyPanorama(propertyId, item.replaceId, item.file, true);
          results.push({ name: item.file.name, ok: true, message: 'Đã thay ảnh' });
        } else {
          await uploadPanorama360(item.file, propertyId, true, item.label);
          results.push({ name: item.file.name, ok: true, message: 'Đã tải lên' });
        }
        successfulIds.add(item.id);
      } catch (err) {
        results.push({
          name: item.file.name,
          ok: false,
          message: err instanceof Error ? err.message : 'Tải ảnh thất bại.',
        });
        updatePending(item.id, { status: 'error', message: 'Tải thất bại, có thể thử lại.' });
      }
    }

    for (const item of candidates) {
      if (successfulIds.has(item.id)) URL.revokeObjectURL(item.previewUrl);
    }
    setPending(items => items.filter(item => !successfulIds.has(item.id)));
    setUploadResults(results);
    try {
      await load();
    } catch {
      setError('Không làm mới được danh sách ảnh 360 sau khi tải lên.');
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, data: Partial<Pick<PropertyPanorama, 'label' | 'sort_order' | 'is_active'>>) => {
    if (!propertyId) return;
    setBusy(true);
    try {
      const updated = await updatePropertyPanorama(propertyId, id, data);
      setPanoramas(rows => rows.map(row => row.id === id ? updated : row));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không cập nhật được ảnh 360.');
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= panoramas.length) return;
    await reorder(index, target);
  };

  const reorder = async (fromIndex: number, toIndex: number) => {
    if (!propertyId) return;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= panoramas.length || toIndex >= panoramas.length) return;
    const next = [...panoramas];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setPanoramas(next.map((row, index) => ({ ...row, sort_order: index })));
    setBusy(true);
    setError('');
    try {
      for (const [index, row] of next.entries()) {
        await updatePropertyPanorama(propertyId, row.id, { sort_order: index });
      }
      await load();
    } catch (err) {
      await load();
      setError(err instanceof Error ? err.message : 'Không đổi được thứ tự ảnh 360.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!propertyId) return;
    if (!window.confirm('Xóa ảnh 360 này khỏi sản phẩm?')) return;
    setBusy(true);
    try {
      await deletePropertyPanorama(propertyId, id);
      setPanoramas(rows => rows.filter(row => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được ảnh 360.');
    } finally {
      setBusy(false);
    }
  };

  const validPendingCount = pending.filter(item => item.status === 'valid' || item.status === 'error').length;
  const openPicker = (targetId?: string) => {
    setReplaceTargetId(targetId ?? null);
    if (fileRef.current) {
      fileRef.current.multiple = !targetId;
      fileRef.current.click();
    }
  };

  return (
    <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Ảnh 360° trong sản phẩm</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">Chọn ảnh để xem trước toàn cảnh trước khi {propertyId ? 'tải lên' : 'lưu cùng sản phẩm'}. Chỉ nhận JPG/WEBP equirectangular gần tỷ lệ 2:1.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {validPendingCount > 0 && propertyId && (
            <button type="button" onClick={() => void handleUpload()} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              Tải lên {validPendingCount} ảnh hợp lệ
            </button>
          )}
          <button type="button" onClick={() => openPicker()} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            Chọn ảnh 360
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/webp,.jpg,.jpeg,.webp" multiple={replaceTargetId === null} className="hidden" onChange={event => void handleSelection(event.target.files)} />
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {uploadResults.length > 0 && (
        <ul aria-live="polite" className="mb-3 space-y-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
          {uploadResults.map(result => (
            <li key={`${result.name}-${result.message}`} className={`flex items-start gap-1.5 ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
              {result.ok ? <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span><b>{result.name}</b>: {result.message}</span>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <div className="mb-3 space-y-2 rounded-lg border border-indigo-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-gray-800">Ảnh đang chờ xử lý</h4>
            <span className="text-[10px] text-gray-500">Ảnh sai sẽ không được tải lên</span>
          </div>
          {pending.map(item => {
            const target = item.replaceId ? panoramas.find(row => row.id === item.replaceId) : undefined;
            const isValid = item.status === 'valid' || item.status === 'error';
            return (
              <div key={item.id} className={`rounded-lg border p-2 ${item.status === 'invalid' ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex flex-wrap items-start gap-3">
                  {item.previewError ? (
                    <div role="img" aria-label={`Không thể xem trước ${item.file.name}`} className="flex aspect-[2/1] w-full max-w-sm items-center justify-center rounded-md bg-slate-100 px-3 text-center text-xs text-gray-500">Không thể hiển thị xem trước ảnh này.</div>
                  ) : (
                    <img src={item.previewUrl} alt={`Xem trước ${item.file.name}`} onError={() => updatePending(item.id, { previewError: true })} className="aspect-[2/1] w-full max-w-sm rounded-md bg-slate-950 object-contain" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-800">{item.file.name}</p>
                    {target && <p className="mt-1 text-[10px] text-indigo-600">Thay cho: {target.label || target.original_filename}</p>}
                    {item.width && item.height && <p className="mt-1 text-[10px] text-gray-500">{item.width}×{item.height} · {(item.file.size / 1024 / 1024).toFixed(2)} MB</p>}
                    <input aria-label={`Nhãn ảnh chờ ${item.file.name}`} value={item.label}
                      onChange={event => updatePending(item.id, { label: event.target.value })}
                      className="mt-2 w-full rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-800 focus:border-indigo-400 focus:outline-none" placeholder="Nhãn không gian (tùy chọn)" />
                    <p className={`mt-2 text-xs ${item.status === 'invalid' || item.status === 'error' ? 'text-red-700' : item.status === 'checking' ? 'text-gray-500' : 'text-emerald-700'}`}>
                      {item.message}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <button type="button" onClick={() => movePending(pending.indexOf(item), -1)} disabled={busy || pending.indexOf(item) === 0} className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40" aria-label="Đưa ảnh chờ lên"><ArrowUp className="h-3 w-3" /></button>
                      <button type="button" onClick={() => movePending(pending.indexOf(item), 1)} disabled={busy || pending.indexOf(item) === pending.length - 1} className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40" aria-label="Đưa ảnh chờ xuống"><ArrowDown className="h-3 w-3" /></button>
                      <button type="button" onClick={() => removePending(item.id)} disabled={busy} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                        Bỏ ảnh này
                      </button>
                    </div>
                  </div>
                </div>
                {!isValid && item.status !== 'checking' && <p className="mt-2 text-[10px] font-semibold text-red-700">Hãy bỏ ảnh này hoặc chọn lại file đúng trước khi tải lên.</p>}
              </div>
            );
          })}
        </div>
      )}
      {loading ? <p className="text-xs text-gray-500">Đang tải danh sách ảnh 360...</p> : panoramas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-indigo-200 bg-white px-3 py-4 text-center text-xs text-gray-500">Chưa có ảnh 360 nào.</p>
      ) : (
        <div className="space-y-2">
          {panoramas.map((panorama, index) => (
            <div key={panorama.id} draggable={!busy} onDragStart={() => setDragIndex(index)} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragIndex !== null) void reorder(dragIndex, index); setDragIndex(null); }} onDragEnd={() => setDragIndex(null)} aria-grabbed={dragIndex === index} className={`flex flex-wrap items-center gap-3 rounded-lg border bg-white p-2.5 ${dragIndex === index ? 'border-indigo-400 shadow-md' : 'border-gray-200'}`}>
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400" aria-hidden="true" />
              <img src={panorama.url} alt={`Ảnh 360 ${panorama.label || `không gian ${index + 1}`}`} onError={event => { event.currentTarget.style.visibility = 'hidden'; }} className="h-16 w-28 rounded-md bg-gray-100 object-cover" />
              <div className="min-w-0 flex-1">
                <input aria-label={`Nhãn ảnh 360 ${index + 1}`} value={panorama.label}
                  onChange={event => setPanoramas(rows => rows.map(row => row.id === panorama.id ? { ...row, label: event.target.value } : row))}
                  onBlur={event => void patch(panorama.id, { label: event.target.value })}
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-800 focus:border-indigo-400 focus:outline-none" placeholder="Ví dụ: Phòng khách" />
                <p className="mt-1 truncate text-[10px] text-gray-400">{panorama.original_filename} · {panorama.width}×{panorama.height}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" title="Đưa lên" aria-label="Đưa ảnh lên" disabled={busy || index === 0} onClick={() => void move(index, -1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" title="Đưa xuống" aria-label="Đưa ảnh xuống" disabled={busy || index === panoramas.length - 1} onClick={() => void move(index, 1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" title="Thay ảnh" aria-label={`Thay ảnh 360 ${index + 1}`} disabled={busy} onClick={() => openPicker(panorama.id)} className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50 disabled:opacity-30"><RefreshCw className="h-3.5 w-3.5" /></button>
                <button type="button" title={panorama.is_active ? 'Ẩn ảnh' : 'Hiện ảnh'} aria-label={panorama.is_active ? 'Ẩn ảnh' : 'Hiện ảnh'} disabled={busy} onClick={() => void patch(panorama.id, { is_active: !panorama.is_active })} className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50 disabled:opacity-30">{panorama.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
                <button type="button" title="Xóa ảnh" aria-label="Xóa ảnh" disabled={busy} onClick={() => void remove(panorama.id)} className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
