import { supabase } from '../supabase';
import type { AdvisorMessage } from '../aiAdvisor';

export interface AiCitation {
  source_table: string;
  source_id: string;
  title: string;
  source_url: string | null;
}

export interface AiChatResponse {
  understood_query: string;
  reply: string;
  handoff: boolean;
  sensitive: 'legal' | 'loan' | 'investment' | null;
  safety_note: string;
  insufficient_evidence: boolean;
  citations: AiCitation[];
}

export function isSafeCitationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export async function askAiChat(message: string, history: AdvisorMessage[]): Promise<AiChatResponse | null> {
  const safeHistory = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-6)
    .map(m => ({ role: m.role, text: m.text }));

  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: { message, history: safeHistory },
  });
  if (error || !data?.ok) return null;
  const citations: AiCitation[] = Array.isArray(data.citations)
    ? data.citations
        .filter((c: unknown): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c: Record<string, unknown>) => ({
          source_table: typeof c.source_table === 'string' ? c.source_table : '',
          source_id: typeof c.source_id === 'string' ? c.source_id : '',
          title: typeof c.title === 'string' ? c.title : '',
          source_url: typeof c.source_url === 'string' ? c.source_url : null,
        }))
        .filter((c: AiCitation) => c.source_table.trim() !== '' && c.source_id.trim() !== '' && c.title.trim() !== '')
        .map((c: AiCitation) => ({ ...c, source_url: isSafeCitationUrl(c.source_url) ? c.source_url : null }))
    : [];
  return {
    understood_query: typeof data.understood_query === 'string' ? data.understood_query : '',
    reply: typeof data.reply === 'string' ? data.reply : '',
    handoff: data.handoff === true,
    sensitive: data.sensitive === 'legal' || data.sensitive === 'loan' || data.sensitive === 'investment' ? data.sensitive : null,
    safety_note: typeof data.safety_note === 'string' ? data.safety_note : '',
    insufficient_evidence: data.insufficient_evidence === true,
    citations,
  };
}
