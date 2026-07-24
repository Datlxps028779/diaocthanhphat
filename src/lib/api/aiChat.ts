import { supabase } from '../supabase';
import type { AdvisorMessage } from '../aiAdvisor';

export interface AiChatResponse {
  understood_query: string;
  reply: string;
  handoff: boolean;
  sensitive: 'legal' | 'loan' | 'investment' | null;
  safety_note: string;
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
  return {
    understood_query: typeof data.understood_query === 'string' ? data.understood_query : '',
    reply: typeof data.reply === 'string' ? data.reply : '',
    handoff: data.handoff === true,
    sensitive: data.sensitive === 'legal' || data.sensitive === 'loan' || data.sensitive === 'investment' ? data.sensitive : null,
    safety_note: typeof data.safety_note === 'string' ? data.safety_note : '',
  };
}
