import { useState } from 'react';
import { Building2, Users, Star, Newspaper, FolderOpen, CheckCircle, Settings, Type, RefreshCw, Download, FileText, Shield } from 'lucide-react';
import { exportTableData } from '../../../lib/api';

// ─── Backup Tab ───────────────────────────────────────────────────────────────
export function BackupTab() {
  const TABLES = [
    { id: 'properties', label: 'Bất động sản', icon: <Building2 className="w-4 h-4" /> },
    { id: 'leads', label: 'Khách hàng (Leads)', icon: <Users className="w-4 h-4" /> },
    { id: 'user_listings', label: 'Tin đăng người dùng', icon: <FileText className="w-4 h-4" /> },
    { id: 'projects', label: 'Dự án', icon: <FolderOpen className="w-4 h-4" /> },
    { id: 'news', label: 'Tin tức', icon: <Newspaper className="w-4 h-4" /> },
    { id: 'testimonials', label: 'Đánh giá', icon: <Star className="w-4 h-4" /> },
    { id: 'site_settings', label: 'Cài đặt hệ thống', icon: <Settings className="w-4 h-4" /> },
    { id: 'site_content', label: 'Nội dung CMS', icon: <Type className="w-4 h-4" /> },
  ];

  const [loading, setLoading] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const downloadJSON = async (tableId: string, label: string) => {
    setLoading(tableId);
    try {
      const data = await exportTableData(tableId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableId}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport(`${label} — ${new Date().toLocaleTimeString('vi-VN')}`);
    } catch {
      alert('Lỗi xuất dữ liệu. Vui lòng thử lại.');
    } finally {
      setLoading(null);
    }
  };

  const downloadAll = async () => {
    setLoading('all');
    try {
      const results: Record<string, unknown[]> = {};
      for (const t of TABLES) {
        results[t.id] = await exportTableData(t.id);
      }
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `full_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport(`Toàn bộ dữ liệu — ${new Date().toLocaleTimeString('vi-VN')}`);
    } catch {
      alert('Lỗi xuất dữ liệu. Vui lòng thử lại.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Sao lưu dữ liệu</h2>
        <p className="text-gray-500 text-sm mt-0.5">Xuất dữ liệu dạng JSON để sao lưu hoặc chuyển đổi hosting.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-800 text-sm font-semibold">Sao lưu định kỳ được khuyến nghị</p>
          <p className="text-amber-700 text-xs mt-0.5">Xuất dữ liệu ít nhất 1 lần/tuần. File JSON có thể import lại khi chuyển hosting.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-sm">Xuất toàn bộ dữ liệu</h3>
          <button
            onClick={downloadAll}
            disabled={loading === 'all'}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60"
          >
            {loading === 'all'
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            {loading === 'all' ? 'Đang xuất...' : 'Xuất tất cả (.json)'}
          </button>
        </div>
        {lastExport && (
          <p className="text-emerald-600 text-xs flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />Đã xuất: {lastExport}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-sm">Xuất từng bảng dữ liệu</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {TABLES.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-gray-400">{t.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-400 font-mono">{t.id}</p>
                </div>
              </div>
              <button
                onClick={() => downloadJSON(t.id, t.label)}
                disabled={loading === t.id || loading === 'all'}
                className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:border-red-400 hover:text-red-600 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                {loading === t.id
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                Xuất JSON
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">Hướng dẫn khôi phục dữ liệu:</p>
        <p>1. Đăng nhập Supabase Dashboard của hosting mới</p>
        <p>2. Vào Table Editor → Import từng bảng bằng file .json tương ứng</p>
        <p>3. Hoặc dùng API Supabase để import hàng loạt</p>
        <p>4. Cập nhật các biến môi trường SUPABASE_URL và SUPABASE_ANON_KEY trong file .env</p>
      </div>
    </div>
  );
}
