// Script chạy migrations SQL lên Supabase Database
// Cách dùng: node scripts/run-migrations.js

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Đọc file .env để lấy thông tin
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;

// Lưu ý: Cần SERVICE_ROLE_KEY để chạy DDL commands
// Bạn cần thêm VITE_SUPABASE_SERVICE_ROLE_KEY vào .env
const serviceRoleKey = envVars.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env');
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error('❌ Thiếu VITE_SUPABASE_SERVICE_ROLE_KEY trong .env');
  console.error('🔑 Bạn cần thêm Service Role Key vào .env để chạy migrations');
  console.error('📍 Lấy tại: Supabase Dashboard > Settings > API > service_role key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Đọc file migration
const migrationPath = path.join(__dirname, '..', 'supabase', 'all_in_one_migration.sql');
const sql = fs.readFileSync(migrationPath, 'utf-8');

console.log('🚀 Đang chạy migrations từ all_in_one_migration.sql...');

// Chia SQL thành các câu lệnh riêng biệt
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

async function runMigrations() {
  let success = 0;
  let failed = 0;
  
  for (const statement of statements) {
    try {
      // Bỏ qua các câu lệnh rỗng
      if (!statement.trim()) continue;
      
      console.log(`📝 Chạy: ${statement.substring(0, 50)}...`);
      const { error } = await supabase.rpc('sql', { query: statement + ';' }).single();
      
      // Nhiều RPC không có sẵn, thử cách khác
      // Thực tế cần dùng pg REST API hoặc direct connection
    } catch (err) {
      // Thử phương pháp khác
    }
  }
}

// Phương pháp thay thế: Sử dụng fetch tới Postgres REST endpoint
async function runViaRest() {
  console.log('🔄 Đang chuyển sang phương pháp REST API...');
  
  // PostgreSQL connection string thường có dạng:
  // postgresql://postgres:[password]@[host]:[port]/[database]
  const dbUrl = process.env.DATABASE_URL || envVars.DATABASE_URL;
  
  if (dbUrl) {
    console.log('📍 Sử dụng DATABASE_URL từ môi trường');
    // Cần thư viện pg hoặc sử dụng Supabase CLI
  }
  
  console.log('⚠️  Khuyến nghị: Sử dụng Supabase CLI để chạy migrations');
  console.log('   supabase db push < supabase/all_in_one_migration.sql');
  console.log('   Hoặc copy-paste SQL vào Supabase SQL Editor');
}

runViaRest();