import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

const { Pool } = pg;

async function run() {
  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('数据库中的表：');
    res.rows.forEach(row => console.log(`- ${row.table_name}`));
  } catch (err) {
    console.error('获取表列表失败:', err);
  } finally {
    await pool.end();
  }
}

run();
