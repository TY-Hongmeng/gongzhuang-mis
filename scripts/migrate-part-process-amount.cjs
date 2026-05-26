/**
 * 数据库迁移: 添加零件表的加工金额字段
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
    
    console.log('='.repeat(70));
    console.log('🚀 开始执行零件表迁移...');
    console.log('⏰', new Date().toLocaleString('zh-CN'));
    console.log('='.repeat(70) + '\n');
    
    // 1. 为 parts_info 添加列
    console.log('1️⃣  为 parts_info 表添加 process_amount 列...');
    await client.query(`ALTER TABLE parts_info ADD COLUMN IF NOT EXISTS process_amount NUMERIC`);
    console.log('    ✅ 完成\n');
    
    console.log('2️⃣  为 parts_info 表添加 amounts_updated_at 列...');
    await client.query(`ALTER TABLE parts_info ADD COLUMN IF NOT EXISTS amounts_updated_at TIMESTAMPTZ`);
    console.log('    ✅ 完成\n');
    
    // 2. 为 child_items 添加列
    console.log('3️⃣  为 child_items 表添加 process_amount 列...');
    try {
      await client.query(`ALTER TABLE child_items ADD COLUMN IF NOT EXISTS process_amount NUMERIC`);
      console.log('    ✅ 完成\n');
    } catch (err) {
      if (err.message.includes('does not exist')) {
        console.log('    ⚠️ child_items 表不存在，跳过\n');
      } else {
        throw err;
      }
    }
    
    // 3. 添加注释
    console.log('4️⃣  添加列注释...');
    try {
      await client.query(`COMMENT ON COLUMN parts_info.process_amount IS '加工金额 - 由系统根据工时自动计算或手动输入'`);
      await client.query(`COMMENT ON COLUMN parts_info.amounts_updated_at IS '金额最后更新时间'`);
      console.log('    ✅ parts_info 注释添加完成\n');
    } catch (e) {
      console.log('    ⚠️ 注释添加失败（可忽略）\n');
    }
    
    // 4. 验证
    console.log('5️⃣  验证列是否创建成功...\n');
    
    for (const tableName of ['parts_info', 'child_items']) {
      try {
        const result = await client.query(`
          SELECT column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_name = $1 
          AND column_name IN ('process_amount', 'amounts_updated_at')
          ORDER BY ordinal_position
        `, [tableName]);
        
        if (result.rows.length > 0) {
          console.log(`${tableName} 表:`);
          console.table(result.rows);
          
          // 统计数据量
          const countResult = await client.query(`SELECT COUNT(*) as total FROM ${tableName}`);
          console.log(`  总行数: ${countResult.rows[0].total}\n`);
        } else {
          console.log(`${tableName}: 无匹配字段\n`);
        }
      } catch (err) {
        if (!err.message.includes('does not exist')) {
          console.error(`${tableName} 查询失败:`, err.message);
        }
      }
    }
    
    console.log('='.repeat(70));
    console.log('🎉 数据库迁移完成！');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 数据库连接已关闭\n');
  }
}

runMigration().then(() => process.exit(0)).catch(err => {
  console.error('💥 异常:', err);
  process.exit(1);
});
