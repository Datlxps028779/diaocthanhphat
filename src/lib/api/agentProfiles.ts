import { supabase, type AgentProfile, type AgentProfileAuditEvent, type AgentProfileDirectoryRow, type PublicPropertyAgent } from '../supabase';

export type AgentProfileDirectoryFilters = {
  search?: string;
  status?: AgentProfile['status'] | 'all';
  limit?: number;
  offset?: number;
};

export async function getAgentProfileDirectory(filters: AgentProfileDirectoryFilters = {}): Promise<AgentProfileDirectoryRow[]> {
  const { data, error } = await supabase.rpc('get_agent_profile_directory', {
    p_search: filters.search?.trim() || null,
    p_status: filters.status && filters.status !== 'all' ? filters.status : null,
    p_limit: filters.limit ?? 100,
    p_offset: filters.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as AgentProfileDirectoryRow[];
}

export async function updateAgentProfile(profileId: string, patch: Partial<Pick<AgentProfile, 'slug' | 'display_name' | 'bio' | 'avatar_url' | 'public_phone' | 'public_zalo' | 'status'>>, confirmSlugChange = false): Promise<AgentProfile> {
  const { data, error } = await supabase.rpc('update_agent_profile', {
    p_profile_id: profileId,
    p_patch: patch,
    p_confirm_slug_change: confirmSlugChange,
  });
  if (error) throw error;
  return data as AgentProfile;
}

export async function getAgentProfileAudit(profileId: string): Promise<AgentProfileAuditEvent[]> {
  const { data, error } = await supabase.rpc('get_agent_profile_audit', { p_profile_id: profileId });
  if (error) throw error;
  return (data ?? []) as AgentProfileAuditEvent[];
}

export type SaveAgentProfileInput = {
  slug: string;
  display_name: string;
  confirm_slug_change?: boolean;
  bio?: string | null;
  avatar_url?: string | null;
  public_zalo?: string | null;
};

export async function getMyAgentProfile(): Promise<AgentProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('agent_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data as AgentProfile | null;
}

export async function saveMyAgentProfile(input: SaveAgentProfileInput): Promise<AgentProfile> {
  const { data, error } = await supabase.rpc('save_my_agent_profile', {
    p_slug: input.slug,
    p_display_name: input.display_name,
    p_confirm_slug_change: input.confirm_slug_change ?? false,
    p_bio: input.bio ?? null,
    p_avatar_url: input.avatar_url ?? null,
    p_public_zalo: input.public_zalo ?? null,
    p_status: 'published',
  });
  if (error) throw error;
  return data as AgentProfile;
}

export async function saveMyProfileAndAgentProfile(input: {
  display_name: string;
  phone: string;
  slug: string;
  agent_display_name: string;
  confirm_slug_change?: boolean;
  bio?: string | null;
  public_zalo?: string | null;
}): Promise<AgentProfile> {
  const { data, error } = await supabase.rpc('save_my_profile_and_agent_profile', {
    p_display_name: input.display_name,
    p_phone: input.phone,
    p_slug: input.slug,
    p_agent_display_name: input.agent_display_name,
    p_confirm_slug_change: input.confirm_slug_change ?? false,
    p_bio: input.bio ?? null,
    p_public_zalo: input.public_zalo ?? null,
    p_status: 'published',
  });
  if (error) throw error;
  return data as AgentProfile;
}

export async function touchMyPresence(): Promise<void> {
  const { error } = await supabase.rpc('touch_my_presence');
  if (error) throw error;
}

export async function getPublicPropertyAgent(propertyId: string): Promise<PublicPropertyAgent | null> {
  const { data, error } = await supabase.rpc('public_get_property_agent', { p_property_id: propertyId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as PublicPropertyAgent | null;
}
