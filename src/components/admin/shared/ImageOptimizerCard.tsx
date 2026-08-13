import { useState } from 'react';
import { ImageDown, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { adminScanImages, compressExistingImage, type ScannedImage, type CompressResult } from '../../../lib/api';

// Công cụ nén ảnh CŨ đã upload (admin-only). Quét cột ảnh nội dung thật → tạo
// object mới và cập nhật reference DB (copy-on-write), tránh CDN giữ bytes cũ cùng URL.
// Chạy client-side trong browser admin. Không đụng logo/og_image/avatar.

function fmtBytes(n: number): string {
  if (n <= 0) return '0';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.round(n / 1024)}KB`;
}

// Giới hạn nén đồng thời để không nghẽn CPU/bộ nhớ trình duyệt admin.
const CONCURRENCY = 3;

export function ImageOptimizerCard() {
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [images, setImages] = useState<ScannedImage[] | null>(null);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<CompressResult[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);

  const scan = async () => {
    setScanning(true);
    setMsg(null);
    setResults([]);
    setDone(0);
    try {
      const list = await adminScanImages();
      setImages(list);
      const references = list.reduce((sum, image) => sum + image.references.length, 0);
      setMsg({ kind: 'ok', text: `Tìm thấy ${list.length} file ảnh trong ${references} vị trí nội dung. Bấm "Nén tất cả" để tối ưu an toàn.` });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    }
    setScanning(false);
  };

  const runAll = async () => {
    if (!images || images.length === 0) return;
    setRunning(true);
    setMsg(null);
    setResults([]);
    setDone(0);
    const all: CompressResult[] = [];
    const queue = [...images];
    const worker = async () => {
      while (queue.length) {
        const img = queue.shift();
        if (!img) break;
        try {
          const r = await compressExistingImage(img);
          all.push(r);
        } catch (e) {
          all.push({ url: img.url, before: 0, after: 0, skipped: true, warning: true, reason: (e as Error).message });
        }
        setDone(all.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setResults(all);
    const compressed = all.filter(r => !r.skipped);
    const warned = all.filter(r => r.warning);
    const saved = compressed.reduce((s, r) => s + (r.before - r.after), 0);
    setMsg({
      kind: warned.length ? 'warn' : 'ok',
      text: `Đã nén ${compressed.length}/${all.length} ảnh, tiết kiệm ${fmtBytes(saved)}. ${all.length - compressed.length} ảnh giữ nguyên. ${warned.length ? `${warned.length} ảnh cần quét lại hoặc kiểm tra cảnh báo bên dưới.` : ''}`.trim(),
    });
    // Bắt buộc quét lại trước lần chạy tiếp theo để không dùng snapshot reference cũ.
    setImages(null);
    setRunning(false);
  };

  const total = images?.length ?? 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-black text-gray-900">
          <ImageDown className="h-4 w-4 text-red-500" />Tối ưu ảnh (nén)
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={scan} disabled={scanning || running}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />Quét ảnh
          </button>
          <button onClick={runAll} disabled={running || scanning || !images || images.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
            <ImageDown className={`h-3.5 w-3.5 ${running ? 'animate-pulse' : ''}`} />Nén tất cả
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-gray-500">
        Nén ảnh nội dung nặng (PNG/ảnh chụp lớn) để share Zalo/Facebook hiện thumbnail (Zalo bỏ qua ảnh &gt;~1MB).
        Ảnh đã nén được lưu ở URL mới rồi cập nhật đúng các bài đang dùng; file cũ vẫn được giữ để link đã chia sẻ không bị mất. Ảnh trong suốt (logo) được giữ nguyên.
      </p>

      {msg && (
        <div className={`mb-3 flex items-start gap-2 rounded-xl p-3 text-sm ${msg.kind === 'ok'
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : msg.kind === 'warn'
            ? 'bg-amber-50 text-amber-800 border border-amber-200'
            : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.kind === 'ok' ? <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {running && (
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span>Đang nén…</span><span>{done}/{total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-red-500 transition-all" style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
          </div>
        </div>
      )}

      {results.length > 0 && !running && (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {results.filter(r => !r.skipped || r.warning).map((r, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-1.5 text-xs ${r.warning ? 'border-amber-200 bg-amber-50' : 'border-gray-100'}`}>
              {r.warning
                ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                : <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />}
              <span className="min-w-0 flex-1 text-gray-500">
                <span className="block truncate">{r.url.split('/').pop()}</span>
                {r.warning && r.reason && <span className="mt-0.5 block text-amber-800">{r.reason}</span>}
              </span>
              {!r.skipped && <span className="flex-shrink-0 font-semibold text-gray-700">{fmtBytes(r.before)} → {fmtBytes(r.after)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
