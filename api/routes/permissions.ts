import express from 'express'
import { supabase } from '../lib/supabase.js'

const router = express.Router()

// 默认权限种子
const DEFAULT_MODULES: Record<string, string[]> = {
  // 工装信息
  tooling: [
    '访问模块',
    '查看工装','搜索工装','筛选单位','筛选类别','刷新页面',
    '新增工装','编辑工装','删除工装','批量删除',
    '导出工装','导入工装信息','导入工艺卡片','导入套信息',
    '生成下料单','生成采购单',
    '查看工艺路线','编辑工艺路线',
    '更新状态',
    '标准件新增','标准件编辑','标准件删除',
    '零件新增','零件编辑','零件删除'
  ],
  // 下料管理
  cutting: [
    '访问模块',
    '查看下料','查询下料','筛选下料','分组查看','自动排序',
    '导出下料','删除下料','批量删除'
  ],
  // 采购管理
  purchase: [
    '访问模块',
    '查看采购','查询采购','导出采购','删除采购',
    '手工下单','临时计划','删除临时计划','导出单据','提交审核','撤销审核'
  ],
  // 公司管理
  company: [
    '访问模块',
    '查看公司','创建公司','编辑公司','删除公司','查看组织机构','编辑组织机构'
  ],
  // 权限管理
  permission: [
    '访问模块',
    '查看权限','编辑权限','同步权限','分配角色','创建角色','删除角色'
  ],
  // 用户管理
  user: [
    '访问模块',
    '查看用户','搜索用户','创建用户','编辑用户','禁用用户','激活用户','删除用户','重置密码','设置班组','设置车间','设置角色','设置能力系数'
  ],
  // 基础数据（材料/料型/选项）
  base_data: [
    '访问模块',
    '查看基础数据','编辑选项',
    '查看材料','创建材料','编辑材料','删除材料','导入材料','导出材料',
    '查看料型','创建料型','编辑料型','删除料型'
  ],
  // 工时录入
  work_hours_entry: [
    '访问模块',
    '录入工时','编辑工时','删除工时','提交工时','导入工时','导出工时'
  ],
  // 工时管理
  work_hours: [
    '访问模块',
    '查看工时','编辑工时','删除工时','导出工时','统计工时','审核工时'
  ]
  ,
  // 个人设置
  personal_settings: [
    '访问模块'
  ]
}

// 列出权限
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('module', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    res.json({ success: true, items: data || [] })
  } catch (err: any) {
    console.error('[Permissions] list error:', err)
    res.status(500).json({ success: false, error: err?.message || '加载权限失败' })
  }
})

// 同步默认权限种子
router.post('/sync', async (req, res) => {
  try {
    const seeds: Record<string, string[]> = req.body?.modules || DEFAULT_MODULES
    const { data: existing, error } = await supabase
      .from('permissions')
      .select('id, module, name')
    if (error) throw error

    const existSet = new Set((existing || []).map((p: any) => `${p.module}::${p.name}`))
    const toInsert: any[] = []
    const makeCode = (module: string, name: string) => {
      const normModule = String(module).trim().toLowerCase()
      const normName = String(name).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '_')
      return `${normModule}:${normName}`
    }
    Object.entries(seeds).forEach(([module, actions]) => {
      (actions || []).forEach((name) => {
        const key = `${module}::${name}`
        if (!existSet.has(key)) {
          toInsert.push({ module, name, code: makeCode(module, name), description: `${module}-${name}` })
        }
      })
    })

    let inserted = 0
    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase.from('permissions').insert(toInsert)
      if (insertErr) throw insertErr
      inserted = toInsert.length
    }

    res.json({ success: true, inserted })
  } catch (err: any) {
    console.error('[Permissions] sync error:', err)
    res.status(500).json({ success: false, error: err?.message || '同步权限失败' })
  }
})

export default router
