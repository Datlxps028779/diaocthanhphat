import { supabase, type AgentProfile, type AgentProfileStatus, type PublicPropertyAgent } from '../supabase';

export type SaveAgentProfileInput = {
  slug: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  public_phone?: string | null;
  public_zalo?: string | null;
  status: AgentProfileStatus;
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
    p_bio: input.bio ?? null,
    p_avatar_url: input.avatar_url ?? null,
    p_public_phone: input.public_phone ?? null,
    p_public_zalo: input.public_zalo ?? null,
    p_status: input.status,
  });
  if (error) throw error;
  return data as AgentProfile;
}

export async function saveMyProfileAndAgentProfile(input: {
  display_name: string;
  phone: string;
  slug: string;
  agent_display_name: string;
  bio?: string | null;
  public_phone?: string | null;
  public_zalo?: string | null;
  status: AgentProfileStatus;
}): Promise<AgentProfile> {
  const { data, error } = await supabase.rpc('save_my_profile_and_agent_profile', {
    p_display_name: input.display_name,
    p_phone: input.phone,
    p_slug: input.slug,
    p_agent_display_name: input.agent_display_name,
    p_bio: input.bio ?? null,
    p_public_phone: input.public_phone ?? null,
    p_public_zalo: input.public_zalo ?? null,
    p_status: input.status,
  });
  if (error) throw error;
  return data as AgentProfile;
}

export async function getPublicPropertyAgent(propertyId: string): Promise<PublicPropertyAgent | null> {
  const { data, error } = await supabase.rpc('public_get_property_agent', { p_property_id: propertyId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as PublicPropertyAgent | null;
}
