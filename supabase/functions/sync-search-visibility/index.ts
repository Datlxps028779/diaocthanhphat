// Edge Function: sync-search-visibility
// Auto-triggered by pg_cron mỗi 30 phút để refresh search_visibility_urls

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const syncSecret = Deno.env.get('SEARCH_VISIBILITY_SYNC_SECRET');
    if (!supabaseUrl || !supabaseKey || !syncSecret) {
      throw new Error('Missing Supabase runtime configuration');
    }

    // Create Supabase client with service_role for the internal sync boundary.
    const supabase = createClient(supabaseUrl, supabaseKey);
    void supabase;

    console.log('[sync-search-visibility] Starting eligibility sync...');

    // Call the production app's internal sync route using a dedicated secret.
    const apiUrl = 'https://chonhaviet.com/api/admin/search-visibility';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({ action: 'sync' }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API sync failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('[sync-search-visibility] ✅ Sync completed:', result);

    return new Response(
      JSON.stringify({ success: true, result }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[sync-search-visibility] ❌ Error:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
