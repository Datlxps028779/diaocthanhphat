import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { generateAIDescription } from '../lib/api';
import type { ListingType } from '../lib/supabase';

interface AiDescriptionHelperProps {
  keywords: string;
  listingType: ListingType;
  area: string;
  price: string;
  onApply: (text: string) => void;
}

export function AiDescriptionHelper({ keywords, listingType, area, price, onApply }: AiDescriptionHelperProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const generate = async () => {
    if (!keywords.trim()) return;
    setLoading(true);
    setError('');
    setResult('');
    try {
      const desc = await generateAIDescription({ keywords, listingType, area, price });
      setResult(desc);
    } catch {
      setError('Không thể tạo mô tả. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-dashed border-amber-300 bg-amber-50 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-bold text-amber-800">Trợ lý AI — Viết mô tả tự động</span>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading || !keywords.trim()}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          {loading
            ? <><Loader2 className="w-3 h-3 animate-spin" />Đang tạo...</>
            : <><Sparkles className="w-3 h-3" />Tạo mô tả</>}
        </button>
      </div>

      <p className="text-amber-700 text-[11px]">
        AI sẽ tự động viết mô tả SEO dựa trên tiêu đề và thông tin bạn đã nhập.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-lg p-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="bg-white border border-amber-200 rounded-lg p-3 text-xs text-gray-700 leading-relaxed">
            {result}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onApply(result)}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              Dùng mô tả này
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-1 border border-amber-300 text-amber-700 text-xs font-medium px-3 py-2 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />Tạo lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
