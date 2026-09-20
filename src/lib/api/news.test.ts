import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

const { supabase } = await import('../supabase');
const { incrementNewsView } = await import('./news');

describe('incrementNewsView', () => {
  it('uses only the privileged atomic RPC and never falls back to anon UPDATE', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { message: 'permission denied', name: 'PostgrestError', details: '', hint: '', code: '42501' },
    } as never);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null,
    } as never);
    const from = vi.spyOn(supabase, 'from');
    try {
      await incrementNewsView('news-1');
      expect(rpc).toHaveBeenCalledWith('increment_news_views', { row_id: 'news-1' });
      expect(from).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
