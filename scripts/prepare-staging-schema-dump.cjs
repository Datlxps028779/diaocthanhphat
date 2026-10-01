const fs = require('node:fs');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('[schema-prepare] Dump file not found.');
  process.exit(2);
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
let removed = 0;
const output = lines.filter(line => {
  if (/^CREATE SCHEMA public;\s*$/.test(line)) {
    removed += 1;
    return false;
  }
  return true;
});
fs.writeFileSync(file, output.join('\n'));
console.log(`[schema-prepare] Removed ${removed} redundant CREATE SCHEMA public statement(s).`);
