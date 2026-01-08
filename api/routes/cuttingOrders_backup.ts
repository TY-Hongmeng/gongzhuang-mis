import express from 'express';
import { supabase } from '../lib/supabase.js';

// 连接池配置 - 延迟初始化，确保模块正确加载
let pool: any = null;

// 预初始化连接池，避免首次请求延迟
async function initializePool() {
  try {
    console.log('[CuttingOrders] Pre-initializing database connection pool...');
    console.log('[CuttingOrders] SUPABASE_DB_URL:', process.env.SUPABASE_DB_URL ? 'Present' : 'Missing');
    
    if (!process.env.SUPABASE_DB_URL) {
      console.warn('[CuttingOrders] SUPABASE_DB_URL is not configured, skipping pool initialization');
      return;
    }
    
    const pg = await import('pg');
    const Pool = pg.Pool || (pg as any).default?.Pool;
    
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 10, // 增加最大连接数
      idleTimeoutMillis: 30000, // 增加空闲超时
      connectionTimeoutMillis: 10000, // 增加连接超时到10秒
      acquireTimeoutMillis: 10000, // 增加获取连接超时
      statement_timeout: 30000, // SQL语句超时30秒
    });
    
    pool.on('connect', () => {
      console.log('[CuttingOrders] Database pool: new client connected');
    });
    
    pool.on('error', (err) => {
      console.error('[CuttingOrders] Database pool error:', err);
    });
    
    // 测试连接
    await pool.query('SELECT 1');
    console.log('[CuttingOrders] Database connection pool pre-initialized successfully');
  } catch (error) {
    console.error('[CuttingOrders] Failed to pre-initialize pool:', error);
    // 不抛出错误，让应用在运行时处理
  }
}

// 获取数据库连接池
async function getPool() {
  if (!pool) {
    console.log('[CuttingOrders] Pool not initialized, initializing now...');
    await initializePool();
  }
  return pool;
}

