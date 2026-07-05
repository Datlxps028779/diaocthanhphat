#!/usr/bin/env node
/**
 * Script áp dụng fix lỗi PGRST204 - focus_keywords column missing
 *
 * Cách dùng:
 *   1. Đảm bảo có DATABASE_URL trong file .env
 *      Format: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
 *   2. Chạy: node scripts/fix-focus-keywords.js
 *
 * Hoặc cách thủ công:
 *   - Copy nội dung file supabase/fix_focus_keywords.sql
 *   - Dán vào Supabase Dashboard → SQL Editor → Run
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

const migrationPath = path.join(__dirname, '..', 'supabase', 'fix_focus_keywords.sql');
const sql = fs.readFileSync(migrationPath, 'utf-8');

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;

  if (!connectionString) {
    console.error('❌ Vui lòng thiết lập DATABASE_URL trong .env');
    console.error('📍 Định dạng: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres');
    console.error('🔑 Lấy connection string tại: Supabase Dashboard > Settings > Database');
    console.error('');
    console.error('💡 Hoặc chạy thủ công:');
    console.error('   Copy nội dung file supabase/fix_focus_keywords.sql');
    console.error('   Dán vào Supabase Dashboard → SQL Editor → Run');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    console.log('🔌 Đang kết nối tới database...');
    await client.connect();
    console.log('✅ Kết nối thành công!');

    console.log('🚀 Đang áp dụng fix focus_keywords (lỗi PGRST204)...');
    await client.query(sql);
    console.log('✅ Fix hoàn thành! Cột focus_keywords và schema_markup đã được thêm.');
    console.log('✅ PostgREST schema cache đã được reload.');

    // Verify
    console.log('\n📊 Kiểm tra kết quả:');
    const { rows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'properties'
        AND column_name IN ('focus_keywords', 'schema_markup', 'meta_title', 'meta_description')
      ORDER BY column_name;
    `);
    console.table(rows);

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();