// Chuyển các file JSON đã export (/tmp/db_export/*.json) thành 1 file SQL restore.
// Dùng cho di trú Supabase: chạy sau khi đã dựng schema (setup_complete.sql).
// INSERT ... ON CONFLICT (id) DO NOTHING để chạy lại an toàn (idempotent).
const fs = require('fs');
const DIR = '/tmp/db_export';
const OUT = '/tmp/db_export/restore_data.sql';

// Thứ tự tôn trọng khóa ngoại: cha trước, con sau.
const ORDER = [
  'areas', 'property_types', 'districts',
  'properties', 'news',
  'site_settings', 'banners', 'testimonials', 'featured_sections',
  'managed_pages', 'page_blocks',
];

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    // Cột mảng trong schema là text[] (images, amenities, tags) → literal Postgres array.
    if (v.length === 0) return `ARRAY[]::text[]`;
    return `ARRAY[${v.map(e => `'${String(e).replace(/'/g, "''")}'`).join(', ')}]::text[]`;
  }
  if (typeof v === 'object') {
    // Object → jsonb (schema_markup, settings).
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

let out = [
  '-- =============================================================================',
  '-- RESTORE DATA — sinh tự động từ export project cũ (anon key)',
  '-- Chạy SAU khi đã dựng schema (setup_complete.sql) trên project MỚI.',
  '-- Idempotent: ON CONFLICT (id) DO NOTHING.',
  '-- =============================================================================',
  'BEGIN;',
  '',
  '-- Xoá seed mặc định (setup_complete.sql seed sẵn) để dữ liệu THẬT thay thế sạch,',
  '-- tránh đụng ràng buộc UNIQUE (site_settings.key, managed_pages.slug...).',
  '-- CASCADE an toàn vì project mới chỉ có seed; KHÔNG đụng profiles/projects.',
  `TRUNCATE ${ORDER.join(', ')} RESTART IDENTITY CASCADE;`,
  '',
];

let summary = [];
for (const table of ORDER) {
  const path = `${DIR}/${table}.json`;
  if (!fs.existsSync(path)) { summary.push(`${table}: (không có file, bỏ qua)`); continue; }
  let rows;
  try { rows = JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch { summary.push(`${table}: (JSON lỗi, bỏ qua)`); continue; }
  if (!Array.isArray(rows) || rows.length === 0) { summary.push(`${table}: 0 dòng`); continue; }

  out.push(`-- ${table} (${rows.length} dòng)`);
  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = cols.map(c => sqlVal(row[c]));
    out.push(
      `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) ` +
      `VALUES (${vals.join(', ')}) ON CONFLICT (id) DO NOTHING;`
    );
  }
  out.push('');
  summary.push(`${table}: ${rows.length} dòng`);
}

out.push('COMMIT;');
out.push('');
out.push("-- Nạp lại cache schema của PostgREST (sau DROP SCHEMA ở Phase A, REST API");
out.push("-- cần reload để app đọc được bảng/cột — nếu không sẽ 404 giả).");
out.push("NOTIFY pgrst, 'reload schema';");
fs.writeFileSync(OUT, out.join('\n'), 'utf8');
console.log('=== Đã sinh:', OUT, '===');
console.log(summary.join('\n'));
