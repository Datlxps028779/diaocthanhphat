import { supabase, type ChatMessage, type ChatSession, type ChatStaffCapacity } from '../supabase';

export interface PublicChatHandle {
  sessionId: string;
  visitorToken: string;
}

export interface ChatRouteResult {
  assigned_user_id: string | null;
  admin_attention: boolean;
}

export async function startChatSession(input: { sessionId: string; visitorToken: string; needSummary?: string | null; propertyId?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('public_start_chat_session', {
    p_session_id: input.sessionId,
    p_visitor_token: input.visitorToken,
    p_need_summary: input.needSummary ?? null,
    p_property_id: input.propertyId ?? null,
  });
  if (error) throw error;
}

export async function appendPublicChatMessage(handle: PublicChatHandle, sender: 'visitor' | 'assistant', body: string): Promise<void> {
  const { error } = await supabase.rpc('public_append_chat_message', {
    p_session_id: handle.sessionId,
    p_visitor_token: handle.visitorToken,
    p_sender: sender,
    p_body: body,
  });
  if (error) throw error;
}

export async function getPublicChatMessages(handle: PublicChatHandle): Promise<Pick<ChatMessage, 'id' | 'sender' | 'body' | 'created_at'>[]> {
  const { data, error } = await supabase.rpc('public_get_chat_messages', {
    p_session_id: handle.sessionId,
    p_visitor_token: handle.visitorToken,
  });
  if (error) throw error;
  return (data ?? []) as Pick<ChatMessage, 'id' | 'sender' | 'body' | 'created_at'>[];
}

export async function linkChatLead(handle: PublicChatHandle, input: { leadId: string; visitorName?: string | null; visitorPhone?: string | null; needSummary?: string | null; propertyId?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('public_link_chat_lead', {
    p_session_id: handle.sessionId,
    p_visitor_token: handle.visitorToken,
    p_lead_id: input.leadId,
    p_visitor_name: input.visitorName ?? null,
    p_visitor_phone: input.visitorPhone ?? null,
    p_need_summary: input.needSummary ?? null,
    p_property_id: input.propertyId ?? null,
  });
  if (error) throw error;
}

export async function requestStaffChat(handle: PublicChatHandle, contact?: { visitorName?: string | null; visitorPhone?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('public_request_staff', {
    p_session_id: handle.sessionId,
    p_visitor_token: handle.visitorToken,
    p_visitor_name: contact?.visitorName ?? null,
    p_visitor_phone: contact?.visitorPhone ?? null,
  });
  if (error) throw error;
}

export async function routeChatSession(handle: PublicChatHandle): Promise<ChatRouteResult | null> {
  const { data, error } = await supabase.rpc('route_chat_session', {
    p_session_id: handle.sessionId,
    p_visitor_token: handle.visitorToken,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as ChatRouteResult | null;
}

export async function getChatSessions(filter: 'all' | 'new' | 'active' | 'attention' | 'closed' = 'all'): Promise<ChatSession[]> {
  let q = supabase
    .from('chat_sessions')
    .select('*, properties(id,title), leads(id,full_name,phone), chat_assignments(user_id)')
    .order('last_message_at', { ascending: false });
  if (filter === 'attention') q = q.eq('admin_attention', true).neq('status', 'closed');
  else if (filter !== 'all') q = q.eq('status', filter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ChatSession[];
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function sendStaffChatMessage(sessionId: string, body: string, authorId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, sender: 'staff', body, author_id: authorId });
  if (error) throw error;
}

export async function assignChatSession(sessionId: string, userId: string, assignedBy: string | null): Promise<void> {
  const { error } = await supabase
    .from('chat_assignments')
    .upsert({ session_id: sessionId, user_id: userId, assigned_by: assignedBy }, { onConflict: 'session_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function closeChatSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('close_chat_session', { p_session_id: sessionId });
  if (error) throw error;
}

export async function deleteChatSessions(sessionIds: string[]): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const { data, error } = await supabase.rpc('admin_delete_chat_sessions', { p_ids: sessionIds });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function getChatStaffCapacity(): Promise<ChatStaffCapacity[]> {
  const { data, error } = await supabase.from('chat_staff_capacity').select('*');
  if (error) throw error;
  return (data ?? []) as ChatStaffCapacity[];
}

export async function upsertChatStaffCapacity(input: { userId: string; maxActiveSessions: number; isAvailable: boolean }): Promise<void> {
  const { error } = await supabase
    .from('chat_staff_capacity')
    .upsert({ user_id: input.userId, max_active_sessions: input.maxActiveSessions, is_available: input.isAvailable, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function getChatOpsAlerts(): Promise<{ attention: number; active: number; newSessions: number }> {
  const rows = await getChatSessions('all');
  return {
    attention: rows.filter(r => r.admin_attention && r.status !== 'closed').length,
    active: rows.filter(r => r.status === 'active').length,
    newSessions: rows.filter(r => r.status === 'new').length,
  };
}
