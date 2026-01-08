import express from 'express';
import { supabase } from '../lib/supabase.js';

// 连接池配置 - 延迟初始化，确保模块正确加载
let pool: any = null;

// 预初始化连接池，避免首次请求延迟
async function initializePool() {
  try {
    console.log('[PurchaseOrders] Pre-initializing database connection pool...');
    console.log('[PurchaseOrders] SUPABASE_DB_URL:', process.env.SUPABASE_DB_URL ? 'Present' : 'Missing');
    
    if (!process.env.SUPABASE_DB_URL) {
      console.warn('[PurchaseOrders] SUPABASE_DB_URL is not configured, skipping pool initialization');
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
      console.log('[PurchaseOrders] Database pool: new client connected');
    });
    
    pool.on('error', (err) => {
      console.error('[PurchaseOrders] Database pool error:', err);
    });
    
    // 测试连接
    await pool.query('SELECT 1');
    console.log('[PurchaseOrders] Database connection pool pre-initialized successfully');
  } catch (error) {
    console.error('[PurchaseOrders] Failed to pre-initialize pool:', error);
    // 不抛出错误，让应用在运行时处理
  }
}

// 获取数据库连接池
async function getPool() {
  if (!pool) {
    console.log('[PurchaseOrders] Pool not initialized, initializing now...');
    await initializePool();
  }
  return pool;
}

