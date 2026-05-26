/**
 * 数据库迁移: 添加 tooling_info 表的总额字段
 * 直接运行: node scripts/run-migration.js
 */

const { Client } = require('pg');

const dbConfig = {
  connectionString: 'postgresql://postgres.oltsiocyesbgezlrcxze:li18004499801@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
};

async function runMigration() {
  const client = new Client(dbConfig);
  
  try {
    console.log('🔗 正在连接数据库...');
    await client.connect();
    console.log('✅ 数据库连接成功\n');
    
    console.log('='.repeat(60));
    console.log('🚀 开始执行数据库迁移...');
    console.log('📝 目标: 为 tooling_info 表添加总额字段');
    console.log('⏰', new Date().toLocaleString('zh-CN'));
    console.log('='.repeat(60) + '\n');
    
    // 1. 添加 material_total 列
    console.log('1️⃣  添加 material_total 列 (NUMERIC)...');
    await client.query(`ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS material_total NUMERIC`);
    console.log('    ✅ 完成\n');
    
    // 2. 添加 process_total 列
    console.log('2️⃣  添加 process_total 列 (NUMERIC)...');
    await client.query(`ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS process_total NUMERIC`);
    console.log('    ✅ 完成\n');
    
    // 3. 添加 totals_updated_at 列
    console.log('3️⃣  添加 totals_updated_at 列 (TIMESTAMPTZ)...');
    await client.query(`ALTER TABLE tooling_info ADD COLUMN IF NOT EXISTS totals_updated_at TIMESTAMPTZ`);
    console.log('    ✅ 完成\n');
    
    // 4. 添加注释
    console.log('4️⃣  添加列注释...');
    await client.query(`COMMENT ON COLUMN tooling_info.material_total IS '材料总额 - 由系统根据零件自动计算'`);
    await client.query(`COMMENT ON COLUMN tooling_info.process_total IS '加工总额 - 由系统根据零件加工费自动计算'`);
    await client.query(`COMMENT ON COLUMN tooling_info.totals_updated_at IS '总额最后更新时间'`);
    console.log('    ✅ 完成\n');
    
    // 5. 验证
    console.log('5️⃣  验证列是否创建成功...');
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
      console.warn('\n⚠️  警告: 只创建了部分列');
      console.table(result.rows || []);
    }
    
    // 6. 显示表信息
    const countResult = await client.query(`SELECT COUNT(*) as total FROM tooling_info`);
    console.log(`\n📊 tooling_info 表总行数: ${countResult.rows[0].total}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 数据库迁移完成！');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    
    if (error.code === '42501') {
      console.error('\n🔒 权限不足错误:');
      console.error('   当前数据库用户没有 ALTER TABLE 权限');
      console.error('\n   解决方案:');
      console.error('   1. 在 Supabase Dashboard → SQL Editor 中手动执行 SQL');
      console.error('   2. 或联系数据库管理员授予 DDL 权限');
    }
    
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 数据库连接已关闭\n');
  }
}

// 执行
runMigration().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('💥 未预期错误:', err);
  process.exit(1);
});
