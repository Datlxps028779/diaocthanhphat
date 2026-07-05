// Script chạy migrations sử dụng Database Connection
// Yêu cầu: Đặt DATABASE_URL trong .env hoặc export
// Format: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

// Load .env
config();

const migrationPath = path.join(process.cwd(), 'supabase', 'all_in_one_migration.sql');
const sql = fs.readFileSync(migrationPath, 'utf-8');

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ Vui lòng thiết lập DATABASE_URL trong .env');
    console.error('📍 Định dạng: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres');
    console.error('🔑 Lấy connection string tại: Supabase Dashboard > Settings > Database');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  
  try {
    console.log('🔌 Đang kết nối tới database...');
    await client.connect();
    console.log('✅ Kết nối thành công!');
    
    console.log('🚀 Đang thực thi migrations...');
    await client.query(sql);
    console.log('✅ Migrations hoàn thành!');
    
  } catch (err) {
    console.error('❌ Lỗi migrations:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();