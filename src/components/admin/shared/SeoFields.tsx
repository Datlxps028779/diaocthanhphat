import { Search } from 'lucide-react';
import { SEOPreview } from '../../../lib/useSEOAutofill';

export interface SeoFieldsValue {
  meta_title: string;
  meta_description: string;
  focus_keywords: string;
}

function compact(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function SeoFields({
  value,
  onChange,
  basePath = '/...',
}: {
  value: SeoFieldsValue;
  onChange: (value: SeoFieldsValue) => void;
  basePath?: string;
}) {
  const set = (key: keyof SeoFieldsValue, next: string) => {
    onChange({ ...value, [key]: next });
  };

  const titleLen = value.meta_title.trim().length;
  const descLen = value.meta_description.trim().length;
  const keywordCount = value.focus_keywords.split(',').map(s => s.trim()).filter(Boolean).length;
  const titleHint = titleLen >= 30 && titleLen <= 65 ? 'Tốt' : titleLen ? 'Cần tối ưu' : 'Bắt buộc';
  const descHint = descLen >= 120 && descLen <= 160 ? 'Tốt' : descLen ? 'Cần tối ưu' : 'Bắt buộc';

  return (
    <div className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-red-500" />
        <h3 className="text-sm font-bold text-gray-900">SEO</h3>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">Tiêu đề SEO</label>
        <input
          value={value.meta_title}
          onChange={e => set('meta_title', e.target.value)}
          maxLength={70}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          placeholder="Tối ưu 50–60 ký tự"
        />
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className={titleLen >= 30 && titleLen <= 65 ? 'text-emerald-600' : titleLen ? 'text-amber-600' : 'text-red-500'}>{titleHint}</span>
          <span className="text-gray-400">{titleLen}/65 ký tự</span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">Meta description</label>
        <textarea
          value={value.meta_description}
          onChange={e => set('meta_description', e.target.value)}
          rows={2}
          maxLength={170}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          placeholder="Tối ưu 140–155 ký tự"
        />
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className={descLen >= 120 && descLen <= 160 ? 'text-emerald-600' : descLen ? 'text-amber-600' : 'text-red-500'}>{descHint}</span>
          <span className="text-gray-400">{descLen}/160 ký tự</span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">Focus keywords</label>
        <input
          value={value.focus_keywords}
          onChange={e => set('focus_keywords', e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          placeholder="bất động sản Bình Dương, nhà phố, đất nền..."
        />
        <p className={`mt-1 text-[10px] ${keywordCount >= 3 ? 'text-emerald-600' : keywordCount ? 'text-amber-600' : 'text-red-500'}`}>
          {keywordCount ? `${keywordCount} nhóm từ khóa` : 'Bắt buộc có từ khóa'} — nên gồm chủ đề, địa danh, loại nhu cầu.
        </p>
      </div>

      <SEOPreview metaTitle={compact(value.meta_title)} metaDescription={compact(value.meta_description)} focusKeywords={value.focus_keywords} />
      <p className="text-[10px] text-gray-400">Canonical preview: {basePath}</p>
    </div>
  );
}
