import { AlertCircle, CheckCircle, Search } from 'lucide-react';
import { SEOPreview } from '../../../lib/useSEOAutofill';
import { parseSchemaJson, validateSchemaMarkup, type SchemaTarget } from '../../../lib/schemaValidation';

export interface SeoFieldsValue {
  meta_title: string;
  meta_description: string;
  focus_keywords: string;
  schema_markup: string;
}

export function parseSeoSchema(value: string, target: SchemaTarget): { schema: Record<string, unknown> | null; error: string | null; warnings: string[] } {
  const parsed = parseSchemaJson(value);
  if (!parsed.valid) return { schema: null, error: parsed.warnings[0] || 'Schema JSON không hợp lệ.', warnings: parsed.warnings };
  const validation = validateSchemaMarkup(parsed.schema, target);
  if (!validation.valid) return { schema: null, error: validation.warnings[0] || 'Schema không hợp lệ cho loại trang này.', warnings: validation.warnings };
  return { schema: validation.schema, error: null, warnings: validation.warnings };
}

export function SeoFields({
  value,
  onChange,
  target,
  basePath = '/...',
}: {
  value: SeoFieldsValue;
  onChange: (value: SeoFieldsValue) => void;
  target: SchemaTarget;
  basePath?: string;
}) {
  const schemaState = parseSeoSchema(value.schema_markup, target);
  const set = (key: keyof SeoFieldsValue, next: string) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-red-500" />
        <h3 className="text-sm font-bold text-gray-900">SEO / Schema Pro</h3>
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
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">Focus keywords</label>
        <input
          value={value.focus_keywords}
          onChange={e => set('focus_keywords', e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          placeholder="bất động sản Bình Dương, nhà phố, đất nền..."
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">Schema custom JSON-LD</label>
        <textarea
          value={value.schema_markup}
          onChange={e => set('schema_markup', e.target.value)}
          rows={7}
          className={`w-full resize-none rounded-lg border px-3 py-2.5 font-mono text-xs focus:outline-none focus:ring-2 ${schemaState.error ? 'border-red-200 bg-red-50 focus:ring-red-300' : 'border-gray-200 focus:ring-red-400'}`}
          placeholder={`{\n  "@context": "https://schema.org",\n  "@type": "..."\n}`}
        />
        {value.schema_markup.trim() && (
          <div className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${schemaState.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {schemaState.error ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
            <span>{schemaState.error || 'Schema hợp lệ. Khi render public, các trường quan trọng vẫn lấy từ dữ liệu thật.'}</span>
          </div>
        )}
      </div>

      <SEOPreview metaTitle={value.meta_title} metaDescription={value.meta_description} focusKeywords={value.focus_keywords} />
      <p className="text-[10px] text-gray-400">Canonical preview: {basePath}</p>
    </div>
  );
}
