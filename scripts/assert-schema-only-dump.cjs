const fs = require('node:fs');
const path = process.argv[2];
if (!path || !fs.existsSync(path)) {
  console.error('[schema-only-guard] Dump file not found.');
  process.exit(2);
}

const violations = [];
let dollarTag = null;
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (dollarTag) {
    if (line.includes(dollarTag)) dollarTag = null;
    continue;
  }

  const tagMatch = line.match(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/);
  if (tagMatch) {
    const tag = tagMatch[0];
    const first = line.indexOf(tag);
    const second = line.indexOf(tag, first + tag.length);
    if (second === -1) dollarTag = tag;
    continue;
  }

  const statement = line.match(/^\s*(COPY|INSERT\s+INTO)\s+public\.([^\s(;]+)/i);
  if (statement) violations.push({ line: index + 1, operation: statement[1].toUpperCase(), table: statement[2] });
}

if (violations.length > 0) {
  console.error('[schema-only-guard] BLOCKED: top-level public table data statements found.');
  for (const violation of violations.slice(0, 20)) {
    console.error(`  line ${violation.line}: ${violation.operation} public.${violation.table}`);
  }
  process.exit(2);
}

console.log('[schema-only-guard] PASS: no top-level INSERT/COPY data statements.');
