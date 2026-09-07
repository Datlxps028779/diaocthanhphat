'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import type { UserListingPanorama } from '../../lib/supabase';
import { deleteUserListingPanorama, getUserListingPanoramas, reorderUserListingPanoramas, replaceUserListingPanorama, updateUserListingPanorama } from '../../lib/api/media';

export function UserListingPanoramaReview({ listingId }: { listingId: string }) {
  const [rows, setRows] = useState<UserListingPanorama[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getUserListingPanoramas({ listingId })
      .then(data => { if (alive) setRows(data); })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : 'Không tải được ảnh 360.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [listingId]);

  const patch = async (row: UserListingPanorama, patch: Partial<Pick<UserListingPanorama, 'label' | 'is_active'>>) => {
    setBusyId(row.id);
    try {
      const updated = await updateUserListingPanorama(row.id, patch);
      setRows(current => current.map(item => item.id === row.id ? updated : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Không cập nhật được ảnh 360.'); }
    finally { setBusyId(null); }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setBusyId(next[index].id);
    try {
      await reorderUserListingPanoramas(next);
      setRows(next.map((row, position) => ({ ...row, sort_order: position })));
    } catch (err) { setError(err instanceof Error ? err.message : 'Không sắp xếp được ảnh 360.'); }
    finally { setBusyId(null); }
  };

  const replace = async (row: UserListingPanorama, file: File | undefined) => {
    if (!file) return;
    setBusyId(row.id);
    setError('');
    try {
      const updated = await replaceUserListingPanorama(row.id, file);
      setRows(current => current.map(item => item.id === row.id ? updated : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thay được ảnh 360.'); }
    finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Xóa ảnh 360 này khỏi tin đang kiểm duyệt?')) return;
    setBusyId(id);
    try {
      await deleteUserListingPanorama(id);
      setRows(current => current.filter(row => row.id !== id));
    } catch (err) { setError(err instanceof Error ? err.message : 'Không xóa được ảnh 360.'); }
    finally { setBusyId(null); }
  };

  if (loading) return <div className="mt-3 flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Đang tải ảnh 360...</div>;
  if (error) return <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>;
  if (rows.length === 0) return <p className="mt-3 text-xs text-gray-500">Không còn ảnh 360 trong tin này.</p>;

  return <div className="mt-3 grid gap-2 sm:grid-cols-2">{rows.map((row, index) => <div key={row.id} className={`rounded-lg border p-2 ${row.is_active ? 'border-violet-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
    <img src={row.preview_url} alt={`Ảnh 360 ${row.label || `không gian ${index + 1}`}`} className="aspect-[2/1] w-full rounded-md bg-slate-950 object-contain" />
    <div className="mt-2 flex items-start gap-2"><div className="min-w-0 flex-1"><input aria-label={`Nhãn ảnh 360 ${index + 1}`} defaultValue={row.label} onBlur={event => void patch(row, { label: event.target.value })} className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-800" /><p className="mt-1 truncate text-[10px] text-gray-400">{row.original_filename} · {row.width}×{row.height}</p></div><div className="flex gap-1"><button type="button" onClick={() => void move(index, -1)} disabled={busyId !== null || index === 0} title="Đưa lên trước" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void move(index, 1)} disabled={busyId !== null || index === rows.length - 1} title="Đưa xuống sau" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void patch(row, { is_active: !row.is_active })} disabled={busyId === row.id} title={row.is_active ? 'Tắt ảnh' : 'Bật ảnh'} className="rounded p-1.5 text-violet-600 hover:bg-violet-50 disabled:opacity-40">{row.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button><label title="Thay ảnh 360" className="cursor-pointer rounded p-1.5 text-blue-600 hover:bg-blue-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40"><RefreshCw className="h-3.5 w-3.5" /><input type="file" accept="image/jpeg,image/webp,.jpg,.jpeg,.webp" className="hidden" disabled={busyId === row.id} onChange={event => { void replace(row, event.target.files?.[0]); event.target.value = ''; }} /></label><button type="button" onClick={() => void remove(row.id)} disabled={busyId === row.id} title="Xóa ảnh" className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
  </div>)}</div>;
}