// 直接数据库查询函数（使用连接池）
async function queryDatabase(sql: string, params?: any[], retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const pool = await getPool();
      console.log(`[PurchaseOrders] Executing query (attempt ${attempt}/${retries})`);
      const result = await pool.query(sql, params);
      console.log(`[PurchaseOrders] Query executed successfully`);
      return result;
    } catch (error) {
      console.error(`[PurchaseOrders] Query attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        console.error('[PurchaseOrders] All retry attempts exhausted');
        throw error;
      }
      
      // 等待一段时间后重试
      const waitTime = attempt * 1000; // 递增等待时间
      console.log(`[PurchaseOrders] Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

const router = express.Router();

// 预初始化连接池当模块加载时
setTimeout(() => {
  console.log('[PurchaseOrders] Scheduling pool pre-initialization...');
  initializePool().catch(err => {
    console.error('[PurchaseOrders] Pool pre-initialization failed:', err);
  });
}, 1000); // 延迟1秒执行，确保环境变量已加载

// GET /api/purchase-orders
// 获取采购单列表，支持分页、筛选和排序 - 使用Supabase客户端优化性能
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const {
      page = '1',
      pageSize = '20',
      status,
      start_date,
      end_date,
      search,
      sortField = 'created_date',
      sortOrder = 'desc'
    } = req.query as Record<string, string>;

    console.log(`[PurchaseOrders] Request started at ${new Date().toISOString()}`);

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.max(parseInt(pageSize, 10) || 20, 1);
    const from = (pageNum - 1) * sizeNum;
    const to = from + sizeNum - 1;
    
    console.log(`[PurchaseOrders] Pagination calculation:`, {
      page: pageNum,
      pageSize: sizeNum,
      from: from,
      to: to,
      calculatedRange: `${from}-${to}`
    });

    // 使用Supabase客户端进行查询，改为左连接，确保无关联的临时计划也能返回
    let query = supabase
      .from('purchase_orders')
      .select(`*, 
        tooling_info(
          production_unit,
          recorder
        )`, { count: 'planned' });

    // 搜索功能 - 多字段OR查询
    if (search && search.trim()) {
      const keyword = `%${search.trim()}%`;
      query = query.or(`inventory_number.ilike.${keyword},project_name.ilike.${keyword},part_name.ilike.${keyword},supplier.ilike.${keyword}`);
    }

    // 筛选条件
    if (status) {
      query = query.eq('status', status);
    }

    if (start_date) {
      query = query.gte('created_date', start_date);
    }

    if (end_date) {
      query = query.lte('created_date', end_date);
    }

    // 排序
    const ascending = sortOrder.toLowerCase() === 'asc';
    query = query.order(sortField, { ascending });

    // 分页
    query = query.range(from, to);

    console.log(`[PurchaseOrders] Executing Supabase query...`);
    
    const queryStart = Date.now();
    const { data, error, count } = await query;
    const queryTime = Date.now() - queryStart;
    
    console.log(`[PurchaseOrders] Supabase query completed in ${queryTime}ms`);
    console.log(`[PurchaseOrders] Retrieved ${data?.length || 0} records`);
    console.log(`[PurchaseOrders] Total count: ${count}`);
    
    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ success: false, error: '查询失败', details: error.message });
    }

    // 处理关联数据，提取tooling_info中的字段
    const processedData = (data || []).map((item: any) => {
      const toolingInfo = item.tooling_info?.[0] || {};
      let source = '未知来源';
      if (item.child_item_id || item.part_id) source = '工装信息';
      else if (String(item.inventory_number || '').startsWith('MANUAL-') || String(item.inventory_number || '').startsWith('BACKUP-')) source = '临时计划';

      const productionUnit = item.production_unit || item.supplier || toolingInfo.production_unit || '未知单位';
      const applicant = item.applicant || toolingInfo.recorder || '未知录入人';
      const demandDate = item.demand_date || item.required_date || null;

      return {
        ...item,
        production_unit: productionUnit,
        applicant: applicant,
        demand_date: demandDate,
        source
      };
    });

    const totalTime = Date.now() - startTime;
    console.log(`[PurchaseOrders] Total request time: ${totalTime}ms`);

    res.json({
      success: true,
      items: processedData,
      total: typeof count === 'number' ? count : (data?.length || 0),
      page: pageNum,
      pageSize: sizeNum,
      queryTime: queryTime
    });

  } catch (err) {
    console.error('Purchase orders route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// POST /api/purchase-orders
// 批量创建采购单
router.post('/', async (req, res) => {
  try {
    const { orders } = req.body || {};
    
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ success: false, error: '缺少采购单数据' });
    }

    // 验证数据格式
    for (const order of orders) {
      const requiredFields = ['inventory_number', 'project_name', 'part_name', 'part_quantity', 'unit'];
      const missingFields = [];
      
      for (const field of requiredFields) {
        const value = order[field as keyof typeof order];
        // 对于part_quantity，0是有效值；对于其他字段，空字符串或null视为缺失
        if (field === 'part_quantity') {
          if (value === null || value === undefined || value === '') {
            missingFields.push(field);
          }
        } else {
          if (!value && value !== null) {
            missingFields.push(field);
          }
        }
      }
      
      if (missingFields.length > 0) {
        console.error(`[PurchaseOrders] Validation failed. Missing fields: ${missingFields.join(', ')}`);
        return res.status(400).json({ 
          success: false, 
          error: `采购单数据不完整，缺少字段: ${missingFields.join(', ')}` 
        });
      }
    }

    try {
      const results = [];
      const operationStats = { updated: 0, inserted: 0, skipped: 0 };
      
      // 分别处理更新和插入
      for (const order of orders) {
        // 如果存在child_item_id，检查是否已存在
        if (order.child_item_id) {
          const existingResult = await queryDatabase(
            'SELECT id, inventory_number, project_name, part_name, part_quantity, unit, model, supplier, required_date, remark, production_unit, applicant, demand_date FROM purchase_orders WHERE child_item_id = $1',
            [order.child_item_id]
          );
          
          if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            
            // 检查是否有实质性变化
            const hasChanges = 
              existing.inventory_number !== order.inventory_number ||
              existing.project_name !== order.project_name ||
              existing.part_name !== order.part_name ||
              existing.part_quantity !== order.part_quantity ||
              existing.unit !== order.unit ||
              existing.model !== (order.model || null) ||
              existing.supplier !== (order.supplier || null) ||
              existing.required_date !== (order.required_date || null) ||
              existing.remark !== (order.remark || null) ||
              existing.weight !== (order.weight ?? null) ||
              existing.total_price !== (order.total_price ?? null);
            
            if (hasChanges) {
              console.log(`[PurchaseOrders] Detected changes for child_item_id: ${order.child_item_id}, updating...`);
              console.log(`[PurchaseOrders] Existing record - production_unit: ${existing.production_unit}, applicant: ${existing.applicant}`);
              
              // 获取相关数据用于更新
        let productionUnit = (order.production_unit && String(order.production_unit).trim()) || existing.production_unit || '';
        let demandDate = (order.demand_date || order.required_date || null) || existing.demand_date || null;
        let recorder = (order.applicant && String(order.applicant).trim()) || existing.applicant || '';
        
        // 如果现有记录中没有投产单位或录入人，从tooling_info获取
              if (!productionUnit || productionUnit === '未知单位' || !recorder || recorder === '未知录入人') {
                console.log(`[PurchaseOrders] Missing production_unit or applicant in existing record, fetching from tooling_info...`);
                if (order.tooling_id) {
                  try {
                    const toolingResult = await queryDatabase(
                      'SELECT production_unit, recorder FROM tooling_info WHERE id = $1',
                      [order.tooling_id]
                    );
                    if (toolingResult.rows.length > 0) {
                      productionUnit = productionUnit || toolingResult.rows[0].production_unit || '';
                      recorder = recorder || toolingResult.rows[0].recorder || '';
                      console.log(`[PurchaseOrders] Fetched from tooling_info - productionUnit: ${productionUnit}, recorder: ${recorder}`);
                    }
                  } catch (error) {
                    console.warn(`[PurchaseOrders] Failed to fetch tooling_info for tooling_id ${order.tooling_id}:`, error);
                  }
                }
              } else {
                console.log(`[PurchaseOrders] Using existing production_unit and applicant values`);
              }
        
        // 根据订单来源获取需求日期
        if (!demandDate && order.part_id) {
          // 外购零件：从parts_info.remarks获取需求日期
          try {
            const partResult = await queryDatabase(
              'SELECT remarks FROM parts_info WHERE id = $1',
              [order.part_id]
            );
            if (partResult.rows.length > 0 && partResult.rows[0].remarks) {
              // 尝试解析remarks中的日期
              const dateMatch = partResult.rows[0].remarks.match(/\d{4}-\d{2}-\d{2}/);
              if (dateMatch) {
                demandDate = dateMatch[0];
              }
            }
          } catch (error) {
            console.warn(`[PurchaseOrders] Failed to fetch parts_info for part_id ${order.part_id}:`, error);
          }
        } else if (!demandDate && order.child_item_id) {
          // 标准件：从child_items.required_date获取需求日期
          try {
            const childResult = await queryDatabase(
              'SELECT required_date FROM child_items WHERE id = $1',
              [order.child_item_id]
            );
            if (childResult.rows.length > 0) {
              demandDate = childResult.rows[0].required_date || demandDate;
            }
          } catch (error) {
            console.warn(`[PurchaseOrders] Failed to fetch child_items for child_item_id ${order.child_item_id}:`, error);
          }
        } else if (!demandDate && order.tooling_id && order.part_name) {
          // 标准件（通过tooling_id + part_name匹配）：从child_items.required_date获取需求日期
          try {
            const childResult = await queryDatabase(
              'SELECT required_date FROM child_items WHERE tooling_id = $1 AND name = $2',
              [order.tooling_id, order.part_name]
            );
            if (childResult.rows.length > 0) {
              demandDate = childResult.rows[0].required_date || demandDate;
            }
          } catch (error) {
            console.warn(`[PurchaseOrders] Failed to fetch child_items for tooling_id ${order.tooling_id} and name ${order.part_name}:`, error);
          }
        }
              
              // 有变化，执行更新
              console.log(`[PurchaseOrders] Updating with values - productionUnit: ${productionUnit}, demandDate: ${demandDate}, recorder: ${recorder}`);
              
              const updateResult = await queryDatabase(`
                UPDATE purchase_orders 
                SET inventory_number = $1, project_name = $2, part_name = $3, part_quantity = $4, 
                    unit = $5, model = $6, supplier = $7, required_date = $8, remark = $9, 
                    updated_date = $10, production_unit = $11, demand_date = $12, applicant = $13,
                    weight = $14, total_price = $15
                WHERE child_item_id = $16
                RETURNING *
              `, [
                order.inventory_number,
                order.project_name,
                order.part_name,
                order.part_quantity,
                order.unit,
                order.model || null,
                order.supplier || null,
                order.required_date || null,
                order.remark || null,
                new Date().toISOString(),
                productionUnit || null,
                demandDate || null,
                recorder || null,
                order.weight ?? null,
                order.total_price ?? null,
                order.child_item_id
              ]);
              results.push(updateResult.rows[0]);
              operationStats.updated++;
              console.log(`[PurchaseOrders] Updated existing order for child_item_id: ${order.child_item_id} (content changed)`);
            } else {
              // 无变化，跳过
              results.push(existing);
              operationStats.skipped++;
              console.log(`[PurchaseOrders] Skipped order for child_item_id: ${order.child_item_id} (no changes)`);
            }
            continue;
          }
        }
        
        // 如果存在part_id，优先使用part_id进行检测（外购零件）
        if (order.part_id) {
          const existingResult = await queryDatabase(
            'SELECT id, inventory_number, project_name, part_name, part_quantity, unit, model, supplier, required_date, remark, production_unit, applicant, demand_date FROM purchase_orders WHERE part_id = $1',
            [order.part_id]
          );
          
          if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            
            // 检查是否有实质性变化
            const hasChanges = 
              existing.inventory_number !== order.inventory_number ||
              existing.project_name !== order.project_name ||
              existing.part_name !== order.part_name ||
              existing.part_quantity !== order.part_quantity ||
              existing.unit !== order.unit ||
              existing.model !== (order.model || null) ||
              existing.supplier !== (order.supplier || null) ||
              existing.required_date !== (order.required_date || null) ||
              existing.remark !== (order.remark || null) ||
              existing.weight !== (order.weight ?? null) ||
              existing.total_price !== (order.total_price ?? null);
            
            if (hasChanges) {
              console.log(`[PurchaseOrders] Detected changes for part_id: ${order.part_id}, updating...`);
              console.log(`[PurchaseOrders] Existing record - production_unit: ${existing.production_unit}, applicant: ${existing.applicant}`);
              
              // 获取相关数据用于更新
              let productionUnit = existing.production_unit || '未知单位';
              let demandDate = existing.demand_date || null;
              let recorder = existing.applicant || '未知录入人';
              
              // 如果现有记录中没有投产单位或录入人，从tooling_info获取
              if (!existing.production_unit || !existing.applicant) {
                console.log(`[PurchaseOrders] Missing production_unit or applicant in existing record, fetching from tooling_info...`);
                if (order.tooling_id) {
                  try {
                    const toolingResult = await queryDatabase(
                      'SELECT production_unit, recorder FROM tooling_info WHERE id = $1',
                      [order.tooling_id]
                    );
                    if (toolingResult.rows.length > 0) {
                      productionUnit = existing.production_unit || toolingResult.rows[0].production_unit || '未知单位';
                      recorder = existing.applicant || toolingResult.rows[0].recorder || '未知录入人';
                      console.log(`[PurchaseOrders] Fetched from tooling_info - productionUnit: ${productionUnit}, recorder: ${recorder}`);
                    }
                  } catch (error) {
                    console.warn(`[PurchaseOrders] Failed to fetch tooling_info for tooling_id ${order.tooling_id}:`, error);
                  }
                }
              } else {
              console.log(`[PurchaseOrders] Using existing production_unit and applicant values`);
              }
              
              // 如果现有记录中没有投产单位或录入人，从tooling_info获取
              if (!existing.production_unit || !existing.applicant) {
                console.log(`[PurchaseOrders] Missing production_unit or applicant in existing record, fetching from tooling_info...`);
                if (order.tooling_id) {
                  try {
                    const toolingResult = await queryDatabase(
                      'SELECT production_unit, recorder FROM tooling_info WHERE id = $1',
                      [order.tooling_id]
                    );
                    if (toolingResult.rows.length > 0) {
                      productionUnit = existing.production_unit || toolingResult.rows[0].production_unit || '未知单位';
                      recorder = existing.applicant || toolingResult.rows[0].recorder || '未知录入人';
                      console.log(`[PurchaseOrders] Fetched from tooling_info - productionUnit: ${productionUnit}, recorder: ${recorder}`);
                    }
                  } catch (error) {
                    console.warn(`[PurchaseOrders] Failed to fetch tooling_info for tooling_id ${order.tooling_id}:`, error);
                  }
                }
              } else {
                console.log(`[PurchaseOrders] Using existing production_unit and applicant values`);
              }
              
              // 根据订单来源获取需求日期
              if (order.part_id) {
                // 外购零件：从parts_info.remarks获取需求日期
                try {
                  const partResult = await queryDatabase(
                    'SELECT remarks FROM parts_info WHERE id = $1',
                    [order.part_id]
                  );
                  if (partResult.rows.length > 0 && partResult.rows[0].remarks) {
                    // 尝试解析remarks中的日期
                    const dateMatch = partResult.rows[0].remarks.match(/\d{4}-\d{2}-\d{2}/);
                    if (dateMatch) {
                      demandDate = dateMatch[0];
                    }
                  }
                } catch (error) {
                  console.warn(`[PurchaseOrders] Failed to fetch parts_info for part_id ${order.part_id}:`, error);
                }
              } else if (order.child_item_id) {
                // 标准件：从child_items.required_date获取需求日期
                try {
                  const childResult = await queryDatabase(
                    'SELECT required_date FROM child_items WHERE id = $1',
                    [order.child_item_id]
                  );
                  if (childResult.rows.length > 0) {
                    demandDate = childResult.rows[0].required_date || demandDate;
                  }
                } catch (error) {
                  console.warn(`[PurchaseOrders] Failed to fetch child_items for child_item_id ${order.child_item_id}:`, error);
                }
              } else if (order.tooling_id && order.part_name) {
                // 标准件（通过tooling_id + part_name匹配）：从child_items.required_date获取需求日期
                try {
                  const childResult = await queryDatabase(
                    'SELECT required_date FROM child_items WHERE tooling_id = $1 AND name = $2',
                    [order.tooling_id, order.part_name]
                  );
                  if (childResult.rows.length > 0) {
                    demandDate = childResult.rows[0].required_date || demandDate;
                  }
                } catch (error) {
                  console.warn(`[PurchaseOrders] Failed to fetch child_items for tooling_id ${order.tooling_id} and name ${order.part_name}:`, error);
                }
              }
              
              // 有变化，执行更新
              console.log(`[PurchaseOrders] Updating with values - productionUnit: ${productionUnit}, demandDate: ${demandDate}, recorder: ${recorder}`);
              
              const updateResult = await queryDatabase(`
                UPDATE purchase_orders 
                SET inventory_number = $1, project_name = $2, part_name = $3, part_quantity = $4, 
                    unit = $5, model = $6, supplier = $7, required_date = $8, remark = $9, 
                    updated_date = $10, production_unit = $11, demand_date = $12, applicant = $13,
                    weight = $14, total_price = $15
                WHERE part_id = $16
                RETURNING *
              `, [
                order.inventory_number,
                order.project_name,
                order.part_name,
                order.part_quantity,
                order.unit,
                order.model || null,
                order.supplier || null,
                order.required_date || null,
                order.remark || null,
                new Date().toISOString(),
                productionUnit,
                demandDate,
                recorder,
                order.weight ?? null,
                order.total_price ?? null,
                order.part_id
              ]);
              results.push(updateResult.rows[0]);
              operationStats.updated++;
              console.log(`[PurchaseOrders] Updated existing order for part_id: ${order.part_id} (content changed)`);
            } else {
              // 无变化，跳过
              results.push(existing);
              operationStats.skipped++;
              console.log(`[PurchaseOrders] Skipped order for part_id: ${order.part_id} (no changes)`);
            }
            continue;
          }
        }
        
        // 如果不存在part_id，使用tooling_id和part_name组合进行检测（标准件）
        if (order.tooling_id && order.part_name) {
          const existingResult = await queryDatabase(
            'SELECT id, inventory_number, project_name, part_name, part_quantity, unit, model, supplier, required_date, remark, production_unit, applicant, demand_date FROM purchase_orders WHERE tooling_id = $1 AND part_name = $2 AND part_id IS NULL',
            [order.tooling_id, order.part_name]
          );
          
          if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            
            // 检查是否有实质性变化
            const hasChanges = 
              existing.inventory_number !== order.inventory_number ||
              existing.project_name !== order.project_name ||
              existing.part_name !== order.part_name ||
              existing.part_quantity !== order.part_quantity ||
              existing.unit !== order.unit ||
              existing.model !== (order.model || null) ||
              existing.supplier !== (order.supplier || null) ||
              existing.required_date !== (order.required_date || null) ||
              existing.remark !== (order.remark || null);
            
            if (hasChanges) {
              console.log(`[PurchaseOrders] Detected changes for tooling_id: ${order.tooling_id}, part_name: ${order.part_name}, updating...`);
              console.log(`[PurchaseOrders] Existing record - production_unit: ${existing.production_unit}, applicant: ${existing.applicant}`);
              
              // 获取相关数据用于更新
              let productionUnit = existing.production_unit || '未知单位';
              let demandDate = existing.demand_date || null;
              let recorder = existing.applicant || '未知录入人';
              
              // 根据订单来源获取需求日期
              if (order.part_id) {
                // 外购零件：从parts_info.remarks获取需求日期
                try {
                  const partResult = await queryDatabase(
                    'SELECT remarks FROM parts_info WHERE id = $1',
                    [order.part_id]
                  );
                  if (partResult.rows.length > 0 && partResult.rows[0].remarks) {
                    // 尝试解析remarks中的日期
                    const dateMatch = partResult.rows[0].remarks.match(/\d{4}-\d{2}-\d{2}/);
                    if (dateMatch) {
                      demandDate = dateMatch[0];
                    }
                  }
                } catch (error) {
                  console.warn(`[PurchaseOrders] Failed to fetch parts_info for part_id ${order.part_id}:`, error);
                }
              } else if (order.child_item_id) {
                // 标准件：从child_items.required_date获取需求日期
                try {
                  const childResult = await queryDatabase(
                    'SELECT required_date FROM child_items WHERE id = $1',
                    [order.child_item_id]
                  );
                  if (childResult.rows.length > 0) {
                    demandDate = childResult.rows[0].required_date || demandDate;
                  }
                } catch (error) {
                  console.warn(`[PurchaseOrders] Failed to fetch child_items for child_item_id ${order.child_item_id}:`, error);
                }
              } else if (order.tooling_id && order.part_name) {
                // 标准件（通过tooling_id + part_name匹配）：从child_items.required_date获取需求日期
                try {
                  const childResult = await queryDatabase(
                    'SELECT required_date FROM child_items WHERE tooling_id = $1 AND name = $2',
                    [order.tooling_id, order.part_name]
                  );
                  if (childResult.rows.length > 0) {
                    demandDate = childResult.rows[0].required_date || demandDate;
                  }
                } catch (error) {
                  console.warn(`[PurchaseOrders] Failed to fetch child_items for tooling_id ${order.tooling_id} and name ${order.part_name}:`, error);
                }
              }
              
              // 有变化，执行更新
              console.log(`[PurchaseOrders] Updating with values - productionUnit: ${productionUnit}, demandDate: ${demandDate}, recorder: ${recorder}`);
              
              const updateResult = await queryDatabase(`
                UPDATE purchase_orders 
                SET inventory_number = $1, project_name = $2, part_name = $3, part_quantity = $4, 
                    unit = $5, model = $6, supplier = $7, required_date = $8, remark = $9, 
                    updated_date = $10, production_unit = $11, demand_date = $12, applicant = $13,
                    weight = $14, total_price = $15
                WHERE tooling_id = $16 AND part_name = $17 AND part_id IS NULL
                RETURNING *
              `, [
                order.inventory_number,
                order.project_name,
                order.part_name,
                order.part_quantity,
                order.unit,
                order.model || null,
                order.supplier || null,
                order.required_date || null,
                order.remark || null,
                new Date().toISOString(),
                productionUnit,
                demandDate,
                recorder,
                order.weight ?? null,
                order.total_price ?? null,
                order.tooling_id,
                order.part_name
              ]);
              results.push(updateResult.rows[0]);
              operationStats.updated++;
              console.log(`[PurchaseOrders] Updated existing order for tooling_id: ${order.tooling_id}, part_name: ${order.part_name} (content changed)`);
            } else {
              // 无变化，跳过
              results.push(existing);
              operationStats.skipped++;
              console.log(`[PurchaseOrders] Skipped order for tooling_id: ${order.tooling_id}, part_name: ${order.part_name} (no changes)`);
            }
            continue;
          }
        }

        // 不存在，执行插入
        // 获取相关数据
        let productionUnit = (order.production_unit && String(order.production_unit).trim()) || '';
        let demandDate = (order.demand_date || order.required_date || null);
        let recorder = (order.applicant && String(order.applicant).trim()) || '';
        
        // 根据订单来源获取需求日期
        if (!demandDate && order.part_id) {
          // 外购零件：从parts_info.remarks获取需求日期
          try {
            const partResult = await queryDatabase(
              'SELECT remarks FROM parts_info WHERE id = $1',
              [order.part_id]
            );
            if (partResult.rows.length > 0 && partResult.rows[0].remarks) {
              // 尝试解析remarks中的日期
              const dateMatch = partResult.rows[0].remarks.match(/\d{4}-\d{2}-\d{2}/);
              if (dateMatch) {
                demandDate = dateMatch[0];
              }
            }
          } catch (error) {
            console.warn(`[PurchaseOrders] Failed to fetch parts_info for part_id ${order.part_id}:`, error);
          }
        } else if (!demandDate && order.child_item_id) {
          // 标准件：从child_items.required_date获取需求日期
          try {
            const childResult = await queryDatabase(
              'SELECT required_date FROM child_items WHERE id = $1',
              [order.child_item_id]
            );
            if (childResult.rows.length > 0) {
              demandDate = childResult.rows[0].required_date || null;
            }
          } catch (error) {
            console.warn(`[PurchaseOrders] Failed to fetch child_items for child_item_id ${order.child_item_id}:`, error);
          }
        } else if (!demandDate && order.tooling_id && order.part_name) {
          // 标准件（通过tooling_id + part_name匹配）：从child_items.required_date获取需求日期
          try {
            const childResult = await queryDatabase(
              'SELECT required_date FROM child_items WHERE tooling_id = $1 AND name = $2',
              [order.tooling_id, order.part_name]
            );
            if (childResult.rows.length > 0) {
              demandDate = childResult.rows[0].required_date || null;
            }
          } catch (error) {
            console.warn(`[PurchaseOrders] Failed to fetch child_items for tooling_id ${order.tooling_id} and name ${order.part_name}:`, error);
          }
        }
        
        // 获取投产单位和录入人信息（仅从tooling_info）
        if ((!productionUnit || productionUnit === '未知单位' || !recorder || recorder === '未知录入人') && order.tooling_id) {
          try {
            const toolingResult = await queryDatabase(
              'SELECT production_unit, recorder FROM tooling_info WHERE id = $1',
              [order.tooling_id]
            );
            if (toolingResult.rows.length > 0) {
              productionUnit = productionUnit || toolingResult.rows[0].production_unit || '';
              recorder = recorder || toolingResult.rows[0].recorder || '';
            }
          } catch (error) {
            console.warn(`[PurchaseOrders] Failed to fetch tooling_info for tooling_id ${order.tooling_id}:`, error);
          }
        }

        // 防重与更新（临时计划/备料）：若存在相同库存编号则更新，否则插入
        if (order.inventory_number && String(order.inventory_number).trim() !== '') {
          try {
            const exRes = await queryDatabase(
              'SELECT id, inventory_number, project_name, part_name, part_quantity, unit, model, supplier, required_date, remark, production_unit, applicant, demand_date FROM purchase_orders WHERE inventory_number = $1',
              [order.inventory_number]
            )

            if (exRes.rows.length > 0) {
              const existing = exRes.rows[0]
              const hasChanges =
                existing.project_name !== order.project_name ||
                existing.part_name !== order.part_name ||
                existing.part_quantity !== order.part_quantity ||
                existing.unit !== order.unit ||
                existing.model !== (order.model || null) ||
                existing.supplier !== (order.supplier || null) ||
                existing.required_date !== (order.required_date || null) ||
                existing.remark !== (order.remark || null) ||
                existing.production_unit !== (productionUnit || null) ||
                existing.demand_date !== (demandDate || null) ||
                existing.applicant !== (recorder || null) ||
                existing.weight !== (order.weight ?? null) ||
                existing.total_price !== (order.total_price ?? null)

              if (hasChanges) {
                const updRes = await queryDatabase(
                  `UPDATE purchase_orders SET 
                    project_name = $1, part_name = $2, part_quantity = $3, unit = $4, model = $5, supplier = $6, 
                    required_date = $7, remark = $8, updated_date = $9, production_unit = $10, demand_date = $11, applicant = $12,
                    weight = $13, total_price = $14
                   WHERE id = $15 RETURNING *`,
                  [
                    order.project_name,
                    order.part_name,
                    order.part_quantity,
                    order.unit,
                    order.model || null,
                    order.supplier || null,
                    order.required_date || null,
                    order.remark || null,
                    new Date().toISOString(),
                    productionUnit || null,
                    demandDate || null,
                    recorder || null,
                    order.weight ?? null,
                    order.total_price ?? null,
                    existing.id
                  ]
                )
                results.push(updRes.rows[0])
                operationStats.updated++
                console.log(`[PurchaseOrders] Updated existing order by inventory_number: ${order.inventory_number}`)
              } else {
                results.push(existing)
                operationStats.skipped++
                console.log(`[PurchaseOrders] Skipped order by inventory_number: ${order.inventory_number} (no changes)`)                
              }
              continue
            }
          } catch (error) {
            console.warn(`[PurchaseOrders] Inventory-number update check failed for ${order.inventory_number}:`, error)
          }
        }

        const insertResult = await queryDatabase(`
          INSERT INTO purchase_orders (inventory_number, project_name, part_name, part_quantity, unit, 
            model, supplier, required_date, remark, created_date, tooling_id, child_item_id, part_id, status,
            production_unit, demand_date, applicant, weight, total_price)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          RETURNING *
        `, [
          order.inventory_number,
          order.project_name,
          order.part_name,
          order.part_quantity,
          order.unit,
          order.model || null,
          order.supplier || null,
          order.required_date || null,
          order.remark || null,
          order.created_date || new Date().toISOString(),
          order.tooling_id || null,
          order.child_item_id || null,
          order.part_id || null,
          order.status || 'pending',
          productionUnit || null,
          demandDate || null,
          recorder || null,
          order.weight ?? null,
          order.total_price ?? null
        ]);
        results.push(insertResult.rows[0]);
        operationStats.inserted++;
        console.log(`[PurchaseOrders] Inserted new order for part_id: ${order.part_id || 'none'}, child_item_id: ${order.child_item_id || 'none'}`);
      }
      
      console.log('[PurchaseOrders] All orders processed successfully');
      console.log('[PurchaseOrders] Operation stats:', operationStats);
      console.log('[PurchaseOrders] Total processed rows:', results.length);

      res.json({ success: true, data: results, count: results.length, stats: operationStats });
    } catch (dbError) {
      console.error('Database operation error:', dbError);
      res.status(500).json({ 
        success: false, 
        error: '数据库操作失败',
        details: dbError.message 
      });
    }
  } catch (err) {
    console.error('Create purchase orders route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// PUT /api/purchase-orders/:id/status
// 更新采购单状态
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, error: '缺少状态参数' });
    }

    try {
      const result = await queryDatabase(
        'UPDATE purchase_orders SET status = $1, updated_date = $2 WHERE id = $3 RETURNING *',
        [status, new Date().toISOString(), id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: '采购单不存在' });
      }

      res.json({ success: true, data: result.rows[0] });
    } catch (dbError) {
      console.error('Database update error:', dbError);
      res.status(500).json({ success: false, error: '数据库更新失败' });
    }
  } catch (err) {
    console.error('Update purchase order status route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// DELETE /api/purchase-orders/:id
// 删除单个采购单
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    try {
      const result = await queryDatabase(
        'DELETE FROM purchase_orders WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: '采购单不存在' });
      }

      res.json({ success: true });
    } catch (dbError) {
      console.error('Database delete error:', dbError);
      res.status(500).json({ success: false, error: '数据库删除失败' });
    }
  } catch (err) {
    console.error('Delete purchase order route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// POST /api/purchase-orders/batch-delete
// 批量删除采购单
router.post('/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' });
    }

    try {
      const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
      const result = await queryDatabase(
        `DELETE FROM purchase_orders WHERE id IN (${placeholders}) RETURNING *`,
        ids
      );

      res.json({ success: true, deleted: result.rows.length });
    } catch (dbError) {
      console.error('Batch delete purchase_orders error:', dbError);
      res.status(500).json({ success: false, error: '数据库批量删除失败' });
    }
  } catch (err) {
    console.error('Batch delete purchase orders route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});


// POST /api/purchase-orders/manual
// 临时计划
router.post('/manual', async (req, res) => {
  try {
    const { orders } = req.body || {};
    console.log('收到手动采购单请求:', JSON.stringify(req.body, null, 2));
    
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ success: false, error: '缺少采购单数据' });
    }

    try {
      const results = [];
      let successCount = 0;

      for (const order of orders) {
        console.log('处理订单数据:', JSON.stringify(order, null, 2));
        
        // 字段映射：将前端字段映射到数据库字段
        const mappedOrder = {
          ...order,
          required_date: order.demand_date || order.required_date || null,
          recorder: order.applicant || order.recorder || '手动录入',
          part_quantity: order.part_quantity ? parseInt(order.part_quantity as string) : 0
        };
        
        console.log('映射后的订单数据:', JSON.stringify(mappedOrder, null, 2));
        console.log('字段映射检查:', {
          original_demand_date: order.demand_date,
          mapped_required_date: mappedOrder.required_date,
          original_applicant: order.applicant,
          mapped_recorder: mappedOrder.recorder,
          original_part_quantity: order.part_quantity,
          mapped_part_quantity: mappedOrder.part_quantity
        });
        
        // 验证必填字段（使用映射后的字段）
        console.log('开始验证必填字段:', {
          part_name: mappedOrder.part_name,
          part_quantity: mappedOrder.part_quantity,
          unit: mappedOrder.unit,
          part_name_exists: !!mappedOrder.part_name,
          part_quantity_exists: mappedOrder.part_quantity !== undefined && mappedOrder.part_quantity !== null,
          part_quantity_value: mappedOrder.part_quantity,
          unit_exists: !!mappedOrder.unit,
          part_name_trimmed: mappedOrder.part_name?.trim(),
          unit_trimmed: mappedOrder.unit?.trim()
        });
        
        // 严格验证：必填字段必须完整
        const hasValidPartName = mappedOrder.part_name && mappedOrder.part_name.trim() !== '';
        const hasValidUnit = mappedOrder.unit && mappedOrder.unit.trim() !== '';
        
        console.log('验证字段:', {
          part_name: mappedOrder.part_name,
          part_quantity: mappedOrder.part_quantity,
          unit: mappedOrder.unit,
          hasValidPartName,
          hasValidUnit,
          anyContent: hasValidPartName || hasValidUnit || mappedOrder.model || mappedOrder.project_name
        });
        
        // 严格验证：必须同时有名称和单位才能创建记录
        if (!hasValidPartName || !hasValidUnit) {
          console.log('验证失败 - 缺少必填字段:', {
            part_name: mappedOrder.part_name,
            unit: mappedOrder.unit,
            hasValidPartName,
            hasValidUnit
          });
          results.push({
            success: false,
            error: '缺少必填字段：名称和单位不能为空',
            data: order
          });
          continue;
        }
        
        console.log('验证通过 - 必填字段完整，继续处理');
        
        // 验证数量格式（只有当数量有值时才验证格式）
        if (mappedOrder.part_quantity !== undefined && mappedOrder.part_quantity !== null && String(mappedOrder.part_quantity).trim() !== '') {
          const quantityNum = parseInt(mappedOrder.part_quantity as string);
          console.log('数量格式验证:', {
            original_quantity: mappedOrder.part_quantity,
            parsed_quantity: quantityNum,
            is_valid_number: !isNaN(quantityNum) && quantityNum > 0
          });
          
          if (isNaN(quantityNum) || quantityNum <= 0) {
            console.error('数量格式验证失败:', {
              original_quantity: mappedOrder.part_quantity,
              parsed_quantity: quantityNum,
              is_nan: isNaN(quantityNum),
              is_non_positive: quantityNum <= 0
            });
            results.push({
              success: false,
              error: '数量必须是正整数',
              data: order
            });
            continue;
          }
        }
        
        // 验证需求日期格式（如果填写了）
        if (mappedOrder.required_date && mappedOrder.required_date.trim() !== '') {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(mappedOrder.required_date)) {
            console.error('需求日期格式验证失败:', {
              required_date: mappedOrder.required_date
            });
            results.push({
              success: false,
              error: '需求日期格式必须为YYYY-MM-DD',
              data: order
            });
            continue;
          }
        }
        
        console.log('验证通过，准备插入数据');

        // 生成库存编号 - 只有当没有提供时才生成
        const inventoryNumber = mappedOrder.inventory_number && mappedOrder.inventory_number.trim() !== '' 
          ? mappedOrder.inventory_number 
          : `MANUAL-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        
        // 转换数量 - 与前端逻辑保持一致，允许为空
        const quantity = (mappedOrder.part_quantity !== undefined && mappedOrder.part_quantity !== null && String(mappedOrder.part_quantity).trim() !== '') 
          ? parseInt(mappedOrder.part_quantity as string) 
          : null;
        
        // 项目编号 - 使用提供的值或为空
        const projectName = mappedOrder.project_name && mappedOrder.project_name.trim() !== '' 
          ? mappedOrder.project_name 
          : null;
        
        // 设置默认状态
        const status = mappedOrder.status || 'pending';
        
        // 设置需求日期 - 空字符串转换为null
        const requiredDate = mappedOrder.required_date && mappedOrder.required_date.trim() !== '' 
          ? mappedOrder.required_date 
          : null;
        
        // 处理投产单位和提交人信息
        const productionUnit = mappedOrder.production_unit && mappedOrder.production_unit.trim() !== '' 
          ? mappedOrder.production_unit 
          : null;
        const recorder = mappedOrder.recorder && mappedOrder.recorder.trim() !== '' 
          ? mappedOrder.recorder 
          : '手动录入';
        const createdDate = mappedOrder.created_date || new Date().toISOString();
        
        // 处理其他可能为空的字段
        const partName = mappedOrder.part_name && mappedOrder.part_name.trim() !== '' 
          ? mappedOrder.part_name 
          : null;
        const unit = mappedOrder.unit && mappedOrder.unit.trim() !== '' 
          ? mappedOrder.unit 
          : null;
        const model = mappedOrder.model && mappedOrder.model.trim() !== '' 
          ? mappedOrder.model 
          : null;
        const supplier = mappedOrder.supplier && mappedOrder.supplier.trim() !== '' 
          ? mappedOrder.supplier 
          : null;
        const remark = mappedOrder.remark && mappedOrder.remark.trim() !== '' 
          ? mappedOrder.remark 
          : null;
        
        // 插入数据
        console.log('准备插入数据:', {
          inventoryNumber,
          projectName,
          part_name: mappedOrder.part_name,
          quantity,
          unit: mappedOrder.unit,
          model: mappedOrder.model || null,
          supplier: mappedOrder.supplier || null,
          requiredDate,
          remark: mappedOrder.remark || null,
          status,
          createdDate,
          productionUnit,
          recorder
        });
        
        let result;
        try {
          result = await queryDatabase(`
            INSERT INTO purchase_orders (
              inventory_number, project_name, part_name, part_quantity, unit,
              model, supplier, required_date, remark, status, created_date, updated_date,
              production_unit, demand_date, applicant
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13, $14)
            RETURNING *
          `, [
            inventoryNumber,
            projectName,
            partName,
            quantity,
            unit,
            model,
            supplier,
            requiredDate,
            remark,
            status,
            createdDate,
            productionUnit,
            requiredDate, // demand_date maps to required_date
            recorder // applicant maps to recorder
          ]);
          
          console.log('插入结果:', result.rows);
        } catch (insertError) {
          console.error('插入失败 - 数据库错误:', insertError);
          console.error('错误详情:', {
            message: insertError.message,
            stack: insertError.stack,
            code: insertError.code,
            constraint: insertError.constraint,
            detail: insertError.detail,
            hint: insertError.hint
          });
          
          // 检查是否是必填字段错误
          if (insertError.message && insertError.message.includes('null value in column')) {
            const columnMatch = insertError.message.match(/null value in column "([^"]+)"/);
            const columnName = columnMatch ? columnMatch[1] : '未知字段';
            console.error(`数据库错误 - 必填字段为空: ${columnName}`);
            
            results.push({
              success: false,
              error: `数据库错误 - 必填字段为空: ${columnName}`,
              data: order
            });
          } else {
            results.push({
              success: false,
              error: '数据库插入失败',
              data: order
            });
          }
          continue;
        }

        if (result.rows.length > 0) {
          successCount++;
          const insertedData = result.rows[0];
          
          // 字段映射：将数据库字段映射到前端期望的字段名
          const mappedData = {
            ...insertedData,
            // 将数据库的 required_date 映射为前端的 demand_date
            demand_date: insertedData.required_date || insertedData.demand_date || '',
            // 确保其他字段也正确映射
            applicant: insertedData.applicant || insertedData.recorder || '',
            part_quantity: insertedData.part_quantity || 0
          };
          
          results.push({
            success: true,
            data: mappedData
          });
          console.log(`手动采购单插入成功: ID=${insertedData.id}`);
        } else {
          results.push({
            success: false,
            error: '插入失败 - 没有返回数据',
            data: order
          });
          console.log('手动采购单插入失败: 没有返回数据');
        }
      }

      console.log('手动采购单处理完成:', { successCount, total: orders.length, results });
      res.json({ 
        success: true, 
        count: successCount,
        total: orders.length,
        results: results
      });
    } catch (dbError) {
      console.error('Manual insert purchase_orders error:', dbError);
      res.status(500).json({ success: false, error: '数据库插入失败' });
    }
  } catch (err) {
    console.error('Manual purchase orders route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
