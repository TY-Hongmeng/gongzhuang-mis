/**
 * 数据库迁移脚本: 添加 tooling_info 表的总额字段
 * 
 * 使用方法:
 *   npx tsx scripts/migrate-tooling-totals.ts
 *   或
 *   node scripts/migrate-tooling-totals.cjs (如果已预编译)
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

// 加载环境变量
config({ path: resolve(process.cwd(), '.env') });

const { Client } = pg;

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || '';

if (!SUPABASE_DB_URL) {
  console.error('❌ 错误: 未找到 SUPABASE_DB_URL 环境变量');
  console.error('请在 .env 文件中配置: SUPABASE_DB_URL=postgresql://...');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔗 正在连接数据库...');
    await client.connect();
    console.log('✅ 数据库连接成功');

    console.log('\n📋 开始执行迁移...');
    
    // 1. 添加 material_total 列
    console.log('\n1️⃣ 添加 material_total 列...');
    await client.query(`ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS material_total NUMERIC`);
    console.log('   ✅ material_total 列已就绪');

    // 2. 添加 process_total 列
    console.log('2️⃣ 添加 process_total 列...');
    await client.query(`ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS process_total NUMERIC`);
    console.log('   ✅ process_total 列已就绪');

    // 3. 添加 totals_updated_at 列
    console.log('3️⃣ 添加 totals_updated_at 列...');
    await client.query(`ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS totals_updated_at TIMESTAMPTZ`);
    console.log('   ✅ totals_updated_at 列已就绪');

    // 4. 添加注释
    console.log('4️⃣ 添加列注释...');
    await client.query(`COMMENT ON COLUMN tooling_info.material_total IS '材料总额 - 由系统根据零件自动计算'`);
    await client.query(`COMMENT ON COLUMN tooling_info.process_total IS '加工总额 - 由系统根据零件加工费自动计算'`);
    await client.query(`COMMENT ON COLUMN tooling_info.totals_updated_at IS '总额最后更新时间'`);
    console.log('   ✅ 注释添加完成');

    // 5. 验证列是否创建成功
    console.log('\n5️⃣ 验证列是否创建成功...');
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'tooling_info' 
      AND column_name IN ('material_total', 'process_total', 'totals_updated_at')
      ORDER BY ordinal_position
    `);

    if (result.rows.length === 3) {
      console.log('\n✅✅✅ 迁移成功！所有列已创建：\n');
      console.table(result.rows, ['column_name', 'data_type', 'is_nullable']);
    } else {
      console.warn('\n⚠️ 警告: 只创建了部分列，请检查数据库权限');
      console.table(result.rows || []);
    }

    // 6. 显示当前表的总行数（可选）
    const countResult = await client.query(`SELECT COUNT(*) FROM tooling_info`);
    console.log(`\n📊 tooling_info 表当前总行数: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    
    if (error.code === '42501') {
      console.error('\n🔒 权限不足！当前用户没有 ALTER TABLE 权限。');
      console.error('解决方案:');
      console.error('1. 使用 Supabase Dashboard → SQL Editor 执行迁移');
      console.error('2. 或者联系数据库管理员授予 DDL 权限');
    }
    
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 数据库连接已关闭');
  }
}

// 执行迁移
console.log('='.repeat(60));
console.log('🚀 工装制造管理系统 - 数据库迁移工具');
console.log('📝 迁移内容: 添加 tooling_info 表的总额字段');
console.log('⏰ 时间:', new Date().toLocaleString('zh-CN'));
console.log('='.repeat(60));

runMigration()
  .then(() => {
    console.log('\n🎉 迁移完成！');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 未预期的错误:', err);
    process.exit(1);
  });
