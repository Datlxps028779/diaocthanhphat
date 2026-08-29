import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const edgeSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-reco/index.ts'),
  'utf8',
);
const forYouSource = readFileSync(
  resolve(process.cwd(), 'src/components/ForYou.tsx'),
  'utf8',
);

describe('AI recommendation price guard', () => {
  it('không gửi hoặc prompt giá khi price personalization chưa chuẩn hóa', () => {
    expect(forYouSource).not.toMatch(/priceLabel:\s*formatPropertyPrice/);
    expect(forYouSource).not.toMatch(/price:\s*p\.price/);
    expect(edgeSource).not.toContain('Khoảng giá điển hình');
    expect(edgeSource).not.toContain('| giá:');
    expect(edgeSource).not.toMatch(/price(Min|Max|Label)/);
  });
});
