import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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
    console.log('开始测试手动计划表 (manual_purchase_plans) 的插入权限...');

    const testItem = {
      part_name: '测试零件_RollbackTest',
      unit: '件',
      project_name: '测试项目',
      applicant: '系统测试',
      created_date: new Date().toISOString().split('T')[0],
      status: 'draft'
    };

    const res = await pool.query(`
      INSERT INTO manual_purchase_plans (part_name, unit, project_name, applicant, created_date, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [testItem.part_name, testItem.unit, testItem.project_name, testItem.applicant, testItem.created_date, testItem.status]);

    console.log('插入成功！返回数据:', res.rows[0]);

    // 清理测试数据
    await pool.query('DELETE FROM manual_purchase_plans WHERE id = $1', [res.rows[0].id]);
    console.log('测试数据已清理。');

  } catch (err) {
    console.error('❌ 插入失败:', err);
  } finally {
    await pool.end();
  }
}

run();
