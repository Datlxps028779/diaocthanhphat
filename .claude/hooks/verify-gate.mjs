#!/usr/bin/env node
// Cổng cưỡng chế verify — chặn commit/push khi code chưa được kiểm.
//
// Vì sao tồn tại: đã có lần push khi mới verify trang công khai mà chưa verify
// admin, và có lần verify xong rồi sửa thêm code vẫn push. Nhắc bằng văn bản
// không đủ — agent phớt lờ được. Cổng này chặn bằng exit code 2.
//
// Cách hoạt động: `record` chạy typecheck + test rồi ghi biên nhận kèm digest
// nội dung mã nguồn. `guard` (hook PreToolUse) tính lại digest; lệch một byte
// là biên nhận vô hiệu. Nhờ vậy sửa code sau khi verify sẽ tự mất hiệu lực,
// không cần cơ chế xoá riêng.
//
// Dùng:
//   node .claude/hooks/verify-gate.mjs record   # sau khi verify runtime xong
//   node .claude/hooks/verify-gate.mjs guard    # hook, đọc JSON từ stdin
//
// Gỡ khi cổng lỗi: xoá .claude/.verify-receipt.json rồi chạy lại `record`.

import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const RECEIPT = join(ROOT, '.claude', '.verify-receipt.json');
const WATCHED = ['src', 'app', 'supabase/migrations', 'middleware.ts', 'next.config.js', 'vercel.json'];

// Digest gồm cả file chưa add (-o) vì code mới thường chưa vào index lúc verify.
function sourceDigest() {
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', ...WATCHED], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  }).split('\n').filter(Boolean).sort();
  const h = createHash('sha256');
  for (const rel of listed) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue; // file vừa bị xoá, git chưa kịp cập nhật
    h.update(rel).update('\0').update(readFileSync(abs)).update('\0');
  }
  return { digest: h.digest('hex'), fileCount: listed.length };
}

function run(label, cmd, args) {
  process.stderr.write(`[verify-gate] ${label}...\n`);
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return null;
  } catch (e) {
    return `${label} THẤT BẠI:\n${(e.stdout || '') + (e.stderr || '')}`.slice(0, 4000);
  }
}

function record() {
  const runtimeNote = process.argv.slice(3).join(' ').trim();
  if (!runtimeNote) {
    process.stderr.write(
      'Thiếu ghi chú verify runtime. Cú pháp:\n' +
      '  node .claude/hooks/verify-gate.mjs record "<đã kiểm gì bằng browser thật>"\n' +
      'Ghi chú phải nêu cụ thể trang/luồng đã mở và kết quả đo được, ' +
      'hoặc nói rõ phần nào KHÔNG kiểm được bằng runtime.\n');
    process.exit(1);
  }
  const failures = [
    run('typecheck', 'npx', ['tsc', '--noEmit']),
    run('test', 'npx', ['vitest', 'run', '--reporter=dot']),
  ].filter(Boolean);
  if (failures.length) {
    process.stderr.write(failures.join('\n\n') + '\n');
    process.exit(1);
  }
  const { digest, fileCount } = sourceDigest();
  writeFileSync(RECEIPT, JSON.stringify({
    digest, fileCount, runtimeNote,
    recordedAt: new Date().toISOString(),
    checks: ['typecheck', 'vitest'],
  }, null, 2) + '\n');
  process.stderr.write(`[verify-gate] Đã ghi biên nhận (${fileCount} file).\n`);
}

// Neo vào đầu câu lệnh hoặc sau dấu ngăn shell, để `grep "git push" docs/` không
// bị chặn oan trong khi `cd x && git push` vẫn bị bắt.
const STMT = String.raw`(?:^|[;&|]\s*|\n\s*|\$\(\s*|\`\s*)`;
const GIT_WRITE = new RegExp(STMT + String.raw`git\s+(?:-\S+\s+|--\S+\s+)*(?:commit|push)\b`);
const DEV_SERVER = new RegExp(STMT + String.raw`(?:next\s+dev|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?dev)\b`);

function guard() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* stdin rỗng */ }
  const cmd = payload?.tool_input?.command ?? '';
  if (!cmd) process.exit(0);

  // Bản build production để lại .next/BUILD_ID; chạy dev trên đó làm CSS/JS 404
  // và giao diện local vỡ — đã xảy ra một lần.
  if (DEV_SERVER.test(cmd) && existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
    process.stderr.write(
      'CHẶN: .next đang là bản build production (có BUILD_ID). Chạy dev lên đó sẽ ' +
      'làm giao diện local vỡ vì CSS/JS 404.\nXin phép người dùng xoá .next trước, ' +
      'rồi chạy lại.\n');
    process.exit(2);
  }

  if (!GIT_WRITE.test(cmd)) process.exit(0);

  if (!existsSync(RECEIPT)) {
    process.stderr.write(
      'CHẶN: chưa có biên nhận verify. Chạy typecheck + test + verify runtime bằng ' +
      'browser thật, rồi:\n  node .claude/hooks/verify-gate.mjs record "<đã kiểm gì>"\n');
    process.exit(2);
  }
  let receipt;
  try { receipt = JSON.parse(readFileSync(RECEIPT, 'utf8')); }
  catch { process.stderr.write('CHẶN: biên nhận verify hỏng. Xoá .claude/.verify-receipt.json và chạy lại record.\n'); process.exit(2); }

  const { digest } = sourceDigest();
  if (digest !== receipt.digest) {
    process.stderr.write(
      'CHẶN: mã nguồn đã đổi sau lần verify gần nhất — biên nhận không còn hiệu lực.\n' +
      `Biên nhận lúc ${receipt.recordedAt}: "${receipt.runtimeNote}"\n` +
      'Verify lại (typecheck + test + runtime) rồi chạy record.\n');
    process.exit(2);
  }
  process.stderr.write(`[verify-gate] OK — verify lúc ${receipt.recordedAt}: ${receipt.runtimeNote}\n`);
}

const mode = process.argv[2];
if (mode === 'record') record();
else if (mode === 'guard') guard();
else { process.stderr.write('Dùng: verify-gate.mjs record "<ghi chú>" | guard\n'); process.exit(1); }
