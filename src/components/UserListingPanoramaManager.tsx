'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, ImagePlus, Loader2, RefreshCw, Trash2, ArrowDown, ArrowUp } from 'lucide-react';
import type { UserListingPanorama } from '../lib/supabase';
import { deleteUserListingPanorama, getUserListingPanoramas, inspectPanorama360, replaceUserListingPanorama, uploadUserListingPanorama, updateUserListingPanorama } from '../lib/api/media';

type PendingPanorama = {
  id: string;
  file: File;
  previewUrl: string;
  status: 'checking' | 'valid' | 'invalid' | 'error';
  message: string;
  width?: number;
  height?: number;
};

export function UserListingPanoramaManager({
  draftId,
  listingId,
  onChange,
}: {
  draftId: string;
  listingId?: string;
  onChange: (ids: string[]) => void;
}) {
  const [panoramas, setPanoramas] = useState<UserListingPanorama[]>([]);
  const [pending, setPending] = useState<PendingPanorama[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingPanorama[]>([]);

  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => () => pendingRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl)), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getUserListingPanoramas(listingId ? { listingId } : { draftId })
      .then(rows => {
        if (!alive) return;
        setPanoramas(rows);
        onChange(rows.map(row => row.id));
      })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : 'Không tải được kho ảnh 360.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [draftId, listingId, onChange]);

  const selectFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    setResults([]);
    const items = Array.from(files).map(file => ({
      id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file),
      status: 'checking' as const, message: 'Đang kiểm tra ảnh...',
    }));
    setPending(current => [...current, ...items]);
    if (fileRef.current) fileRef.current.value = '';
    for (const item of items) {
      try {
        const inspection = await inspectPanorama360(item.file);
        setPending(current => current.map(row => row.id === item.id ? {
          ...row, status: 'valid', message: 'Ảnh hợp lệ, sẵn sàng lưu vào kho.', width: inspection.width, height: inspection.height,
        } : row));
      } catch (err) {
        setPending(current => current.map(row => row.id === item.id ? {
          ...row, status: 'invalid', message: err instanceof Error ? err.message : 'Ảnh không hợp lệ.',
        } : row));
      }
    }
  };

  const removePending = (id: string) => {
    const item = pending.find(row => row.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    setPending(rows => rows.filter(row => row.id !== id));
  };

  const savePending = async () => {
    const candidates = pending.filter(item => item.status === 'valid' || item.status === 'error');
    if (!candidates.length) return;
    setBusy(true);
    setError('');
    const saved: UserListingPanorama[] = [];
    const savedPendingIds = new Set<string>();
    const failed: string[] = [];
    for (const item of candidates) {
      try {
        saved.push(await uploadUserListingPanorama(item.file, draftId));
        savedPendingIds.add(item.id);
        URL.revokeObjectURL(item.previewUrl);
      } catch (err) {
        failed.push(`${item.file.name}: ${err instanceof Error ? err.message : 'Lưu ảnh thất bại.'}`);
        setPending(rows => rows.map(row => row.id === item.id ? { ...row, status: 'error', message: 'Lưu thất bại, bạn có thể thử lại.' } : row));
      }
    }
    if (saved.length) {
      setPanoramas(rows => {
        const next = [...rows, ...saved];
        onChange(next.map(row => row.id));
        return next;
      });
      setPending(rows => rows.filter(row => !savedPendingIds.has(row.id)));
    }
    setResults(failed);
    setBusy(false);
  };

  const removeSaved = async (id: string) => {
    if (!window.confirm('Bỏ ảnh 360 này khỏi tin đăng?')) return;
    setBusy(true);
    try {
      await deleteUserListingPanorama(id);
      setPanoramas(rows => {
        const next = rows.filter(row => row.id !== id);
        onChange(next.map(row => row.id));
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được ảnh 360.');
    } finally { setBusy(false); }
  };

  const replaceSaved = async (file: File | undefined) => {
    const id = replaceTargetId;
    setReplaceTargetId(null);
    if (!file || !id) return;
    setBusy(true);
    setError('');
    try {
      const updated = await replaceUserListingPanorama(id, file);
      setPanoramas(rows => rows.map(row => row.id === id ? updated : row));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thay được ảnh 360.');
    } finally {
      setBusy(false);
      if (replaceFileRef.current) replaceFileRef.current.value = '';
    }
  };

  const moveSaved = async (id: string, direction: -1 | 1) => {
    const index = panoramas.findIndex(row => row.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= panoramas.length) return;
    const next = [...panoramas];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setBusy(true);
    setError('');
    try {
      const updated = await Promise.all(next.map((row, order) => updateUserListingPanorama(row.id, { sort_order: order })));
      setPanoramas(updated.sort((a, b) => a.sort_order - b.sort_order));
      onChange(updated.map(row => row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không sắp xếp được ảnh 360.');
    } finally { setBusy(false); }
  };

  const patch = async (id: string, label: string) => {
    try {
      const updated = await updateUserListingPanorama(id, { label });
      setPanoramas(rows => rows.map(row => row.id === id ? updated : row));
    } catch (err) { setError(err instanceof Error ? err.message : 'Không cập nhật được nhãn ảnh 360.'); }
  };

  const validCount = pending.filter(item => item.status === 'valid' || item.status === 'error').length;
  return (
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4" data-testid="user-listing-panorama-manager">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-800">Ảnh 360° riêng cho tin này</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">Ảnh toàn cảnh giúp khách kéo xoay và phóng to. Ảnh được kiểm tra và chỉ lưu sau khi bạn bấm xác nhận; ảnh chờ duyệt không hiển thị công khai.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {validCount > 0 && <button type="button" onClick={() => void savePending()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"><CheckCircle className="h-3.5 w-3.5" />Lưu {validCount} ảnh 360</button>}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><ImagePlus className="h-3.5 w-3.5" />Chọn ảnh 360</button>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/webp,.jpg,.jpeg,.webp" multiple className="hidden" onChange={event => void selectFiles(event.target.files)} />
        <input ref={replaceFileRef} type="file" accept="image/jpeg,image/webp,.jpg,.jpeg,.webp" className="hidden" onChange={event => void replaceSaved(event.target.files?.[0])} />
      </div>
      <p className="mt-2 text-[11px] text-gray-500">JPG/WEBP · tối thiểu 2000×1000 · tỷ lệ gần 2:1 · tối đa 30MB/ảnh · tối đa 20 ảnh/tin.</p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {results.length > 0 && <ul className="mt-3 space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{results.map(item => <li key={item}>{item}</li>)}</ul>}
      {pending.length > 0 && <div className="mt-3 space-y-2 rounded-lg border border-indigo-200 bg-white p-3"><h4 className="text-xs font-bold text-gray-800">Ảnh đang chờ xác nhận</h4>{pending.map(item => <div key={item.id} className={`flex flex-wrap gap-3 rounded-lg border p-2 ${item.status === 'invalid' ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-gray-50'}`}>
        <img src={item.previewUrl} alt={`Xem trước ${item.file.name}`} className="aspect-[2/1] w-full max-w-sm rounded-md bg-slate-950 object-contain" />
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-gray-800">{item.file.name}</p>{item.width && item.height && <p className="mt-1 text-[10px] text-gray-500">{item.width}×{item.height} · {(item.file.size / 1024 / 1024).toFixed(2)}MB</p>}<p className={`mt-2 text-xs ${item.status === 'invalid' || item.status === 'error' ? 'text-red-700' : item.status === 'valid' ? 'text-emerald-700' : 'text-gray-500'}`}>{item.status === 'checking' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}{item.message}</p><button type="button" onClick={() => removePending(item.id)} disabled={busy} className="mt-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">Bỏ ảnh này</button></div>
      </div>)}</div>}
      {loading ? <p className="mt-3 text-xs text-gray-500">Đang tải ảnh 360 đã lưu...</p> : panoramas.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-indigo-200 bg-white px-3 py-4 text-center text-xs text-gray-500">Chưa có ảnh 360 cho tin này.</p> : <div className="mt-3 space-y-2">{panoramas.map((row, index) => <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-2.5"><img src={row.preview_url} alt={`Ảnh 360 ${row.label || `không gian ${index + 1}`}`} className="h-16 w-28 rounded-md bg-gray-100 object-contain" /><div className="min-w-0 flex-1"><input aria-label={`Nhãn ảnh 360 ${index + 1}`} defaultValue={row.label} onBlur={event => void patch(row.id, event.target.value)} className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-800" /><p className="mt-1 truncate text-[10px] text-gray-400">{row.original_filename} · {row.width}×{row.height}</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => void moveSaved(row.id, -1)} disabled={busy || index === 0} aria-label={`Đưa ảnh 360 ${index + 1} lên`} title="Đưa lên" className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void moveSaved(row.id, 1)} disabled={busy || index === panoramas.length - 1} aria-label={`Đưa ảnh 360 ${index + 1} xuống`} title="Đưa xuống" className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" onClick={() => { setReplaceTargetId(row.id); replaceFileRef.current?.click(); }} disabled={busy} title="Thay ảnh 360" className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50 disabled:opacity-30"><RefreshCw className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void removeSaved(row.id)} disabled={busy} title="Bỏ ảnh 360" className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button></div></div>)}</div>}
    </section>
  );
}
