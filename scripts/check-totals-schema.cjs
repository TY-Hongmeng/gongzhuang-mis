/**
 * 检查数据库结构 - 零件表和工装表的总额相关字段
 */

const { Client } = require('pg');

const dbConfig = {
  connectionString: 'postgresql://postgres.oltsiocyesbgezlrcxze:li18004499801@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
};

async function checkSchema() {
  const client = new Client(dbConfig);
  
  try {
    console.log('🔗 正在连接数据库...');
    await client.connect();
    console.log('✅ 数据库连接成功\n');
    
    console.log('='.repeat(70));
    console.log('📋 检查 tooling_info 表的总额相关字段');
    console.log('='.repeat(70));
    
    const toolingColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'tooling_info' 
      AND column_name IN ('material_total', 'process_total', 'totals_updated_at')
      ORDER BY ordinal_position
    `);
    
    console.table(toolingColumns.rows || []);
    
    // 检查实际数据
    const toolingData = await client.query(`
      SELECT id, inventory_number, material_total, process_total, totals_updated_at
      FROM tooling_info 
      WHERE material_total IS NOT NULL OR process_total IS NOT NULL
      LIMIT 5
    `);
    
    console.log('\n📊 tooling_info 实际数据示例:');
    if (toolingData.rows.length > 0) {
      console.table(toolingData.rows);
    } else {
      console.log('   ⚠️ 没有找到有总额数据的记录');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('📋 检查 parts_info (child_items) 表的加工金额相关字段');
    console.log('='.repeat(70));
    
    // 检查零件表
    for (const tableName of ['parts_info', 'child_items']) {
      try {
        const exists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = $1
          )
        `, [tableName]);
        
        if (!exists.rows[0].exists) {
          console.log(`\n❌ 表 ${tableName} 不存在`);
          continue;
        }
        
        const partColumns = await client.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_name = $1 
          AND column_name IN ('process_amount', 'amounts_updated_at', 'material_id', 'part_inventory_number', 'inventory_number', 'total_price', 'weight')
          ORDER BY ordinal_position
        `, [tableName]);
        
        console.log(`\n${tableName} 表的字段:`);
        if (partColumns.rows.length > 0) {
          console.table(partColumns.rows);
        } else {
          console.log('   ⚠️ 未找到相关字段');
        }
        
        // 检查实际数据
        const sampleData = await client.query(`
          SELECT id, 
                 COALESCE(part_inventory_number, inventory_number) as inv_no,
                 process_amount,
                 total_price,
                 weight,
                 material_id,
                 amounts_updated_at
          FROM ${tableName} 
          LIMIT 3
        `);
        
        if (sampleData.rows.length > 0) {
          console.log(`\n${tableName} 示例数据:`);
          console.table(sampleData.rows);
          
          // 统计
          const stats = await client.query(`
            SELECT 
              COUNT(*) as total,
              COUNT(process_amount) as has_process_amount,
              COUNT(CASE WHEN process_amount IS NOT NULL AND process_amount != 0 THEN 1 END) as has_nonzero_process,
              COUNT(total_price) as has_total_price,
              COUNT(weight) as has_weight
            FROM ${tableName}
          `);
          console.log(`\n${tableName} 统计:`);
          console.table(stats.rows);
        }
        
      } catch (err) {
        console.error(`\n查询 ${tableName} 失败:`, err.message);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ 检查完成');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 数据库连接已关闭\n');
  }
}

checkSchema().then(() => process.exit(0)).catch(err => {
  console.error('💥 异常:', err);
  process.exit(1);
});
