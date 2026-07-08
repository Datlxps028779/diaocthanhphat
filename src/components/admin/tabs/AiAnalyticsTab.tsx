import { useState } from 'react';
import { Building2, Users, TrendingUp, AlertCircle, BarChart3, RefreshCw, Download } from 'lucide-react';
import { callAiAnalytics } from '../../../lib/api';

// ─── AI Analytics Tab ─────────────────────────────────────────────────────────
export function AiAnalyticsTab() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await callAiAnalytics();
      setAnalysis(result.analysis);
      setLastRun(new Date().toLocaleString('vi-VN'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally { setLoading(false); }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(analysis).catch(() => {});
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-red-500" />AI Phân Tích Thị Trường
          </h2>
          <p className="text-gray-500 text-sm mt-0.5">
            AI đọc toàn bộ số liệu thống kê và đưa ra nhận xét chuyên sâu về xu hướng thị trường BĐS vùng ven.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm disabled:opacity-60 flex-shrink-0"
        >
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin" />Đang phân tích...</>
            : <><TrendingUp className="w-4 h-4" />AI Phân Tích Ngay</>
          }
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 p-4 bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl border border-gray-200">
        {[
          { icon: <Building2 className="w-4 h-4 text-blue-500" />, label: 'Phân tích BĐS', desc: 'Cơ cấu mua bán / cho thuê, tỷ lệ BĐS hot' },
          { icon: <Users className="w-4 h-4 text-emerald-500" />, label: 'Đánh giá Leads', desc: 'Xu hướng tăng trưởng, tỷ lệ xử lý' },
          { icon: <BarChart3 className="w-4 h-4 text-purple-500" />, label: 'Chiến lược', desc: 'Gợi ý hành động cụ thể từ AI' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">{c.icon}<span className="text-xs font-bold text-gray-800">{c.label}</span></div>
            <p className="text-[11px] text-gray-500 leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 text-sm font-semibold">Lỗi phân tích</p>
            <p className="text-red-700 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="w-12 h-12 border-3 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderWidth: 3 }} />
          <p className="font-semibold text-gray-700">AI đang đọc dữ liệu và phân tích...</p>
          <p className="text-gray-400 text-sm mt-1">Quá trình này mất khoảng 5-15 giây</p>
        </div>
      )}

      {analysis && !loading && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-gray-800">Kết quả phân tích AI</span>
              {lastRun && <span className="text-xs text-gray-400">— {lastRun}</span>}
            </div>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />Sao chép
            </button>
          </div>
          <div className="p-5">
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">
              {analysis}
            </div>
          </div>
        </div>
      )}

      {!analysis && !loading && !error && (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="font-bold text-gray-800 mb-1.5">Bắt đầu phân tích với AI</h3>
          <p className="text-gray-400 text-sm mb-4 max-w-sm mx-auto">
            Nhấn nút "AI Phân Tích Ngay" để nhận báo cáo thị trường BĐS chuyên sâu được tạo tự động từ dữ liệu thực tế của website.
          </p>
          <button onClick={run} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
            Phân tích ngay
          </button>
        </div>
      )}
    </div>
  );
}
