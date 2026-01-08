// 工装信息模块相关类型定义

// 材料信息
export interface Material {
  id: string;
  name: string;
  density: number; // 密度 g/cm³
  description?: string;
  created_at: string;
  updated_at: string;
}

// 材料价格历史
export interface MaterialPrice {
  id: string;
  material_id: string;
  unit_price: number; // 单价(元/kg)
  effective_start_date: string; // 生效开始日期
  effective_end_date?: string; // 生效结束日期（可选）
  created_at: string;
  updated_at: string;
}

// 料型信息
export interface PartType {
  id: string;
  name: string;
  description?: string;
  volume_formula?: string; // 体积计算公式
  input_format?: string; // 输入格式提示
  created_at: string;
  updated_at: string;
}

// 工装信息 (父级记录)
export interface ToolingInfo {
  id: string;
  production_unit: string; // 投产单位
  category: string; // 类别
  inventory_number: string; // 盘存编号
  project_name: string; // 项目名称
  sets_count: number; // 套数
  production_date: string; // 投产日期
  demand_date: string; // 需求日期
  receiving_date?: string; // 接收日期（用于确定材料价格）
  lead_time?: number; // 工期(自动计算)
  recorder: string; // 录入人
  created_at: string;
  updated_at: string;
  created_by?: string;
  parts?: PartsInfo[]; // 关联的零件信息
}

// 零件信息 (子级记录)
export interface PartsInfo {
  id: string;
  tooling_id: string; // 关联工装信息ID
  part_name: string; // 零件名称
  part_drawing_number: string; // 零件图号
  part_quantity?: number; // 零件数量（可选，默认为空）
  material_id: string; // 材质ID
  material?: Material; // 关联的材料信息
  part_category: '板料' | '原料' | '圆环'; // 类别
  specifications: PartSpecifications; // 规格尺寸
  specifications_text?: string; // 规格文本（用于输入和显示）
  weight?: number; // 重量(KG)，自动计算
  source: '下料' | '自备' | '外购'; // 来源
  created_at: string;
  updated_at: string;
}

// 零件规格尺寸 (根据类别不同存储不同格式)
export interface PartSpecifications {
  // 原料: φ直径*长度
  diameter?: number; // 直径(mm)
  length?: number; // 长度(mm)
  
  // 板料: 长*宽*高
  width?: number; // 宽度(mm)
  height?: number; // 高度(mm)
  
  // 圆环: φ外径-φ内径*长度
  outer_diameter?: number; // 外径(mm)
  inner_diameter?: number; // 内径(mm)
}

// 投产单位选项
export const PRODUCTION_UNITS = [
  '凯撒',
  '喜佛地',
  '其他'
] as const;

// 工装类别选项
export const TOOLING_CATEGORIES = [
  '铝锻',
  'cpc铝铸',
  '重力铸造',
  '量具',
  '刀具',
  '其他'
] as const;

// 零件类别选项
export const PART_CATEGORIES = [
  '板料',
  '原料',
  '圆环'
] as const;

// 零件来源选项
export const PART_SOURCES = [
  '下料',
  '自备',
  '外购'
] as const;

// 类别编号映射 (用于生成盘存编号)
export const CATEGORY_CODE_MAP: Record<string, string> = {
  '铝锻': 'LD',
  'cpc铝铸': 'CC',
  '重力铸造': 'GC',
  '量具': 'LJ',
  '刀具': 'DJ',
  '其他': 'QT'
};