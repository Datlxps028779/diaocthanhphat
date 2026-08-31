import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const functionSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-chat/index.ts'),
  'utf8',
);

describe('ai-chat evidence safety contract', () => {
  it('normalizes citations to HTTP(S) source URLs only', () => {
    expect(functionSource).toContain('isSafeHttpUrl(c.source_url) ? c.source_url : null');
    expect(functionSource).toContain('url.protocol === "http:" || url.protocol === "https:"');
  });

  it('does not expose internal exception messages to the public endpoint', () => {
    expect(functionSource).toContain('error: "internal_error"');
    expect(functionSource).not.toContain('(err as Error).message');
  });
});
