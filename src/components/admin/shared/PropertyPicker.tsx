import { useState, useEffect, useRef } from 'react';
import { Search, X, Building2, Check } from 'lucide-react';
import { getPropertyOptions } from '../../../lib/api';
import { filterProperties, propertySubtitle, type PropertyOption } from '../../../lib/leadProperty';

interface Props {
  value: string | null;                 // property_id đang chọn
  valueLabel?: string | null;           // nhãn tựa đề để hiện khi chưa tải kịp danh sách
  onChange: (id: string | null, title: string | null) => void;
  disabled?: boolean;
}

// Ô chọn BĐS quan tâm cho lead: tải danh sách gọn 1 lần, lọc theo từ khóa phía client,
// chọn 1 tin (hoặc gỡ). Dùng ở modal tạo khách + drawer chi tiết.
export function PropertyPicker({ value, valueLabel, onChange, disabled }: Props) {
  const [options, setOptions] = useState<PropertyOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPropertyOptions().then(list => { setOptions(list); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  // Đóng dropdown khi bấm ra ngoài.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selected = options.find(o => o.id === value);
  const shownLabel = selected?.title ?? valueLabel ?? null;
  const filtered = filterProperties(options, keyword).slice(0, 30);

  return (
    <div className="relative" ref={boxRef}>
      {shownLabel ? (
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-blue-50/50">
          <Building2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{shownLabel}</span>
          {!disabled && (
            <>
              <button type="button" onClick={() => setOpen(o => !o)}
                className="text-xs text-blue-600 hover:underline flex-shrink-0">Đổi</button>
              <button type="button" onClick={() => onChange(null, null)} aria-label="Gỡ BĐS"
                className="text-gray-400 hover:text-red-500 flex-shrink-0"><X className="w-4 h-4" /></button>
            </>
          )}
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500 hover:border-red-400 disabled:opacity-50 transition-colors">
          <Building2 className="w-4 h-4 text-gray-400" />
          <span>Gắn BĐS đang quan tâm (tùy chọn)</span>
        </button>
      )}

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input autoFocus value={keyword} onChange={e => setKeyword(e.target.value)}
              placeholder="Tìm theo tiêu đề..."
              className="flex-1 text-sm outline-none" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {!loaded ? (
              <p className="text-xs text-gray-400 text-center py-4">Đang tải...</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Không tìm thấy BĐS phù hợp.</p>
            ) : (
              filtered.map(p => (
                <button type="button" key={p.id}
                  onClick={() => { onChange(p.id, p.title); setOpen(false); setKeyword(''); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{p.title}</p>
                    {propertySubtitle(p) && <p className="text-xs text-gray-400">{propertySubtitle(p)}</p>}
                  </div>
                  {p.id === value && <Check className="w-4 h-4 text-red-600 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
