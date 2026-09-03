import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/lib/api/agentProfiles.ts'), 'utf8');

describe('agent profile API contract', () => {
  it('saves both public profile paths as published', () => {
    expect(source).toContain("supabase.rpc('save_my_agent_profile'");
    expect(source).toContain("supabase.rpc('save_my_profile_and_agent_profile'");
    expect(source.match(/p_status: 'published'/g)).toHaveLength(2);
  });

  it('keeps public property agent lookup on the gated RPC', () => {
    expect(source).toContain("supabase.rpc('public_get_property_agent'");
  });
});
