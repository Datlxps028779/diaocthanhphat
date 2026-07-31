import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

export type PrivateAccess = {
  authenticated: boolean;
  owner: boolean;
  ownerMfa: boolean;
  staff: boolean;
};

function isTrue(value: unknown): boolean {
  return value === true;
}

export async function getPrivateAccess(): Promise<PrivateAccess> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { authenticated: false, owner: false, ownerMfa: false, staff: false };
  }

  const cookieStore = cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => undefined,
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { authenticated: false, owner: false, ownerMfa: false, staff: false };

  const [{ data: owner }, { data: ownerMfa }, { data: staff }] = await Promise.all([
    supabase.rpc('is_owner'),
    supabase.rpc('is_owner_mfa'),
    supabase.rpc('is_admin_or_staff'),
  ]);

  return {
    authenticated: true,
    owner: isTrue(owner),
    ownerMfa: isTrue(ownerMfa),
    staff: isTrue(staff),
  };
}
