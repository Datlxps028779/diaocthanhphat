import type { AiSeoDraft } from '../../../lib/api';
import type { SeoFieldsValue } from './SeoFields';

// Merge một AI draft vào SeoFieldsValue. emptyOnly=true chỉ điền vào các field đang trống,
// để admin giữ nội dung đã chỉnh tay. Schema luôn được stringify để hiển thị trong textarea.
export function applyDraftToSeoFields(current: SeoFieldsValue, draft: AiSeoDraft, emptyOnly: boolean): SeoFieldsValue {
  const pick = (cur: string, next: string) => (emptyOnly && cur.trim() ? cur : (next ?? cur));
  const schemaStr = draft.schema_markup && Object.keys(draft.schema_markup).length > 0
    ? JSON.stringify(draft.schema_markup, null, 2)
    : current.schema_markup;
  return {
    meta_title: pick(current.meta_title, draft.meta_title),
    meta_description: pick(current.meta_description, draft.meta_description),
    focus_keywords: pick(current.focus_keywords, draft.focus_keywords),
    schema_markup: emptyOnly && current.schema_markup.trim() ? current.schema_markup : schemaStr,
  };
}
