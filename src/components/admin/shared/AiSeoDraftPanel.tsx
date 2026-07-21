import { useState } from 'react';
import { AlertCircle, Check, Loader2, Sparkles, X } from 'lucide-react';
import { adminGenerateSeoGeoDraft, type AiSeoDraft, type AiSeoTargetType } from '../../../lib/api';

type Props = {
  targetType: AiSeoTargetType;
  targetId?: string;
  path?: string;
  disabled?: boolean;
  disabledHint?: string;
  onApply: (draft: AiSeoDraft, applyEmptyOnly: boolean) => void;
};

export function AiSeoDraftPanel({ targetType, targetId, path, disabled, disabledHint, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<AiSeoDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const canRun = !disabled && (targetType === 'route' ? !!path : !!targetId);

  const generate = async () => {
    setLoading(true);
    setError('');
    setDraft(null);
    setWarnings([]);
    try {
      const input = targetType === 'route'
        ? { targetType: 'route' as const, path: path! }
        : { targetType, targetId: targetId! } as { targetType: 'property' | 'news' | 'area'; targetId: string };
      const result = await adminGenerateSeoGeoDraft(input);
      setDraft(result.draft);
      setWarnings(result.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được draft AI.');
    } finally {
      setLoading(false);
    }
  };

  const apply = (emptyOnly: boolean) => {
    if (!draft) return;
    onApply(draft, emptyOnly);
    setDraft(null);
    setWarnings([]);
  };

  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700">
            <Sparkles className="h-3.5 w-3.5" /> AI sinh SEO / GEO / AEO
          </p>
          <p className="mt-1 text-[11px] text-violet-700/80">Draft do AI đề xuất từ dữ liệu thật — bạn xem, chỉnh rồi mới lưu. AI không tự ghi.</p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={!canRun || loading}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? 'Đang tạo...' : 'AI sinh draft'}
        </button>
      </div>

      {!canRun && disabledHint && (
        <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[11px] text-violet-700">{disabledHint}</p>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{error}
        </div>
      )}

      {draft && (
        <div className="mt-3 space-y-2 rounded-xl border border-violet-100 bg-white p-3">
          <DraftRow label="Tiêu đề SEO" value={draft.meta_title} />
          <DraftRow label="Meta description" value={draft.meta_description} />
          <DraftRow label="Focus keywords" value={draft.focus_keywords} />
          {targetType === 'news' && (
            <>
              <DraftRow label="GEO area" value={draft.geo_area ?? ''} />
              <DraftRow label="GEO entity" value={draft.geo_entity ?? ''} />
              <DraftRow label="GEO notes" value={draft.geo_notes ?? ''} />
            </>
          )}
          <details className="rounded-lg bg-gray-950 p-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-emerald-200">Schema JSON-LD</summary>
            <pre className="mt-2 max-h-48 overflow-auto text-[10px] leading-relaxed text-emerald-100">{JSON.stringify(draft.schema_markup, null, 2)}</pre>
          </details>
          {draft.aeo_notes && draft.aeo_notes.length > 0 && (
            <div className="rounded-lg bg-violet-50 px-3 py-2 text-[11px] text-violet-800">
              <p className="font-bold">Gợi ý AEO</p>
              <ul className="mt-1 list-disc pl-4">{draft.aeo_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <ul className="list-disc pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => apply(false)}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700">
              <Check className="h-3.5 w-3.5" /> Áp dụng vào form
            </button>
            <button type="button" onClick={() => apply(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
              Chỉ áp dụng field đang trống
            </button>
            <button type="button" onClick={() => { setDraft(null); setWarnings([]); }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">
              <X className="h-3.5 w-3.5" /> Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="font-semibold text-gray-500">{label}: </span>
      <span className="text-gray-800">{value || <em className="text-gray-400">(trống)</em>}</span>
    </div>
  );
}