// 直接数据库查询函数（使用连接池）
async function queryDatabase(sql: string, params?: any[], retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const pool = await getPool();
      console.log(`[CuttingOrders] Executing query (attempt ${attempt}/${retries})`);
      const result = await pool.query(sql, params);
      console.log(`[CuttingOrders] Query executed successfully`);
      return result;
    } catch (error) {
      console.error(`[CuttingOrders] Query attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        console.error('[CuttingOrders] All retry attempts exhausted');
        throw error;
      }
      
      // 等待一段时间后重试
      const waitTime = attempt * 1000; // 递增等待时间
      console.log(`[CuttingOrders] Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

const router = express.Router();

// 预初始化连接池当模块加载时
setTimeout(() => {
  console.log('[CuttingOrders] Scheduling pool pre-initialization...');
  initializePool().catch(err => {
    console.error('[CuttingOrders] Pool pre-initialization failed:', err);
  });
}, 1000); // 延迟1秒执行，确保环境变量已加载

// GET /api/cutting-orders
// 获取下料单列表，支持分页、筛选和排序 - 使用Supabase客户端优化性能
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const {
      page = '1',
      pageSize = '20',
      material_source,
      start_date,
      end_date,
      search,
      sortField = 'created_date',
      sortOrder = 'desc'
    } = req.query as Record<string, string>;

    console.log(`[CuttingOrders] Request started at ${new Date().toISOString()}`);

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.max(parseInt(pageSize, 10) || 20, 1);  // 移除100条限制，允许获取所有数据
    const from = (pageNum - 1) * sizeNum;
    const to = from + sizeNum - 1;
    
    console.log(`[CuttingOrders] Pagination calculation:`, {
      page: pageNum,
      pageSize: sizeNum,
      from: from,
      to: to,
      calculatedRange: `${from}-${to}`
    });

    // 使用Supabase客户端进行查询，性能更好
    let query = supabase
      .from('cutting_orders')
      .select('*', { count: 'planned' }); // 使用估算计数提高性能

    // 搜索功能 - 多字段OR查询
    if (search && search.trim()) {
      const keyword = `%${search.trim()}%`;
      query = query.or(`inventory_number.ilike.${keyword},project_name.ilike.${keyword},part_drawing_number.ilike.${keyword},part_name.ilike.${keyword}`);
    }

    // 筛选条件
    if (material_source) {
      query = query.eq('material_source', material_source);
    }

    if (start_date) {
      query = query.gte('created_date', start_date);
    }

    if (end_date) {
      query = query.lte('created_date', end_date);
    }

    // 排序 - 默认按创建日期和材料来源排序以便分组显示
    const ascending = sortOrder.toLowerCase() === 'asc';
    if (sortField === 'created_date') {
      query = query.order('created_date', { ascending })
                   .order('material_source', { ascending: true });
    } else {
      query = query.order(sortField, { ascending });
    }

    // 分页
    query = query.range(from, to);

    console.log(`[CuttingOrders] Executing Supabase query...`);
    console.log(`[CuttingOrders] Query parameters:`, {
      page: pageNum,
      pageSize: sizeNum,
      from,
      to,
      material_source,
      start_date,
      end_date,
      search,
      sortField,
      sortOrder
    });
    
    const queryStart = Date.now();
    
    const { data, error, count } = await query;
    
    const queryTime = Date.now() - queryStart;
    console.log(`[CuttingOrders] Supabase query completed in ${queryTime}ms`);
    console.log(`[CuttingOrders] Retrieved ${data?.length || 0} records`);
    console.log(`[CuttingOrders] Total count: ${count}`);
    
    // 详细检查返回的数据
    if (data && data.length > 0) {
      console.log(`[CuttingOrders] Successfully retrieved ${data.length} records`);
      console.log(`[CuttingOrders] Data analysis:`, {
        totalRetrieved: data.length,
        range: { from, to },
        firstFewRecords: data.slice(0, 3).map(record => ({
          id: record.id,
          inventory_number: record.inventory_number,
          project_name: record.project_name,
          material_source: record.material_source,
          created_date: record.created_date,
          tooling_id: record.tooling_id
        })),
        uniqueMaterialSources: [...new Set(data.map(r => r.material_source))],
        dateRange: {
          min: Math.min(...data.map(r => new Date(r.created_date).getTime())),
          max: Math.max(...data.map(r => new Date(r.created_date).getTime()))
        }
      });
    } else {
      console.log(`[CuttingOrders] No data retrieved for range ${from} to ${to}`);
    }

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ success: false, error: '查询失败', details: error.message });
    }

    const totalTime = Date.now() - startTime;
    console.log(`[CuttingOrders] Total request time: ${totalTime}ms`);

    res.json({
      success: true,
      items: data || [],
      total: typeof count === 'number' ? count : (data?.length || 0),
      page: pageNum,
      pageSize: sizeNum,
      queryTime: queryTime // 返回查询时间用于监控
    });

  } catch (err) {
    console.error('Cutting orders route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// POST /api/cutting-orders
// 批量创建或更新下料单
router.post('/', async (req, res) => {
  try {
    const { orders } = req.body || {};
    
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ success: false, error: '缺少下料单数据' });
    }

    // 验证数据格式
    for (const order of orders) {
      const requiredFields = ['inventory_number', 'project_name', 'part_name', 'specifications', 'part_quantity', 'material_source'];
      const missingFields = [];
      
      for (const field of requiredFields) {
        if (!order[field as keyof typeof order]) {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        console.error(`[CuttingOrders] Validation failed. Missing fields: ${missingFields.join(', ')}`);
        return res.status(400).json({ 
          success: false, 
          error: `下料单数据不完整，缺少字段: ${missingFields.join(', ')}` 
        });
      }
    }

    try {
      const results = [];
      const operationStats = { updated: 0, inserted: 0, skipped: 0 };
      
      // 分别处理更新和插入
      for (const order of orders) {
        // 如果存在part_id，检查是否已存在
        if (order.part_id) {
          const existingResult = await queryDatabase(
            'SELECT id, inventory_number, project_name, part_name, specifications, part_quantity, material, total_weight, remarks, material_source FROM cutting_orders WHERE part_id = $1',
            [order.part_id]
          );
          
          if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            
            // 检查是否有实质性变化
            const hasChanges = 
              existing.inventory_number !== order.inventory_number ||
              existing.project_name !== order.project_name ||
              existing.part_name !== order.part_name ||
              existing.specifications !== order.specifications ||
              existing.part_quantity !== order.part_quantity ||
              existing.material !== (order.material || null) ||
              existing.total_weight !== (order.total_weight ?? null) ||
              existing.remarks !== (order.remarks || '') ||
              existing.material_source !== order.material_source;
            
            if (hasChanges) {
              // 有变化，执行更新
              const updateResult = await queryDatabase(`
                UPDATE cutting_orders 
                SET inventory_number = $1, project_name = $2, part_drawing_number = $3, 
                    part_name = $4, material = $5, specifications = $6, part_quantity = $7, 
                    total_weight = $8, remarks = $9, material_source = $10, updated_date = $11
                WHERE part_id = $12
                RETURNING *
              `, [
                order.inventory_number,
                order.project_name,
                order.part_drawing_number,
                order.part_name,
                order.material || null,
                order.specifications,
                order.part_quantity,
                order.total_weight ?? null,
                order.remarks || '',
                order.material_source,
                new Date().toISOString(),
                order.part_id
              ]);
              results.push(updateResult.rows[0]);
              operationStats.updated++;
              console.log(`[CuttingOrders] Updated existing order for part_id: ${order.part_id} (content changed)`);
            } else {
              // 无变化，跳过
              results.push(existing);
              operationStats.skipped++;
              console.log(`[CuttingOrders] Skipped order for part_id: ${order.part_id} (no changes)`);
            }
            continue;
          }
        }
        
        // 不存在，执行插入
        const insertResult = await queryDatabase(`
          INSERT INTO cutting_orders (inventory_number, project_name, part_drawing_number, part_name, 
            material, specifications, part_quantity, total_weight, remarks, material_source, 
            created_date, updated_date, tooling_id, part_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
        `, [
          order.inventory_number,
          order.project_name,
          order.part_drawing_number,
          order.part_name,
          order.material || null,
          order.specifications,
          order.part_quantity,
          order.total_weight ?? null,
          order.remarks || '',
          order.material_source,
          order.created_date || new Date().toISOString(),
          new Date().toISOString(), // updated_date
          order.tooling_id || null,
          order.part_id || null
        ]);
        results.push(insertResult.rows[0]);
        operationStats.inserted++;
        console.log(`[CuttingOrders] Inserted new order for part_id: ${order.part_id}`);
      }
      
      console.log('[CuttingOrders] All orders processed successfully');
      console.log('[CuttingOrders] Operation stats:', operationStats);
      console.log('[CuttingOrders] Total processed rows:', results.length);

      res.json({ success: true, data: results, count: results.length, stats: operationStats });
      return;
      
    } catch (dbError) {
      console.error('Database operation error:', dbError);
      res.status(500).json({ 
        success: false, 
        error: '数据库操作失败',
        details: dbError.message 
      });
    }
  } catch (err) {
    console.error('Create cutting orders route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// DELETE /api/cutting-orders/:id
// 删除单个下料单
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    try {
      const result = await queryDatabase(
        'DELETE FROM cutting_orders WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: '下料单不存在' });
      }

      res.json({ success: true });
    } catch (dbError) {
      console.error('Database delete error:', dbError);
      res.status(500).json({ success: false, error: '数据库删除失败' });
    }
  } catch (err) {
    console.error('Delete cutting order route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// POST /api/cutting-orders/batch-delete
// 批量删除下料单
router.post('/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' });
    }

    try {
      const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
      const result = await queryDatabase(
        `DELETE FROM cutting_orders WHERE id IN (${placeholders}) RETURNING *`,
        ids
      );

      res.json({ success: true, deleted: result.rows.length });
    } catch (dbError) {
      console.error('Batch delete cutting_orders error:', dbError);
      res.status(500).json({ success: false, error: '数据库批量删除失败' });
    }
  } catch (err) {
    console.error('Batch delete cutting orders route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;