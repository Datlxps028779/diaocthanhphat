// Self-test cho cổng verify. Chạy: node .claude/hooks/verify-gate.selftest.mjs
// Không nhúng mẫu lệnh vào chuỗi bash gọi script này — cổng sẽ bắt chính nó.
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';

const GATE = '.claude/hooks/verify-gate.mjs';
const RECEIPT = '.claude/.verify-receipt.json';
const PARKED = '.claude/.verify-receipt.selftest-bak';

function guard(command) {
  const r = spawnSync('node', [GATE, 'guard'], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  return r.status;
}

const G = 'g' + 'it';           // tách chuỗi để cổng không bắt chính file test
const PUSH = `${G} pu` + 'sh';
const COMMIT = `${G} com` + 'mit';

const cases = [
  [`${PUSH} origin main`, 2, 'push trực tiếp'],
  [`${COMMIT} -m x`, 2, 'commit trực tiếp'],
  [`cd . && ${PUSH}`, 2, 'sau dấu &&'],
  [`echo hi; ${PUSH}`, 2, 'sau dấu ;'],
  [`${G} lo` + 'g --oneline -5', 0, `${G} log — không được chặn`],
  [`${G} sta` + 'tus', 0, `${G} status — không được chặn`],
  [`gr` + `ep -rn "${PUSH}" docs/`, 0, 'grep chứa chữ — không được chặn'],
  [`echo "cách viết ${COMMIT}"`, 0, 'echo chứa chữ — không được chặn'],
  ['npm test', 0, 'npm test — không được chặn'],
];

// Kiểm ở trạng thái KHÔNG có biên nhận: mọi lệnh ghi git phải bị chặn.
const had = existsSync(RECEIPT);
if (had) renameSync(RECEIPT, PARKED);

let fails = 0;
console.log('— Không có biên nhận —');
for (const [cmd, want, label] of cases) {
  const got = guard(cmd);
  const ok = got === want;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (mong ${want}, được ${got})`);
}

if (had) {
  renameSync(PARKED, RECEIPT);
  console.log('\n— Có biên nhận hợp lệ —');
  for (const [cmd, , label] of cases.filter(c => c[1] === 2)) {
    const got = guard(cmd);
    const ok = got === 0;
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} phải QUA  (được ${got})`);
  }
}

console.log(fails === 0 ? '\nTất cả PASS' : `\n${fails} trường hợp SAI`);
process.exit(fails === 0 ? 0 : 1);
