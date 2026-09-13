import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const functionSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-chat/index.ts'),
  'utf8',
);

describe('ai-chat evidence safety contract', () => {
  it('keeps RAG deferred out of the public AIO runtime', () => {
    expect(functionSource).not.toContain('match_rag_chunks');
    expect(functionSource).not.toContain('RagMatch');
    expect(functionSource).toContain('const citations:');
    expect(functionSource).toContain('Citation listing được tạo ở lớp live search');
  });

  it('does not expose internal exception messages to the public endpoint', () => {
    expect(functionSource).toContain('error: "internal_error"');
    expect(functionSource).not.toContain('(err as Error).message');
  });
});
