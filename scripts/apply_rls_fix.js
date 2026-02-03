import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 尝试加载根目录的 .env
// 优先尝试加载 .env.local，然后是 .env
const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envLocalPath)) {
    console.log(`Loading env from ${envLocalPath}`);
    dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
    console.log(`Loading env from ${envPath}`);
    dotenv.config({ path: envPath });
} else {
    console.warn('Warning: No .env or .env.local file found in root directory.');
}

const { Pool } = pg;

async function run() {
  if (!process.env.SUPABASE_DB_URL) {
    console.error('错误: 未找到 SUPABASE_DB_URL 环境变量。无法连接数据库。');
    console.error('请手动在 Supabase SQL Editor 中运行 supabase/migrations/20260203_disable_rls_orders.sql 的内容。');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const sqlPath = path.join(__dirname, '../supabase/migrations/20260203_disable_rls_orders.sql');
    if (!fs.existsSync(sqlPath)) {
        console.error(`Error: SQL file not found at ${sqlPath}`);
        process.exit(1);
    }
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('正在连接数据库并执行 SQL 脚本...');
    await pool.query(sql);
    console.log('--------------------------------------------------');
    console.log('✅ SQL 脚本执行成功！');
    console.log('已禁用以下表的 RLS：purchase_orders, manual_purchase_plans, backup_materials 等。');
    console.log('--------------------------------------------------');
  } catch (err) {
    console.error('❌ 执行失败:', err);
  } finally {
    await pool.end();
  }
}

run();
