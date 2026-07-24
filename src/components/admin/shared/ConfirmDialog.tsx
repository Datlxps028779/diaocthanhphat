import { AlertCircle } from 'lucide-react';

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
// Mặc định là hộp XÓA (tiêu đề + nút "Xóa" đỏ) để các chỗ xóa sẵn có không đổi.
// Truyền title/confirmLabel/tone cho hành động không phải xóa (vd chạy quét nuôi dưỡng).
export function ConfirmDialog({ message, onConfirm, onCancel, title = 'Xác nhận xóa', confirmLabel = 'Xóa', tone = 'danger' }: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
}) {
  const confirmClass = tone === 'primary'
    ? 'bg-gray-900 hover:bg-gray-800'
    : 'bg-red-600 hover:bg-red-700';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className={`w-6 h-6 flex-shrink-0 mt-0.5 ${tone === 'primary' ? 'text-gray-700' : 'text-red-500'}`} />
          <div>
            <h3 className="font-bold text-gray-900">{title}</h3>
            <p className="text-gray-600 text-sm mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={onConfirm} className={`${confirmClass} text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
