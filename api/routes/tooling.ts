import express from 'express';
import { supabase } from '../lib/supabase.js';
import { query } from '../lib/db.js';

const router = express.Router();

// GET /api/tooling
// 支持分页、搜索、筛选与排序
router.get('/', async (req, res) => {
  try {
    const {
      page = '1',
      pageSize = '20',
      search = '',
      production_unit,
      category,
      start_date,
      end_date,
      sortField = 'created_at',
      sortOrder = 'desc'
    } = req.query as Record<string, string>;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
    const from = (pageNum - 1) * sizeNum;
    const to = from + sizeNum - 1;

    let query = supabase
      .from('tooling_info')
      .select('*', { count: 'exact' });

    // 搜索（支持父表字段与子表盘存编号）
    if (search && search.trim()) {
      const raw = String(search).trim();
      const keyword = `%${raw}%`;
      let partsToolingIds: string[] = [];
      try {
        const { data: parts, error: perr } = await supabase
          .from('parts_info')
          .select('tooling_id, part_inventory_number')
          .ilike('part_inventory_number', keyword)
          .limit(1000);
        if (!perr && Array.isArray(parts)) {
          partsToolingIds = Array.from(new Set(parts.map((p: any) => String(p.tooling_id || '')))).filter(Boolean);
        }
      } catch {}

      const baseExpr = `inventory_number.ilike.${keyword},project_name.ilike.${keyword},recorder.ilike.${keyword}`;
      if (partsToolingIds.length > 0) {
        const inList = partsToolingIds.join(',');
        // 将子表命中的父ID也纳入OR条件
        query = query.or(`${baseExpr},id.in.(${inList})`);
      } else {
        query = query.or(baseExpr);
      }
    }

    // 筛选
    if (production_unit) {
      query = query.ilike('production_unit', `%${production_unit}%`);
    }
    if (category) {
      query = query.ilike('category', `%${category}%`);
    }
    if (start_date) {
      query = query.gte('production_date', start_date);
    }
    if (end_date) {
      query = query.lte('production_date', end_date);
    }

    // 排序
    const ascending = String(sortOrder).toLowerCase() === 'asc';
    query = query.order(sortField, { ascending });

    // 分页
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Fetch tooling_info error:', error);
      return res.status(500).json({ success: false, error: '查询失败' });
    }

    res.json({
      success: true,
      items: data || [],
      total: typeof count === 'number' ? count : (data?.length || 0),
      page: pageNum,
      pageSize: sizeNum
    });
  } catch (err) {
    console.error('Tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 删除单个工装信息
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('tooling_info')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete tooling_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 批量删除工装信息
router.post('/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' });
    }

    const { error } = await supabase
      .from('tooling_info')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Batch delete tooling_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Batch delete tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 删除单个零件
router.delete('/parts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('parts_info')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete parts_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete part route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 批量删除零件
router.post('/parts/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' });
    }

    const { error } = await supabase
      .from('parts_info')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Batch delete parts_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Batch delete parts route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 创建工装信息
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const inv = String((payload as any).inventory_number || '').trim()
    if (inv) {
      try {
        const { data: exists } = await supabase.from('tooling_info').select('*').eq('inventory_number', inv).limit(1)
        if (Array.isArray(exists) && exists[0]) {
          return res.json({ success: true, data: exists[0] })
        }
      } catch {}
    }

    const processedPayload: any = {}
    for (const k of Object.keys(payload)) {
      const v = (payload as any)[k]
      const isDate = ['received_date','demand_date','completed_date','production_date'].includes(k)
      const isText = ['inventory_number','production_unit','category','project_name','recorder'].includes(k)
      if (isDate) {
        processedPayload[k] = (v === '' || v === null) ? null : v
      } else if (isText) {
        const sv = typeof v === 'string' ? v.trim() : v
        processedPayload[k] = (sv === '') ? null : sv
      } else {
        processedPayload[k] = v
      }
    }
    if (!('sets_count' in processedPayload)) processedPayload.sets_count = 1

    const { data, error } = await supabase
      .from('tooling_info')
      .insert([processedPayload])
      .select('*')
      .single();

  if (error) {
    console.error('Create tooling_info error:', error);
    const msg = String(error?.message || '服务器错误')
    const code = String((error as any)?.code || '')
    if (code === 'PGRST204' && (process.env.SUPABASE_DB_URL || '')) {
      try {
        // 预处理payload，将空日期字符串转换为null
        const processedPayload: any = {}
        for (const k in payload) {
          const value = (payload as any)[k]
          const isDate = ['received_date','demand_date','completed_date','production_date'].includes(k)
          const isText = ['inventory_number','production_unit','category','project_name','recorder'].includes(k)
          if (isDate) {
            const sv = typeof value === 'string' ? value.trim() : value
            processedPayload[k] = (!sv) ? null : sv
          } else if (isText) {
            const sv = typeof value === 'string' ? value.trim() : value
            processedPayload[k] = (sv === '') ? null : sv
          } else {
            processedPayload[k] = value
          }
        }
        
        const keys = Object.keys(processedPayload)
        const values = keys.map(k => processedPayload[k])
        const mod = await import('pg') as any
        const PgClient = (mod.Client || mod.default?.Client)
        const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
        await client.connect()
        const colsSql = keys.map((k, i) => {
          const isDate = ['received_date','demand_date','completed_date','production_date'].includes(k)
          return isDate ? `$${i + 1}::date` : `$${i + 1}`
        }).join(', ')
        const sql = `INSERT INTO tooling_info (${keys.join(',')}) VALUES (${colsSql}) RETURNING id`
        const r = await client.query(sql, values)
        await client.end()
        const row = (r.rows || [])[0]
        if (row?.id) {
          try {
            const mod2 = await import('pg') as any
            const PgClient2 = (mod2.Client || mod2.default?.Client)
            const client2 = new PgClient2({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
            await client2.connect()
            const r2 = await client2.query('SELECT * FROM tooling_info WHERE id = $1', [row.id])
            await client2.end()
            const full = (r2.rows || [])[0]
            if (full) return res.json({ success: true, data: full })
            return res.json({ success: true, data: { id: row.id } })
          } catch (e2: any) {
            return res.json({ success: true, data: { id: row.id } })
          }
        }
        return res.status(500).json({ success: false, error: '插入失败' })
      } catch (e: any) {
        console.error('PG fallback insert error:', e)
        return res.status(500).json({ success: false, error: e?.message || '服务器错误' })
      }
    }
    // 重复盘存编号，直接返回已存在记录
    if (code === '23505' && inv) {
      try {
        const { data: dup } = await supabase.from('tooling_info').select('*').eq('inventory_number', inv).limit(1)
        if (Array.isArray(dup) && dup[0]) return res.json({ success: true, data: dup[0] })
      } catch {}
    }
    const hint = '请检查必填字段与唯一约束，或执行迁移 20251112_relax_tooling_nullable.sql'
    return res.status(500).json({ success: false, error: msg, code, hint });
  }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Create tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 更新工装信息
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    // Prefer PG direct update for single-field updates to avoid schema cache issues
    const keys = Object.keys(payload || {})
    const allowed = ['inventory_number','production_unit','category','project_name','received_date','demand_date','completed_date','recorder']
    if (keys.length === 1 && allowed.includes(keys[0]) && (process.env.SUPABASE_DB_URL || '')) {
      try {
        const k = keys[0]
        let v = (payload as any)[k]
        // 处理日期字段的空字符串
        const isDate = ['received_date','demand_date','completed_date'].includes(k)
        if (isDate && (!v || v.trim() === '')) {
          v = null
        }
        const mod = await import('pg') as any
        const PgClient = (mod.Client || mod.default?.Client)
        const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
        await client.connect()
        const sql = `UPDATE tooling_info SET ${k} = ${isDate ? '$1::date' : '$1'} WHERE id = $2 RETURNING id`
        const r = await client.query(sql, [v ?? null, id])
        await client.end()
        const row = (r.rows || [])[0]
        if (row) return res.json({ success: true })
      } catch (e: any) {
        console.error('PG preferred update error:', e)
      }
      // fallthrough to supabase if pg preferred path did not succeed
    }

    const { data, error } = await supabase
      .from('tooling_info')
      .update(payload)
      .eq('id', id)
      .select(); // 返回数组

    if (error) {
      const code = String((error as any)?.code || '')
      const msg = String((error as any)?.message || '')
      const keys = Object.keys(payload || {})
      const k = keys[0]
      const v = (payload as any)[k]
      const allowed = ['inventory_number','production_unit','category','project_name','received_date','demand_date','completed_date']
      if (keys.length === 1 && allowed.includes(k) && (process.env.SUPABASE_DB_URL || '')) {
        try {
          // 处理日期字段的空字符串
          let processedV = v
          const isDate = ['received_date','demand_date','completed_date'].includes(k)
          if (isDate && (!v || v.trim() === '')) {
            processedV = null
          }
          const mod = await import('pg') as any
          const PgClient = (mod.Client || mod.default?.Client)
          const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
          await client.connect()
          const sql = `UPDATE tooling_info SET ${k} = ${isDate ? '$1::date' : '$1'} WHERE id = $2 RETURNING id`
          const r = await client.query(sql, [processedV ?? null, id])
          await client.end()
          const row = (r.rows || [])[0]
          if (row) return res.json({ success: true })
          return res.status(404).json({ success: false, error: '记录不存在或未更新' })
        } catch (e: any) {
          console.error('PG fallback update error:', e)
          return res.status(500).json({ success: false, error: e?.message || '服务器错误' })
        }
      }
      console.error('Update tooling_info error:', error);
      return res.status(500).json({ success: false, error: msg, code });
    }

    const arr = Array.isArray(data) ? data : [];
    if (arr.length === 0) {
      const { data: exists, error: selErr } = await supabase
        .from('tooling_info')
        .select('*')
        .eq('id', id)
        .limit(1);
      if (selErr) {
        console.error('Select tooling_info after update error:', selErr);
        return res.status(500).json({ success: false, error: selErr.message, code: selErr.code });
      }
      if ((exists || []).length === 0) {
        return res.status(404).json({ success: false, error: '记录不存在或未更新' });
      }
      return res.json({ success: true, data: (exists as any)[0] });
    }

    res.json({ success: true, data: arr[0] });
  } catch (err) {
    console.error('Update tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 获取某工装的零件列表
router.get('/:id/parts', async (req, res) => {
  try {
    const { id } = req.params;
    try {
      const sel = [
        'id','tooling_id','part_inventory_number','part_drawing_number','part_name','part_quantity',
        'material_id','material_source_id','part_category','specifications','weight','unit_price',
        'total_price','remarks','process_route'
      ].join(',')
      const { data, error } = await supabase
          .from('parts_info')
          .select(`${sel}, material:materials(*), material_source:material_sources(*)`)
          .eq('tooling_id', id)
          .order('part_inventory_number', { ascending: true });
      if (error) throw error
      return res.json({ success: true, items: data || [] })
    } catch (e: any) {
      console.warn('[Tooling] Supabase parts fetch failed, falling back to PG:', e?.message)
      try {
        const sql = `SELECT p.*, row_to_json(m) AS material, row_to_json(s) AS material_source FROM parts_info p LEFT JOIN materials m ON p.material_id = m.id LEFT JOIN material_sources s ON p.material_source_id = s.id WHERE p.tooling_id = $1 ORDER BY p.part_inventory_number ASC`
        const r = await query(sql, [id])
        return res.json({ success: true, items: r.rows || [] })
      } catch (pgErr: any) {
        console.error('[Tooling] PG parts fetch error:', pgErr)
        return res.status(500).json({ success: false, error: pgErr?.message || '服务器错误' })
      }
    }
  } catch (err) {
    console.error('Get parts route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 新增零件
router.post('/:id/parts', async (req, res) => {
  try {
    const { id } = req.params;
    let payload = { ...(req.body || {}), tooling_id: id };

    // 清理空的UUID字段，避免数据库错误
    if (payload.material_id === '') {
      delete payload.material_id;
    }
    if (payload.material_source_id === '' || payload.material_source_id === null) {
      delete payload.material_source_id;
    }
    
    // 清理integer字段的空字符串，避免数据库错误
    if (payload.part_quantity === '' || payload.part_quantity === null) {
      delete payload.part_quantity;
    }
    if (payload.weight === '' || payload.weight === null) {
      delete payload.weight;
    }

    // 清理分类字段的空字符串
    if (payload.part_category === '' || payload.part_category === null) {
      delete payload.part_category;
    }

    // 补齐材料来源：如果没有提供 material_source_id，但提供了 source 名称，则按名称匹配 material_sources 的 id
    try {
      const srcNameRaw = String((payload as any).material_source_id ? '' : ((payload as any).source || '')).trim()
      if (!payload.material_source_id && srcNameRaw) {
        const { data: srcs } = await supabase.from('material_sources').select('id, name').order('name')
        const match = (srcs || []).find((s: any) => String(s.name).trim() === srcNameRaw)
        if (match?.id) {
          (payload as any).material_source_id = match.id
        }
      }
    } catch {}

    // 如果有内容但没有盘存编号，尝试自动生成
    if ((payload.part_drawing_number || payload.part_name || payload.part_quantity) && !payload.part_inventory_number) {
      console.log('尝试为零件自动生成盘存编号...');
      
      // 获取父级工装的盘存编号
      const { data: toolingData, error: toolingError } = await supabase
        .from('tooling_info')
        .select('inventory_number')
        .eq('id', id)
        .single();
      
      if (!toolingError && toolingData?.inventory_number) {
        // 获取该工装下的所有零件数量，用于生成序号
        const { data: existingParts, error: countError } = await supabase
          .from('parts_info')
          .select('part_inventory_number')
          .eq('tooling_id', id);
        if (!countError) {
          const prefix = String(toolingData.inventory_number);
          const used = new Set<number>();
          (existingParts || []).forEach((p: any) => {
            const v = String(p.part_inventory_number || '').trim();
            if (v && v.startsWith(prefix)) {
              const n = Number(v.slice(prefix.length));
              if (Number.isFinite(n)) used.add(n);
            }
          });
          let s = 1;
          while (used.has(s)) s++;
          const newInventoryNumber = `${prefix}${String(s).padStart(2, '0')}`;
          payload.part_inventory_number = newInventoryNumber;
          console.log(`自动生成盘存编号: ${newInventoryNumber}`);
        }
      }
    }

    const { data, error } = await supabase
      .from('parts_info')
      .insert([payload])
      .select()
      .single();

    if (error) {
      if ((error as any).code === '23505') {
        return res.status(400).json({ success: false, error: '盘存编号已存在，不允许重复', code: error.code });
      }
      console.error('Create parts_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Create part route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

  // 更新零件
  router.put('/parts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    
    console.log('更新零件请求:', {
      partId: id,
      payload: payload
    });

    // 清理空字符串的字段，避免数据库错误
    const cleanedPayload = { ...payload };
    
    // 清理UUID字段的空字符串
    if (cleanedPayload.material_id === '') {
      delete cleanedPayload.material_id;
    }
    if (cleanedPayload.material_source_id === '' || cleanedPayload.material_source_id === null) {
      delete cleanedPayload.material_source_id;
    }
    
    // 清理分类字段的空字符串
    if (cleanedPayload.part_category === '' || cleanedPayload.part_category === null) {
      delete cleanedPayload.part_category;
    }
    
    // 清理integer字段的空字符串
    if (cleanedPayload.part_quantity === '' || cleanedPayload.part_quantity === null) {
      delete cleanedPayload.part_quantity;
    }
    if (cleanedPayload.weight === '' || cleanedPayload.weight === null) {
      delete cleanedPayload.weight;
    }
    
    console.log('清理后的payload:', cleanedPayload);

    // 如果没有提供盘存编号但有内容，尝试自动生成一个唯一的盘存编号
    try {
      const hasContent = (cleanedPayload.part_drawing_number || cleanedPayload.part_name || cleanedPayload.part_quantity)
      const noInv = !cleanedPayload.part_inventory_number || String(cleanedPayload.part_inventory_number).trim() === ''
      if (hasContent && noInv) {
        const { data: partRow } = await supabase
          .from('parts_info')
          .select('tooling_id')
          .eq('id', id)
          .limit(1)
        const toolingId = Array.isArray(partRow) && partRow[0]?.tooling_id
        if (toolingId) {
          const { data: toolingData } = await supabase
            .from('tooling_info')
            .select('inventory_number')
            .eq('id', toolingId)
            .single()
          const prefix = String(toolingData?.inventory_number || '').trim()
          if (prefix) {
            const { data: existingParts } = await supabase
              .from('parts_info')
              .select('part_inventory_number')
              .eq('tooling_id', toolingId)
            const used = new Set<number>()
            (existingParts || []).forEach((p: any) => {
              const v = String(p.part_inventory_number || '').trim()
              if (v && v.startsWith(prefix)) {
                const n = Number(v.slice(prefix.length))
                if (Number.isFinite(n)) used.add(n)
              }
            })
            let s = 1
            while (used.has(s)) s++
            cleanedPayload.part_inventory_number = `${prefix}${String(s).padStart(2, '0')}`
            console.log('更新时自动生成盘存编号:', cleanedPayload.part_inventory_number)
          }
        }
      }
    } catch (genErr) {
      console.warn('更新时自动生成盘存编号失败:', genErr)
    }

    const { data, error } = await supabase
      .from('parts_info')
      .update(cleanedPayload)
      .eq('id', id)
      .select(); // 返回数组

    if (error) {
      if ((error as any).code === '23505') {
        return res.status(400).json({ success: false, error: '盘存编号已存在，不允许重复', code: error.code });
      }
      console.error('Update parts_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    const arr = Array.isArray(data) ? data : [];
    if (arr.length === 0) {
      const { data: exists, error: selErr } = await supabase
        .from('parts_info')
        .select('*')
        .eq('id', id)
        .limit(1);
      if (selErr) {
        console.error('Select parts_info after update error:', selErr);
        return res.status(500).json({ success: false, error: selErr.message, code: selErr.code });
      }
      if ((exists || []).length === 0) {
        return res.status(404).json({ success: false, error: '记录不存在或未更新' });
      }
      console.log('零件更新成功 (回查):', exists[0]);
      return res.json({ success: true, data: (exists as any)[0] });
    }

    console.log('零件更新成功:', arr[0]);

    // 联动更新采购单的总重量与总金额，确保审批端与工装信息一致
    try {
      const partRow = arr[0];
      const qty = Number(partRow?.part_quantity || 0);
      const unitW = Number(partRow?.weight || 0);
      const totalW = qty > 0 && unitW > 0 ? Math.round(qty * unitW * 1000) / 1000 : null;

      let unitPrice: number | null = null;
      const materialId = partRow?.material_id;
      if (materialId) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: prices } = await supabase
          .from('material_prices')
          .select('unit_price,effective_start_date,effective_end_date')
          .eq('material_id', materialId)
          .order('effective_start_date', { ascending: false });
        if (Array.isArray(prices) && prices.length > 0) {
          const applicable = prices.find((p: any) => (!p.effective_end_date || p.effective_end_date >= today) && p.effective_start_date <= today) || prices[0];
          unitPrice = Number(applicable?.unit_price || 0);
        }
      }
      if (unitPrice === null) unitPrice = 50; // 回退单价
      const totalPrice = totalW && unitPrice ? Math.round(totalW * unitPrice * 100) / 100 : null;

      await supabase
        .from('purchase_orders')
        .update({ weight: totalW, total_price: totalPrice })
        .eq('part_id', id);
      console.log(`[Tooling] 联动更新采购单成功 part_id=${id}, weight=${totalW}, total_price=${totalPrice}`);
    } catch (linkErr) {
      console.warn('[Tooling] 联动更新采购单失败:', linkErr);
    }

    res.json({ success: true, data: arr[0] });
  } catch (err) {
    console.error('Update part route error', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 批量写入工艺路线（按子表盘存编号）
router.post('/parts/process-routes', async (req, res) => {
  try {
    const { mappings } = req.body || {}
    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ success: false, error: '缺少工艺路线映射' })
    }
    let updated = 0
    for (const m of mappings) {
      const inv = String(m.part_inventory_number || '').trim()
      const drawing = String(m.part_drawing_number || '').trim()
      const route = String(m.process_route || '').trim()
      if ((!inv && !drawing) || !route) continue
      try {
        let q = supabase.from('parts_info').update({ process_route: route })
        if (inv) q = q.eq('part_inventory_number', inv)
        else q = q.eq('part_drawing_number', drawing)
        const { error } = await q
        if (error) throw error
        updated++
      } catch (e: any) {
        // PG fallback
        try {
          let r
          if (inv) {
            r = await query('UPDATE parts_info SET process_route = $1 WHERE part_inventory_number = $2', [route, inv])
          } else {
            r = await query('UPDATE parts_info SET process_route = $1 WHERE part_drawing_number = $2', [route, drawing])
          }
          updated += r.rowCount || 0
        } catch (pgErr) {
          console.warn('[Tooling] process-route update failed for', inv || drawing, pgErr)
        }
      }
    }
    return res.json({ success: true, updated })
  } catch (err) {
    console.error('Batch set process routes error:', err)
    return res.status(500).json({ success: false, error: '服务器错误' })
  }
})

// 批量获取工装的编制信息（技术员标识）
router.get('/batch', async (req, res) => {
  try {
    const idsParam = (req.query.ids || []) as string[] | string
    const ids = Array.isArray(idsParam) ? idsParam : String(idsParam || '').split(',').filter(Boolean)
    if (!ids.length) {
      return res.json({ success: true, items: [] })
    }

    const { data, error } = await supabase
      .from('tooling_info')
      .select('id, responsible_person_id, recorder')
      .in('id', ids)

    if (error) {
      console.error('Fetch tooling batch error:', error)
      return res.status(500).json({ success: false, error: '查询编制信息失败' })
    }

    const items = (data || []).map((t: any) => ({
      id: String(t.id || ''),
      responsible_person_id: String(t.responsible_person_id || ''),
      recorder: String(t.recorder || '')
    }))
    res.json({ success: true, items })
  } catch (err: any) {
    console.error('Tooling batch route error:', err)
    res.status(500).json({ success: false, error: '服务器错误' })
  }
})

// 列出所有盘存编号及零件基本信息（分页）
router.get('/parts/inventory-list', async (req, res) => {
  try {
    const { page = '1', pageSize = '50', search = '' } = req.query as Record<string, string>
    const pageNum = Math.max(parseInt(page, 10) || 1, 1)
    const sizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200)
    const from = (pageNum - 1) * sizeNum
    const to = from + sizeNum - 1
    let q = supabase
      .from('parts_info')
      .select('id, part_inventory_number, part_name, part_drawing_number, tooling_id, process_route', { count: 'exact' })
      .order('part_inventory_number', { ascending: true })
    if (search && search.trim()) {
      const keyword = `%${search.trim()}%`
      q = q.or(`part_inventory_number.ilike.${keyword},part_name.ilike.${keyword},part_drawing_number.ilike.${keyword}`)
    }
    q = q.range(from, to)
    const { data, error, count } = await q
    if (error) throw error
    res.json({ success: true, items: data || [], total: count || 0, page: pageNum, pageSize: sizeNum })
  } catch (err: any) {
    console.error('Inventory list error:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 记录工时
router.post('/work-hours', async (req, res) => {
  try {
    const payload = req.body || {}
    const required = ['part_inventory_number']
    for (const k of required) {
      if (!payload[k]) return res.status(400).json({ success: false, error: `缺少必填字段: ${k}` })
    }
    // Apply team coefficients if available (operator -> users.team_id -> teams.aux_coeff/proc_coeff)
    let auxCoeff = 1, procCoeff = 1
    try {
      const { data: usr } = await supabase.from('users').select('id, team_id').ilike('real_name', payload.operator || '').limit(1)
      const userRow = Array.isArray(usr) ? usr[0] : null
      if (userRow?.team_id) {
        const { data: team } = await supabase.from('teams').select('aux_coeff, proc_coeff').eq('id', userRow.team_id).single()
        if (team) {
          auxCoeff = Number(team.aux_coeff || 1) || 1
          procCoeff = Number(team.proc_coeff || 1) || 1
        }
      }
    } catch {}

    const adjustedHours = Number(payload.aux_hours || 0) * auxCoeff + Number(payload.proc_hours || 0) * procCoeff

    // Device time order validation: ensure current start is after previous finish for same device
    try {
      const deviceNo = String(payload.device_no || '').trim()
      if (deviceNo) {
        const { data: prevList } = await supabase
          .from('work_hours')
          .select('work_date, aux_end_time, proc_hours')
          .eq('device_no', deviceNo)
          .order('created_at', { ascending: false })
          .limit(1)
        const prev = Array.isArray(prevList) ? prevList[0] : null
        if (prev) {
          if (!prev.aux_end_time) {
            return res.status(400).json({ success: false, error: '该设备上一个作业尚未结束，请先补充结束时间或删除后再提交' })
          }
          const pad = (n: number) => String(n).padStart(2, '0')
          const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
          const endMin = toMin(prev.aux_end_time as any)
          const pm = Math.round(Number((prev as any).proc_hours || 0) * 60)
          const compTotal = endMin + pm
          const daysAdd = Math.floor(compTotal / 1440)
          const comp = compTotal % 1440
          const hh = Math.floor(comp / 60)
          const mi = comp % 60
          const prevDateStr = String((prev as any).work_date)
          const prevEndTs = new Date(`${prevDateStr}T${pad(hh)}:${pad(mi)}:00`).getTime() + daysAdd * 86400000
          if (payload.work_date && payload.aux_start_time) {
            const currStartTs = new Date(`${payload.work_date}T${payload.aux_start_time}:00`).getTime()
            if (currStartTs < prevEndTs) {
              return res.status(400).json({ success: false, error: '本次辅助起始时间早于该设备上一次结束时间，请调整后再提交' })
            }
          }
        }
      }
    } catch {}

    // Operator overlap validation across devices: prevent overlapping auxiliary intervals
    try {
      const operator = String(payload.operator || '').trim()
      const deviceNo = String(payload.device_no || '').trim()
      const workDate = String(payload.work_date || '').trim()
      const startTime = String(payload.aux_start_time || '').trim()
      const endTime = String(payload.aux_end_time || '').trim()
      if (operator && workDate && startTime) {
        const dayjs = (await import('dayjs')).default as any
        const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
        const sMin = toMin(startTime)
        const eMinRaw = endTime ? toMin(endTime) : null
        const eMin = eMinRaw !== null ? eMinRaw : sMin // fallback same minute if no end provided
        const currStartTs = dayjs(workDate).hour(Math.floor(sMin/60)).minute(sMin%60).valueOf()
        const addDay = eMin < sMin ? 1 : 0
        const currEndTs = dayjs(workDate).add(addDay, 'day').hour(Math.floor(eMin/60)).minute(eMin%60).valueOf()
        const prevDay = dayjs(workDate).subtract(1,'day').format('YYYY-MM-DD')
        const nextDay = dayjs(workDate).add(1,'day').format('YYYY-MM-DD')
        const { data: rows } = await supabase
          .from('work_hours')
          .select('work_date, aux_start_time, aux_end_time, device_no')
          .eq('operator', operator)
          .gte('work_date', prevDay)
          .lte('work_date', nextDay)
          .order('created_at', { ascending: false })
        for (const r of (rows || [])) {
          const otherDevice = String((r as any).device_no || '')
          if (otherDevice && deviceNo && otherDevice === deviceNo) continue
          const osMin = toMin((r as any).aux_start_time || '')
          const oeMinRaw = (r as any).aux_end_time ? toMin((r as any).aux_end_time) : null
          if (osMin === 0 && oeMinRaw === null) continue
          const oStartTs = dayjs((r as any).work_date).hour(Math.floor(osMin/60)).minute(osMin%60).valueOf()
          const oAddDay = (oeMinRaw !== null && oeMinRaw < osMin) ? 1 : 0
          const oEndTs = (oeMinRaw !== null)
            ? dayjs((r as any).work_date).add(oAddDay, 'day').hour(Math.floor(oeMinRaw/60)).minute(oeMinRaw%60).valueOf()
            : Number.MAX_SAFE_INTEGER // treat missing end as still ongoing
          const overlap = (currStartTs < oEndTs) && (currEndTs > oStartTs)
          if (overlap) {
            return res.status(400).json({ success: false, error: '该操作者辅助时间与其他设备作业重叠，请调整时间后再提交' })
          }
        }
      }
    } catch {}

    const insertBody = { ...payload, hours: adjustedHours }
    try {
      const { data, error } = await supabase
        .from('work_hours')
        .insert([insertBody])
        .select('*')
        .single()
      if (error) throw error
      res.json({ success: true, data })
    } catch (e: any) {
      try {
        const keys = Object.keys(insertBody)
        const values = keys.map(k => (insertBody as any)[k])
        const mod = await import('pg') as any
        const PgClient = (mod.Client || mod.default?.Client)
        const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
        await client.connect()
        const colsSql = keys.map((k, i) => {
          if (k === 'work_date') return `$${i + 1}::date`
          if (k === 'aux_start_time' || k === 'aux_end_time') return `$${i + 1}::time`
          return `$${i + 1}`
        }).join(', ')
        const sql = `INSERT INTO work_hours (${keys.join(',')}) VALUES (${colsSql}) RETURNING *`
        const r = await client.query(sql, values)
        await client.end()
        const row = (r.rows || [])[0]
        if (row) return res.json({ success: true, data: row })
        return res.status(500).json({ success: false, error: '插入失败' })
      } catch (pgErr: any) {
        console.error('PG fallback insert work_hours error:', pgErr)
        return res.status(500).json({ success: false, error: pgErr?.message || '服务器错误' })
      }
    }
  } catch (err: any) {
    console.error('Create work hour error:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 获取工时记录与统计
router.get('/work-hours', async (req, res) => {
  try {
    const {
      page = '1',
      pageSize = '50',
      start_date = '',
      end_date = '',
      operator = '',
      search = '',
      shift = '',
      order = 'work_date',
      order_dir = 'desc'
    } = req.query as Record<string, string>

    const pageNum = Math.max(parseInt(page, 10) || 1, 1)
    const sizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200)
    const from = (pageNum - 1) * sizeNum
    const to = from + sizeNum - 1

    // Supabase查询，失败则PG回退
    let items: any[] = []
    let totalCount: number | null = null
    try {
      let q = supabase
        .from('work_hours')
        .select('*', { count: 'exact' })

      if (start_date) q = q.gte('work_date', start_date)
      if (end_date) q = q.lte('work_date', end_date)
      if (operator && operator.trim()) q = q.ilike('operator', `%${operator.trim()}%`)
      if (shift && shift.trim()) q = q.eq('shift', shift.trim())
      if (search && search.trim()) {
        const keyword = `%${search.trim()}%`
        q = q.or(`part_inventory_number.ilike.${keyword},part_drawing_number.ilike.${keyword},process_name.ilike.${keyword},device_no.ilike.${keyword}`)
      }
      q = q.order(order, { ascending: order_dir !== 'desc' })
      q = q.range(from, to)
      const { data, error, count } = await q
      if (error) throw error
      items = Array.isArray(data) ? data : []
      totalCount = typeof count === 'number' ? count : null
    } catch (sbErr: any) {
      if (process.env.SUPABASE_DB_URL) {
        try {
          const mod = await import('pg') as any
          const PgClient = (mod.Client || mod.default?.Client)
          const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
          await client.connect()
          const conds: string[] = []
          const params: any[] = []
          let pi = 1
          if (start_date) { conds.push(`work_date >= $${pi++}`); params.push(start_date) }
          if (end_date) { conds.push(`work_date <= $${pi++}`); params.push(end_date) }
          if (operator && operator.trim()) { conds.push(`operator ILIKE $${pi++}`); params.push(`%${operator.trim()}%`) }
          if (shift && shift.trim()) { conds.push(`shift = $${pi++}`); params.push(shift.trim()) }
          if (search && search.trim()) {
            const kw = `%${search.trim()}%`
            conds.push(`(part_inventory_number ILIKE $${pi} OR part_drawing_number ILIKE $${pi} OR process_name ILIKE $${pi} OR device_no ILIKE $${pi})`)
            params.push(kw); pi++
          }
          const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
          const orderSql = `ORDER BY ${order} ${order_dir?.toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`
          const sql = `SELECT * FROM work_hours ${whereSql} ${orderSql} OFFSET $${pi} LIMIT $${pi + 1}`
          params.push(from, sizeNum)
          const r = await client.query(sql, params)
          items = r.rows || []
          const rc = await client.query(`SELECT COUNT(*) AS c FROM work_hours ${whereSql}`, params.slice(0, pi - 1))
          await client.end()
          totalCount = Number((rc.rows || [])[0]?.c || items.length)
        } catch (pgErr: any) {
          console.error('PG fallback get work hours failed:', pgErr)
          return res.status(500).json({ success: false, error: sbErr?.message || pgErr?.message || '服务器错误' })
        }
      } else {
        console.error('Supabase get work hours error:', sbErr)
        return res.status(500).json({ success: false, error: sbErr?.message || '服务器错误' })
      }
    }

    const totals = items.reduce(
      (acc: any, r: any) => {
        acc.total_hours += Number(r.hours || 0)
        acc.aux_hours += Number(r.aux_hours || 0)
        acc.proc_hours += Number(r.proc_hours || 0)
        acc.completed_quantity += Number(r.completed_quantity || 0)
        return acc
      },
      { total_hours: 0, aux_hours: 0, proc_hours: 0, completed_quantity: 0 }
    )

    res.json({
      success: true, items: items, total: (totalCount ?? items.length), page: pageNum, pageSize: sizeNum, totals
    })
  } catch (err: any) {
    console.error('Get work hours error:', err)
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/work-hours/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ success: false, error: '缺少记录ID' })
    const { error } = await supabase.from('work_hours').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 批量删除工时记录
router.post('/work-hours/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {}
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' })
    }
    try {
      const { error } = await supabase.from('work_hours').delete().in('id', ids)
      if (error) throw error
      return res.json({ success: true, deleted: ids.length })
    } catch (e: any) {
      // PG fallback
      try {
        const mod = await import('pg') as any
        const PgClient = (mod.Client || mod.default?.Client)
        const client = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
        await client.connect()
        const sql = 'DELETE FROM work_hours WHERE id = ANY($1)'
        const r = await client.query(sql, [ids])
        await client.end()
        return res.json({ success: true, deleted: r.rowCount || 0 })
      } catch (pgErr: any) {
        return res.status(500).json({ success: false, error: pgErr?.message || '服务器错误' })
      }
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 设备管理
router.get('/devices', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('devices').select('*').order('device_no', { ascending: true })
    if (error) throw error
    res.json({ success: true, items: data || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 用户基础信息映射：操作者 → 车间/班组
router.get('/users/basic', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id, real_name, workshop_id, team_id, capability_coeff')
    if (error) throw error
    const workshopIds = [...new Set((data || []).map((u: any) => u.workshop_id).filter(Boolean))]
    const teamIds = [...new Set((data || []).map((u: any) => u.team_id).filter(Boolean))]
    let workshops: any[] = []
    let teams: any[] = []
    if (workshopIds.length) {
      const ws = await supabase.from('workshops').select('id, name').in('id', workshopIds)
      workshops = ws.data || []
    }
    if (teamIds.length) {
      const ts = await supabase.from('teams').select('id, name, aux_coeff, proc_coeff').in('id', teamIds)
      teams = ts.data || []
    }
    const wmap = Object.fromEntries(workshops.map((w: any) => [w.id, w.name]))
    const tmap = Object.fromEntries(teams.map((t: any) => [t.id, { name: t.name, aux_coeff: t.aux_coeff, proc_coeff: t.proc_coeff }]))
    const items = (data || []).map((u: any) => ({
      real_name: u.real_name,
      workshop: wmap[u.workshop_id] || '',
      team: (tmap[u.team_id] || {}).name || '',
      aux_coeff: Number((tmap[u.team_id] || {}).aux_coeff ?? 1),
      proc_coeff: Number((tmap[u.team_id] || {}).proc_coeff ?? 1),
      capability_coeff: Number(u.capability_coeff ?? 1)
    }))
    res.json({ success: true, items })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 组织机构：车间
router.get('/org/workshops', async (req, res) => {
  try {
    const { company_id } = req.query as any
    let q = supabase.from('workshops').select('id, company_id, name').order('name', { ascending: true })
    if (company_id) q = q.eq('company_id', String(company_id))
    const { data, error } = await q
    if (error) throw error
    res.json({ success: true, items: data || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/org/workshops', async (req, res) => {
  try {
    const payload = req.body || {}
    if (!payload.company_id || !payload.name) return res.status(400).json({ success: false, error: '缺少公司或名称' })
    const { data, error } = await supabase.from('workshops').insert([payload]).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.put('/org/workshops/:id', async (req, res) => {
  try {
    const { id } = req.params
    const payload = req.body || {}
    const { data, error } = await supabase.from('workshops').update(payload).eq('id', id).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/org/workshops/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('workshops').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// 组织机构：班组
router.get('/org/teams', async (req, res) => {
  try {
    const { company_id, workshop_id } = req.query as any
    let q = supabase
      .from('teams')
      .select('id, company_id, workshop_id, name, aux_coeff, proc_coeff')
      .order('name', { ascending: true })
    if (company_id) q = q.eq('company_id', String(company_id))
    if (workshop_id) q = q.eq('workshop_id', String(workshop_id))
    const { data, error } = await q
    if (error) throw error
    res.json({ success: true, items: data || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/org/teams', async (req, res) => {
  try {
    const payload = req.body || {}
    if (!payload.company_id || !payload.name) return res.status(400).json({ success: false, error: '缺少公司或名称' })
    const body = {
      company_id: payload.company_id,
      workshop_id: payload.workshop_id || null,
      name: payload.name,
      aux_coeff: Number(payload.aux_coeff ?? 1),
      proc_coeff: Number(payload.proc_coeff ?? 1)
    }
    const { data, error } = await supabase.from('teams').insert([body]).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.put('/org/teams/:id', async (req, res) => {
  try {
    const { id } = req.params
    const payload = req.body || {}
    const body: any = {}
    if (payload.name !== undefined) body.name = payload.name
    if (payload.workshop_id !== undefined) body.workshop_id = payload.workshop_id
    if (payload.aux_coeff !== undefined) body.aux_coeff = Number(payload.aux_coeff)
    if (payload.proc_coeff !== undefined) body.proc_coeff = Number(payload.proc_coeff)
    const { data, error } = await supabase.from('teams').update(body).eq('id', id).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/org/teams/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// Fixed inventory options (repair management)
router.get('/fixed-inventory-options', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('fixed_inventory_options').select('*').order('created_at', { ascending: true })
    if (error) throw error
    res.json({ success: true, items: data || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.post('/fixed-inventory-options', async (req, res) => {
  try {
    const payload = req.body || {}
    if (!payload.option_value) return res.status(400).json({ success: false, error: '缺少选项值' })
    const option_label = payload.option_label || payload.option_value
    const { data, error } = await supabase.from('fixed_inventory_options').insert([{ option_value: payload.option_value, option_label, is_active: !!payload.is_active }]).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.put('/fixed-inventory-options/:id', async (req, res) => {
  try {
    const { id } = req.params
    const payload = req.body || {}
    const option_label = payload.option_label || payload.option_value
    const { data, error } = await supabase.from('fixed_inventory_options').update({ option_value: payload.option_value, option_label, is_active: !!payload.is_active }).eq('id', id).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/fixed-inventory-options/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('fixed_inventory_options').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})
router.post('/devices', async (req, res) => {
  try {
    const payload = req.body || {}
    if (!payload.device_no || !payload.device_name) return res.status(400).json({ success: false, error: '缺少设备编号或名称' })
    const { data, error } = await supabase.from('devices').insert([payload]).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.put('/devices/:id', async (req, res) => {
  try {
    const { id } = req.params
    const payload = req.body || {}
    const { data, error } = await supabase.from('devices').update(payload).eq('id', id).select('*').single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

router.delete('/devices/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('devices').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '服务器错误' })
  }
})

// GET /api/tooling/batch
// 批量获取工装信息（用于获取编制信息）
router.get('/batch', async (req, res) => {
  try {
    // 从查询参数中获取ids数组 - Express将重复的查询参数解析为数组
    const ids = req.query.ids;
    
    if (!ids) {
      return res.status(400).json({ success: false, error: '缺少工装ID列表' });
    }

    // 确保ids是数组格式
    let idArray: string[];
    if (Array.isArray(ids)) {
      idArray = ids as string[];
    } else if (typeof ids === 'string') {
      idArray = [ids];
    } else {
      return res.status(400).json({ success: false, error: '工装ID格式不正确' });
    }

    if (idArray.length === 0) {
      return res.status(400).json({ success: false, error: '缺少工装ID列表' });
    }

    // 去重ID
    const uniqueIds = [...new Set(idArray)];
    console.log(`[Tooling Batch] Fetching responsible person for ${uniqueIds.length} tooling IDs:`, uniqueIds);
    
    const { data, error } = await supabase
      .from('tooling_info')
      .select('id, responsible_person_id, recorder')
      .in('id', uniqueIds);

    if (error) {
      console.error('Batch fetch tooling_info error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    console.log(`[Tooling Batch] Successfully fetched ${data?.length || 0} tooling records`);

    res.json({
      success: true,
      items: data || []
    });
  } catch (err) {
    console.error('Batch tooling route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 获取某工装的标准件列表
router.get('/:id/child-items', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
          .from('child_items')
          .select('*')
          .eq('tooling_id', id)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Fetch child_items error:', error);
          return res.status(500).json({ success: false, error: error.message, code: error.code });
        }

        res.json({ success: true, items: data || [] });
  } catch (err) {
    console.error('Get child items route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 新增标准件
router.post('/:id/child-items', async (req, res) => {
  try {
    const { id } = req.params;
    let payload = { ...(req.body || {}), tooling_id: id };

    // 清理空字符串字段，避免数据库错误
    if (payload.name === '') {
      delete payload.name;
    }
    if (payload.model === '') {
      delete payload.model;
    }
    if (payload.unit === '') {
      delete payload.unit;
    }
    if (payload.required_date === '') {
      delete payload.required_date;
    }
    if (payload.quantity === '' || payload.quantity === null) {
      delete payload.quantity;
    }

    const { data, error } = await supabase
      .from('child_items')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Create child_items error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Create child item route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 更新标准件
router.put('/child-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    
    console.log('更新标准件请求:', {
      childItemId: id,
      payload: payload
    });

    // 清理空字符串字段，避免数据库错误
    const cleanedPayload = { ...payload };
    
    if (cleanedPayload.name === '') {
      delete cleanedPayload.name;
    }
    if (cleanedPayload.model === '') {
      delete cleanedPayload.model;
    }
    if (cleanedPayload.unit === '') {
      delete cleanedPayload.unit;
    }
    if (cleanedPayload.required_date === '') {
      delete cleanedPayload.required_date;
    }
    if (cleanedPayload.quantity === '' || cleanedPayload.quantity === null) {
      delete cleanedPayload.quantity;
    }
    
    console.log('清理后的payload:', cleanedPayload);

    const { data, error } = await supabase
      .from('child_items')
      .update(cleanedPayload)
      .eq('id', id)
      .select(); // 返回数组

    if (error) {
      console.error('Update child_items error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    const arr = Array.isArray(data) ? data : [];
    if (arr.length === 0) {
      const { data: exists, error: selErr } = await supabase
        .from('child_items')
        .select('*')
        .eq('id', id)
        .limit(1);
      if (selErr) {
        console.error('Select child_items after update error:', selErr);
        return res.status(500).json({ success: false, error: selErr.message, code: selErr.code });
      }
      if ((exists || []).length === 0) {
        return res.status(404).json({ success: false, error: '记录不存在或未更新' });
      }
      console.log('标准件更新成功 (回查):', exists[0]);
      return res.json({ success: true, data: (exists as any)[0] });
    }

    console.log('标准件更新成功:', arr[0]);
    res.json({ success: true, data: arr[0] });
  } catch (err) {
    console.error('Update child item route error', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 删除单个标准件
router.delete('/child-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('child_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete child_items error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete child item route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 批量删除标准件
router.post('/child-items/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '缺少要删除的ID列表' });
    }

    const { error } = await supabase
      .from('child_items')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Batch delete child_items error:', error);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Batch delete child items route error:', err);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
