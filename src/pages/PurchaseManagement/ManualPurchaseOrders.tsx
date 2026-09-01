import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, message, Card, Row, Col, Space, Input } from 'antd';
import { ReloadOutlined, ToolOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { InputRef } from 'antd';
import { useAuthStore } from '../../stores/authStore';
import { generatePurchaseOrders as postPurchaseOrders } from '../../services/toolingService';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import * as XLSX from 'xlsx';
import { formatSpecificationsForProduction, parseProductionSpecifications } from '../../utils/productionFormat';
import { getProductionFormatHint } from '../../utils/productionHint';
import { calculateTotalPrice } from '../../utils/priceCalculator';
import SpecificationsInput from '../../components/SpecificationsInput';
import EditableCell from '../../components/EditableCell';
import { useToolingOperations } from '../../hooks/useToolingOperations';
import { fetchWithFallback } from '../../utils/api';

// 解析体积公式并提取变量
const parseVolumeFormula = (formula: string): string[] => {
  if (!formula) return [];
  
  // 定义支持的变量
  const supportedVars = ['长', '宽', '高', '半径', '外半径', '内半径', '直径', '外径', '内径', '厚'];
  const foundVars: string[] = [];
  
  // 检查公式中包含的变量
  supportedVars.forEach(varName => {
    if (formula.includes(varName)) {
      foundVars.push(varName);
    }
  });
  
  return foundVars;
};

// 根据规格与公式计算体积（健壮版）
const calculateVolume = (rawFormula: string, specifications: Record<string, number>): number => {
  if (!rawFormula) return 0;
  try {
    // 1) 规范化公式中的字符与运算符
    let expression = rawFormula
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/[－—–﹣]/g, '-')
      .replace(/[＋﹢]/g, '+')
      .replace(/[（﹙]/g, '(')
      .replace(/[）﹚]/g, ')')
      .replace(/φ/g, '') // 移除符号前缀，避免解析错误
      .replace(/π/g, Math.PI.toString())
      .replace(/²/g, '**2');

    // 2) 支持的变量与其可能的键映射（按优先顺序查找）
    const varKeyMap: Record<string, string[]> = {
      '长': ['长', 'A', '长度'],
      '宽': ['宽', 'B', '宽度'],
      '高': ['高', 'C', '高度', 'B'],
      '厚': ['厚', 'B', '厚度'],
      '直径': ['直径', 'φA'],
      '外径': ['外径', 'φA'],
      '内径': ['内径', 'φB'],
      '半径': ['半径'],
      '外半径': ['外半径'],
      '内半径': ['内半径']
    };

    // 3) 先收集可用的数值，并补充派生量（半径等）
    const getFirst = (keys: string[]): number | undefined => {
      for (const k of keys) {
        const v = specifications[k];
        if (typeof v === 'number' && !isNaN(v)) return v;
      }
      return undefined;
    };

    const values: Record<string, number> = {};
    Object.keys(varKeyMap).forEach((varName) => {
      const v = getFirst(varKeyMap[varName]);
      if (v !== undefined) values[varName] = v;
    });

    // 派生量：半径/外半径/内半径
    if (values['直径'] !== undefined && values['半径'] === undefined) {
      values['半径'] = values['直径'] / 2;
    }
    if (values['外径'] !== undefined && values['外半径'] === undefined) {
      values['外半径'] = values['外径'] / 2;
    }
    if (values['内径'] !== undefined && values['内半径'] === undefined) {
      values['内半径'] = values['内径'] / 2;
    }

    // 4) 检查是否存在未赋值且在公式中出现的变量
    const supportedVars = Object.keys(varKeyMap).concat(['半径', '外半径', '内半径']);
    const unresolved = supportedVars.filter((varName) => {
      const appears = new RegExp(varName, 'g').test(expression);
      return appears && values[varName] === undefined;
    });
    if (unresolved.length > 0) {
      // 缺失必要变量，不计算体积
      return 0;
    }

    // 5) 将变量名替换为具体数值
    supportedVars.forEach((varName) => {
      const num = values[varName];
      if (num !== undefined) {
        const re = new RegExp(varName, 'g');
        expression = expression.replace(re, num.toString());
      }
    });

    // 6) 最终安全计算
    const result = Function('"use strict"; return (' + expression + ')')();
    return isNaN(result) ? 0 : result;
  } catch (error) {
    console.error('体积计算错误:', error);
    return 0;
  }
};



interface ManualPurchaseOrder {
  id: string;
  key?: string;
  part_name: string;
  model: string;
  part_quantity: string;
  unit: string;
  project_name: string;
  production_unit: string;
  demand_date: string;
  material_source?: string;
  created_date?: string;
  applicant?: string;
  is_manual?: boolean;
  isNew?: boolean;
}

interface BackupMaterial {
  id: string;
  key?: string;
  material_name: string;
  material?: string;
  material_type?: string;
  model: string;
  specifications?: Record<string, any>;
  quantity: string;
  unit: string;
  project_name: string;
  supplier: string;
  price: string;
  weight?: number;
  unit_price?: number;
  total_price?: number;
  demand_date: string;
  created_date?: string;
  applicant?: string;
  is_manual?: boolean;
  isNew?: boolean;
}

export default function ManualPurchaseOrders() {
  dayjs.extend(customParseFormat);
  const navigate = useNavigate();
  const { calculatePartWeight } = useToolingOperations();
  const { user } = useAuthStore();
  const [manualData, setManualData] = useState<ManualPurchaseOrder[]>([]);
  const [manualEditing, setManualEditing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedManualRowKeys, setSelectedManualRowKeys] = useState<React.Key[]>([]);
  const [productionUnits, setProductionUnits] = useState<string[]>([]);
  const lastEditingRef = useRef<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const rowH = 32;
  const [excelImporting, setExcelImporting] = useState(false);
  const [excelInputKey, setExcelInputKey] = useState(0);

  // 备用材料状态
  const [backupData, setBackupData] = useState<BackupMaterial[]>([]);
  const [selectedBackupRowKeys, setSelectedBackupRowKeys] = useState<React.Key[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [materials, setMaterials] = useState<{id: string, name: string, density?: number, unit_price?: number}[]>([]);
  const [hiddenTick, setHiddenTick] = useState(0)
  const [tempHiddenManualIds, setTempHiddenManualIds] = useState<string[]>([])
  const [tempHiddenBackupIds, setTempHiddenBackupIds] = useState<string[]>([])
  const [manualAll, setManualAll] = useState<ManualPurchaseOrder[]>([])
  const [backupAll, setBackupAll] = useState<BackupMaterial[]>([])
  const [manualLimit, setManualLimit] = useState<number>(500)
  const [backupLimit, setBackupLimit] = useState<number>(500)
  const setManualDataPreserveScroll = (updater: (prev: ManualPurchaseOrder[]) => ManualPurchaseOrder[]) => {
    const top = tableWrapRef.current?.scrollTop ?? 0;
    setManualData(prev => updater(prev));
    setTimeout(() => {
      if (tableWrapRef.current) tableWrapRef.current.scrollTop = top;
    }, 0);
  };
  const setBackupDataPreserveScroll = (updater: (prev: BackupMaterial[]) => BackupMaterial[]) => {
    const top = tableWrapRef.current?.scrollTop ?? 0;
    setBackupData(prev => updater(prev));
    setTimeout(() => {
      if (tableWrapRef.current) tableWrapRef.current.scrollTop = top;
    }, 0);
  };

  const getManualPos = (): Record<string, number> => {
    try { return JSON.parse(localStorage.getItem('manualRowPositions') || '{}') } catch { return {} }
  }
  const setManualPos = (id: string, idx: number) => {
    const map = getManualPos();
    map[id] = idx;
    localStorage.setItem('manualRowPositions', JSON.stringify(map));
  }
  const getBackupPos = (): Record<string, number> => {
    try { return JSON.parse(localStorage.getItem('backupRowPositions') || '{}') } catch { return {} }
  }
  const setBackupPos = (id: string, idx: number) => {
    const map = getBackupPos();
    map[id] = idx;
    localStorage.setItem('backupRowPositions', JSON.stringify(map));
  }

  const applyPositions = <T extends { id: string }>(list: T[], posMap: Record<string, number>): T[] => {
    const len = list.length
    const result: (T | null)[] = new Array(len).fill(null)
    const leftovers: T[] = []
    list.forEach((item) => {
      const idx = posMap[item.id]
      if (typeof idx === 'number' && idx >= 0 && idx < len && result[idx] === null) {
        result[idx] = item
      } else {
        leftovers.push(item)
      }
    })
    let cursor = 0
    leftovers.forEach((item) => {
      while (cursor < len && result[cursor] !== null) cursor++
      if (cursor < len) result[cursor] = item
    })
    return result.map(r => r as T)
  }

  const [partTypes, setPartTypes] = useState<{id: string, name: string, volume_formula?: string, input_format?: string}[]>([]);

  // 兜底重算：材质/料型加载后，为已存在的备用料补算重量和金额（含历史数据）
  useEffect(() => {
    if (backupData.length === 0) return
    if (materials.length === 0 || partTypes.length === 0) return

    setBackupDataPreserveScroll((prev) => {
      let changed = false
      const next = prev.map((row) => {
        const specsObj = (() => {
          const s = row.specifications as any
          if (s && typeof s === 'object' && Object.keys(s).length > 0) return s
          return parseProductionSpecifications(String(row.model || ''), row.material_type || '')
        })()
        const currentMaterial = materials.find((m) => String(m.name || '').trim() === String(row.material || '').trim())
        const materialId = currentMaterial?.id || ''
        const unitWeight = calculatePartWeight(specsObj, materialId, row.material_type || '', partTypes, materials)
        const qty = parseInt(String(row.quantity || '0'), 10) || 0
        const totalWeight = qty > 0 ? unitWeight * qty : 0
        const unitPrice = Number((currentMaterial as any)?.unit_price || 0)
        const totalPrice = calculateTotalPrice(totalWeight, unitPrice)
        const oldW = Number(row.weight || 0)
        const oldP = Number(row.total_price || 0)
        if (Math.abs(oldW - totalWeight) > 0.0005 || Math.abs(oldP - totalPrice) > 0.005) {
          changed = true
          return {
            ...row,
            specifications: specsObj,
            weight: totalWeight,
            unit_price: unitPrice,
            total_price: totalPrice
          }
        }
        return row
      })
      return changed ? next : prev
    })
  }, [backupData.length, materials, partTypes, calculatePartWeight])

  const getExcelDateString = (v: any): string => {
    if (v === null || typeof v === 'undefined') return ''
    if (v instanceof Date && !isNaN(v.getTime())) return dayjs(v).format('YYYY-MM-DD')
    if (typeof v === 'number' && isFinite(v)) {
      const d = XLSX.SSF.parse_date_code(v)
      if (d && d.y && d.m && d.d) {
        const mm = String(d.m).padStart(2, '0')
        const dd = String(d.d).padStart(2, '0')
        return `${d.y}-${mm}-${dd}`
      }
    }
    const s = String(v || '').trim()
    if (!s) return ''
    const m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/)
    if (m) {
      const mm = String(m[2]).padStart(2, '0')
      const dd = String(m[3]).padStart(2, '0')
      return `${m[1]}-${mm}-${dd}`
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    return ''
  }

  const safeTrim = (v: any) => String(v ?? '').trim()

  const normalizeKey = (k: string) => String(k || '').replace(/\s+/g, '').trim()

  const getRowValue = (row: Record<string, any>, keys: string[]) => {
    const map: Record<string, string> = {}
    Object.keys(row || {}).forEach((k) => {
      map[normalizeKey(k)] = k
    })
    for (const key of keys) {
      const actual = map[normalizeKey(key)]
      if (actual) return row[actual]
    }
    return undefined
  }

  const sheetToAOA = (sheet: XLSX.WorkSheet): any[][] => {
    const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' }) as any[]
    return Array.isArray(aoa) ? (aoa as any[][]) : []
  }

  const findHeaderRowIndex = (aoa: any[][], headerTokens: string[]) => {
    const tokens = headerTokens.map((t) => normalizeKey(t))
    const maxScan = Math.min(aoa.length, 20)
    for (let i = 0; i < maxScan; i++) {
      const row = aoa[i]
      if (!Array.isArray(row)) continue
      const normRow = row.map((c) => normalizeKey(String(c ?? '')))
      const hit = tokens.filter((t) => normRow.includes(t)).length
      if (hit >= 3) return i
    }
    return -1
  }

  const buildHeaderIndexMap = (headerRow: any[]) => {
    const map: Record<string, number> = {}
    headerRow.forEach((cell, idx) => {
      const k = normalizeKey(String(cell ?? ''))
      if (!k) return
      if (typeof map[k] !== 'number') map[k] = idx
    })
    return map
  }

  const getByAliases = (row: any[], idxMap: Record<string, number>, aliases: string[]) => {
    for (const a of aliases) {
      const k = normalizeKey(a)
      const idx = idxMap[k]
      if (typeof idx === 'number') return row[idx]
    }
    return undefined
  }

  const downloadExcelTemplate = () => {
    const manualHeaders = ['名称*', '型号', '数量', '单位', '项目名称', '投产单位', '需求日期', '提交人']
    const backupHeaders = ['名称*', '材质', '料型', '规格', '数量', '单位', '项目名称', '投产单位', '需求日期', '提交人']

    const manualExample = [
      '定位销',
      'M6',
      10,
      '件',
      '示例项目',
      '投产单位A',
      dayjs().add(7, 'day').format('YYYY-MM-DD'),
      user?.real_name || ''
    ]

    const backupExample = [
      '45钢圆料',
      '45钢',
      '圆料',
      'φ50*100',
      2,
      'kg',
      '示例项目',
      '投产单位A',
      dayjs().add(7, 'day').format('YYYY-MM-DD'),
      user?.real_name || ''
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([manualHeaders, manualExample]), '标准件')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([backupHeaders, backupExample]), '备用料')
    XLSX.writeFile(wb, `采购申请导入模板_${dayjs().format('YYYYMMDD')}.xlsx`)
  }

  const parseManualSheet = (sheet: XLSX.WorkSheet): any[] => {
    const aoa = sheetToAOA(sheet)
    const headerIdx = findHeaderRowIndex(aoa, ['名称*', '名称', '型号', '数量', '单位', '项目名称', '投产单位', '需求日期', '提交人'])
    if (headerIdx < 0) return []
    const idxMap = buildHeaderIndexMap(aoa[headerIdx] || [])
    const dataRows = aoa.slice(headerIdx + 1)

    const mapped = dataRows.map((row, i) => {
      const part_name = safeTrim(getByAliases(row, idxMap, ['名称*', '名称', '标准件名称', '零件名称']))
      const model = safeTrim(getByAliases(row, idxMap, ['型号', '规格型号', '规格', '型号规格']))
      const part_quantity_raw = getByAliases(row, idxMap, ['数量', '数量(件)', '采购数量'])
      const unit = safeTrim(getByAliases(row, idxMap, ['单位', '计量单位'])) || '件'
      const project_name = safeTrim(getByAliases(row, idxMap, ['项目名称', '项目', '项目名']))
      const production_unit = safeTrim(getByAliases(row, idxMap, ['投产单位', '生产单位', '使用单位']))
      const demand_date = getExcelDateString(getByAliases(row, idxMap, ['需求日期', '需用日期', '交期']))
      const applicant = safeTrim(getByAliases(row, idxMap, ['提交人', '申请人', '提报人'])) || (user?.real_name || '')
      const _row = headerIdx + 2 + i

      const qtyNum = (() => {
        if (part_quantity_raw === '' || part_quantity_raw === null || typeof part_quantity_raw === 'undefined') return null
        const n = parseInt(String(part_quantity_raw), 10)
        return isNaN(n) ? null : n
      })()

      return {
        part_name,
        model,
        part_quantity: qtyNum,
        unit,
        project_name,
        production_unit,
        demand_date,
        applicant,
        _row
      }
    })

    return mapped.filter((r) => {
      const meaningful = Object.values(r).some((v) => String(v ?? '').trim() !== '' && v !== null)
      return meaningful && String(r.part_name || '').trim() !== ''
    })
  }

  const parseBackupSheet = (sheet: XLSX.WorkSheet, materialsLocal: {id: string, name: string, density?: number, unit_price?: number}[], partTypesLocal: {id: string, name: string, volume_formula?: string, input_format?: string}[]): any[] => {
    const aoa = sheetToAOA(sheet)
    const headerIdx = findHeaderRowIndex(aoa, ['名称*', '名称', '材质', '料型', '规格', '数量', '单位', '项目名称', '投产单位', '需求日期', '提交人'])
    if (headerIdx < 0) return []
    const idxMap = buildHeaderIndexMap(aoa[headerIdx] || [])
    const dataRows = aoa.slice(headerIdx + 1)

    const mapped = dataRows.map((row, i) => {
      const material_name = safeTrim(getByAliases(row, idxMap, ['名称*', '名称', '材料名称', '备用料名称']))
      const material = safeTrim(getByAliases(row, idxMap, ['材质', '材料', '材质名称']))
      const material_type = safeTrim(getByAliases(row, idxMap, ['料型', '类型', '料型名称']))
      const model = safeTrim(getByAliases(row, idxMap, ['规格', '规格型号', '尺寸']))
      const quantity_raw = getByAliases(row, idxMap, ['数量', '数量(件)', '采购数量'])
      const unit = safeTrim(getByAliases(row, idxMap, ['单位', '计量单位'])) || 'kg'
      const project_name = safeTrim(getByAliases(row, idxMap, ['项目名称', '项目', '项目名']))
      const production_unit = safeTrim(getByAliases(row, idxMap, ['投产单位', '生产单位', '使用单位']))
      const demand_date = getExcelDateString(getByAliases(row, idxMap, ['需求日期', '需用日期', '交期']))
      const applicant = safeTrim(getByAliases(row, idxMap, ['提交人', '申请人', '提报人'])) || (user?.real_name || '')
      const _row = headerIdx + 2 + i

      const qty = (() => {
        if (quantity_raw === '' || quantity_raw === null || typeof quantity_raw === 'undefined') return null
        const n = parseInt(String(quantity_raw), 10)
        return isNaN(n) ? null : n
      })()

      const currentMaterial = materialsLocal.find((m) => String(m.name || '').trim() === material)
      const materialId = currentMaterial?.id || ''
      const unitPrice = Number((currentMaterial as any)?.unit_price || 0)
      const specsObj = model ? parseProductionSpecifications(model, material_type) : {}
      const unitW = calculatePartWeight(specsObj, materialId, material_type, partTypesLocal as any, materialsLocal as any)
      const totalW = qty && qty > 0 && unitW > 0 ? unitW * qty : 0
      const totalPrice = calculateTotalPrice(totalW, unitPrice)

      return {
        material_name,
        material,
        material_type,
        model,
        quantity: qty,
        unit,
        project_name,
        production_unit,
        demand_date,
        applicant,
        weight: totalW,
        unit_price: unitPrice,
        total_price: totalPrice,
        _row
      }
    })

    return mapped.filter((r) => {
      const meaningful = Object.values(r).some((v) => String(v ?? '').trim() !== '' && v !== null)
      return meaningful && String(r.material_name || '').trim() !== ''
    })
  }

  const handleExcelImport = async (file: File) => {
    if (!file) return
    setExcelImporting(true)
    message.loading({ content: '正在导入...', key: 'excel_import', duration: 0 })
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const names = wb.SheetNames || []
      if (names.length === 0) {
        message.error({ content: 'Excel 中未找到工作表', key: 'excel_import' })
        return
      }

      const findSheet = (keywords: string[]) => {
        const hit = names.find((n) => keywords.some((k) => String(n).includes(k)))
        return hit ? wb.Sheets[hit] : undefined
      }

      const detectSheetType = (sheet: XLSX.WorkSheet): 'manual' | 'backup' | 'unknown' => {
        try {
          const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' }) as any[]
          const header = Array.isArray(aoa?.[0]) ? aoa[0].map((x: any) => normalizeKey(String(x || ''))) : []
          const hasMaterial = header.some((h: string) => ['材质', '料型', '规格'].includes(h))
          const hasManual = header.some((h: string) => ['型号', '单位', '项目名称'].includes(h))
          if (hasMaterial) return 'backup'
          if (hasManual) return 'manual'
          return 'unknown'
        } catch {
          return 'unknown'
        }
      }

      let manualSheet = findSheet(['标准件', '标准', 'manual', 'Manual'])
      let backupSheet = findSheet(['备用料', '备用', '原材料', '材料', 'backup', 'Backup'])

      if (!manualSheet || !backupSheet) {
        for (const name of names) {
          const s = wb.Sheets[name]
          if (!s) continue
          const t = detectSheetType(s)
          if (t === 'manual' && !manualSheet) manualSheet = s
          if (t === 'backup' && !backupSheet) backupSheet = s
        }
      }

      if (!manualSheet && !backupSheet && names.length === 2) {
        manualSheet = wb.Sheets[names[0]]
        backupSheet = wb.Sheets[names[1]]
      }

      const materialsLocal = materials.length > 0
        ? materials
        : await (async () => {
            const r = await fetchWithFallback('/api/materials', { cache: 'no-store' })
            const j = await r.json().catch(() => ({}))
            return Array.isArray(j?.data) ? j.data : []
          })()
      const partTypesLocal = partTypes.length > 0
        ? partTypes
        : await (async () => {
            const r = await fetchWithFallback('/api/part-types', { cache: 'no-store' })
            const j = await r.json().catch(() => ({}))
            return Array.isArray(j?.data) ? j.data : []
          })()

      const manualRows = manualSheet ? parseManualSheet(manualSheet) : []
      const backupRows = backupSheet ? parseBackupSheet(backupSheet, materialsLocal, partTypesLocal) : []

      if (manualRows.length === 0 && backupRows.length === 0) {
        message.error({ content: '未解析到可导入的数据（请检查Sheet名称与表头）', key: 'excel_import' })
        return
      }

      const isNumericText = (v: any) => {
        const s = String(v ?? '').trim()
        if (!s) return false
        return /^-?\d+(\.\d+)?$/.test(s)
      }

      const errors: string[] = []
      manualRows.forEach((r: any) => {
        const rowNo = r?._row ? `第${r._row}行` : ''
        const name = String(r?.part_name || '').trim()
        const unit = String(r?.unit || '').trim()
        const qty = Number(r?.part_quantity || 0)
        if (!name) errors.push(`标准件 ${rowNo}：名称不能为空`)
        if (!isFinite(qty) || qty <= 0) errors.push(`标准件 ${rowNo}：数量必须为大于0的数字（请确认数量在“数量”列，单位在“单位”列）`)
        if (!unit) errors.push(`标准件 ${rowNo}：单位不能为空`)
        if (isNumericText(unit) && (!isFinite(qty) || qty <= 0)) errors.push(`标准件 ${rowNo}：检测到“单位”列填了数字，疑似整行右移/错列，请按模板列填写`)
      })
      backupRows.forEach((r: any) => {
        const rowNo = r?._row ? `第${r._row}行` : ''
        const name = String(r?.material_name || '').trim()
        const material = String(r?.material || '').trim()
        const materialType = String(r?.material_type || '').trim()
        const model = String(r?.model || '').trim()
        const unit = String(r?.unit || '').trim()
        const qty = Number(r?.quantity || 0)
        if (!name) errors.push(`备用料 ${rowNo}：名称不能为空`)
        if (!material) errors.push(`备用料 ${rowNo}：材质不能为空`)
        if (!materialType) errors.push(`备用料 ${rowNo}：料型不能为空`)
        if (!model) errors.push(`备用料 ${rowNo}：规格不能为空`)
        if (!isFinite(qty) || qty <= 0) errors.push(`备用料 ${rowNo}：数量必须为大于0的数字`)
        if (!unit) errors.push(`备用料 ${rowNo}：单位不能为空`)
      })

      if (errors.length > 0) {
        const head = errors.slice(0, 3).join('；')
        const tail = errors.length > 3 ? `（另有${errors.length - 3}处）` : ''
        message.error({ content: `导入失败：${head}${tail}`, key: 'excel_import' })
        return
      }

      let insertedManual = 0
      let insertedBackup = 0

      if (manualRows.length > 0) {
        const payload = manualRows.map((x: any) => {
          const { _row, ...rest } = x || {}
          return rest
        })
        const r = await fetchWithFallback('/api/manual-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders: payload })
        })
        const body = await r.json().catch(() => ({} as any))
        if (!r.ok || body?.success === false) {
          message.error({ content: `导入失败：${body?.error || body?.message || '导入失败'}`, key: 'excel_import' })
          return
        }
        insertedManual = Array.isArray(body?.data) ? body.data.length : manualRows.length
      }

      if (backupRows.length > 0) {
        const payload = backupRows.map((x: any) => {
          const { _row, ...rest } = x || {}
          return rest
        })
        const r = await fetchWithFallback('/api/backup-materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materials: payload })
        })
        const body = await r.json().catch(() => ({} as any))
        if (!r.ok || body?.success === false) {
          message.error({ content: `导入失败：${body?.error || body?.message || '导入失败'}`, key: 'excel_import' })
          return
        }
        insertedBackup = Array.isArray(body?.results) ? body.results.filter((x: any) => x?.success).length : backupRows.length
      }

      if (manualRows.length > 0 && insertedManual === 0) {
        message.error({ content: '导入失败：标准件未写入任何数据（请检查表头行是否正确）', key: 'excel_import' })
        return
      }
      if (backupRows.length > 0 && insertedBackup === 0) {
        message.error({ content: '导入失败：备用料未写入任何数据（请检查表头行是否正确）', key: 'excel_import' })
        return
      }

      message.success({ content: `导入成功：标准件 ${insertedManual} 条，备用料 ${insertedBackup} 条`, key: 'excel_import' })
      fetchManualData()
      fetchBackupData()
    } catch (e) {
      message.error({ content: '导入失败: ' + (e as Error).message, key: 'excel_import' })
    } finally {
      setExcelImporting(false)
      if (excelFileInputRef.current) excelFileInputRef.current.value = ''
      setExcelInputKey((v) => v + 1)
    }
  }

  const handleGeneratePurchaseAll = async () => {
    const manualIds = selectedManualRowKeys.filter(id => !String(id).startsWith('blank-'))
    const backupIds = selectedBackupRowKeys.filter(id => !String(id).startsWith('blank-'))
    const total = manualIds.length + backupIds.length
    if (total === 0) { message.warning('请选择需要生成的记录'); return }

    const manualSelected = manualData.filter(r => manualIds.includes(r.id))
    const backupSelected = backupData.filter(r => backupIds.includes(r.id))

    const isManualReady = (r: any) => {
      const nameOk = !!String(r.part_name || '').trim()
      const qtyOk = Number(r.part_quantity || 0) > 0
      const unitOk = !!String(r.unit || '').trim()
      const projectOk = !!String(r.project_name || '').trim()
      const prodUnitOk = !!String(r.production_unit || '').trim()
      const demandDateOk = !!String(r.demand_date || '').match(/\d{4}-\d{2}-\d{2}/)
      const applicantOk = !!String(r.applicant || user?.real_name || '').trim()
      return nameOk && qtyOk && unitOk && projectOk && prodUnitOk && demandDateOk && applicantOk
    }

    const isBackupReady = (r: any) => {
      const nameOk = !!String(r.material_name || '').trim()
      const qtyOk = !(r.quantity === '' || r.quantity === null || typeof r.quantity === 'undefined') && Number(r.quantity) > 0
      const projectOk = !!String(r.project_name || '').trim()
      const prodUnitOk = !!String(r.production_unit || '').trim()
      const demandDateOk = !!String(r.demand_date || '').match(/\d{4}-\d{2}-\d{2}/)
      const amountOk = !(r.total_price === '' || r.total_price === null || typeof r.total_price === 'undefined')
      const applicantOk = !!String(r.applicant || user?.real_name || '').trim()
      return nameOk && qtyOk && projectOk && prodUnitOk && demandDateOk && amountOk && applicantOk
    }

    const orders: any[] = []

    const invalidManual = manualSelected.filter(r => !isManualReady(r))
    const validManual = manualSelected.filter(isManualReady)
    validManual.forEach(r => {
      const qtyStr = String(r.part_quantity ?? '').trim()
      const qty = qtyStr === '' ? 0 : (isNaN(parseInt(qtyStr, 10)) ? 0 : parseInt(qtyStr, 10))
      orders.push({
        inventory_number: `MANUAL-${r.id}`,
        project_name: r.project_name || '临时计划',
        part_name: String(r.part_name || '').trim(),
        part_quantity: qty,
        unit: (String(r.unit ?? '').trim() || '件'),
        model: String(r.model || '').trim(),
        supplier: '',
        required_date: String(r.demand_date || '').trim(),
        remark: String(r.remark || '').trim(),
        created_date: new Date().toISOString(),
        production_unit: String(r.production_unit || '').trim(),
        demand_date: String(r.demand_date || '').trim(),
        applicant: String(r.applicant || user?.real_name || '手动录入'),
        status: 'pending'
      })
    })

    const invalidBackup = backupSelected.filter(r => !isBackupReady(r))
    const validBackup = backupSelected.filter(isBackupReady)
    validBackup.forEach(r => {
      const qtyStr = String(r.quantity ?? '').trim()
      const qty = qtyStr === '' ? 0 : (isNaN(parseInt(qtyStr, 10)) ? 0 : parseInt(qtyStr, 10))
      const specsText = (() => {
        const s = r.specifications as any
        if (s && typeof s === 'object' && Object.keys(s).length > 0) {
          return formatSpecificationsForProduction(s, r.material_type || '')
        }
        return String(r.model || '').trim()
      })()
      const modelText = `${String(r.material || '').trim()}${specsText ? ' (' + specsText + ')' : ''}`

      const currentMaterial = materials.find(m => m.name === r.material)
      const materialId = currentMaterial?.id || ''
      const specsObj = (() => {
        const s = r.specifications as any
        if (s && typeof s === 'object' && Object.keys(s).length > 0) return s
        const modelTextRaw = String(r.model || '')
        return modelTextRaw ? parseProductionSpecifications(modelTextRaw, r.material_type || '') : {}
      })()
      const unitW = calculatePartWeight(specsObj, materialId, r.material_type || '', partTypes, materials)
      const totalW = qty > 0 && unitW > 0 ? unitW * qty : 0
      const unitPrice = Number((currentMaterial as any)?.unit_price || 0)
      const totalPrice = calculateTotalPrice(totalW, unitPrice)

      const materialTypeText = String((r as any).material_type || (r as any).material_source || '').trim()
      const remarkBase = String(r.remark || '').trim()
      const encodedRemark = materialTypeText
        ? `${remarkBase}${remarkBase ? ' ' : ''}[MT:${materialTypeText}]`
        : remarkBase

      orders.push({
        inventory_number: `BACKUP-${r.id}`,
        project_name: r.project_name || '临时计划',
        part_name: String(r.material_name || '').trim(),
        part_quantity: qty,
        unit: (String(r.unit ?? '').trim() || '件'),
        model: modelText,
        supplier: String(r.supplier || '').trim(),
        required_date: String(r.demand_date || '').trim(),
        remark: encodedRemark,
        created_date: new Date().toISOString(),
        // 备用料的投产单位在前端使用 production_unit 展示，后端历史数据可能落在 supplier，做兼容透传
        production_unit: String(r.production_unit || r.supplier || '').trim(),
        demand_date: String(r.demand_date || '').trim(),
        applicant: String(r.applicant || user?.real_name || '手动录入'),
        status: 'pending',
        weight: totalW || 0,
        total_price: totalPrice || 0
      })
    })

      const invalidCount = invalidManual.length + invalidBackup.length
      if (invalidCount > 0) {
        message.error(`生成采购单失败：共有 ${invalidCount} 条信息不完整，请补全后重试`)
        return
      }
      const validOrders = orders

      try {
        const result = await postPurchaseOrders(validOrders)
        if (result?.success) {
          const stats = result.stats || {}
          const messages: string[] = []
          if (stats.updated > 0) messages.push(`更新 ${stats.updated} 条`)
          if (stats.inserted > 0) messages.push(`新增 ${stats.inserted} 条`)
          if (stats.skipped > 0) messages.push(`跳过 ${stats.skipped} 条`)
          const messageText = messages.length > 0 ? messages.join('，') : `成功处理 ${validOrders.length} 条采购单`
          message.success(messageText)

          // 成功后清理采购申请中的选中项（后台删除），保持页面数据一致
          let accessToken = '';
          try {
            const { data: { session } } = await import('../../lib/supabase').then(m => m.supabase.auth.getSession())
            accessToken = session?.access_token || '';
            
            if (!accessToken) {
              const keyPattern = /^sb-.*-auth-token$/;
              let found = false;
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && keyPattern.test(key)) {
                  const item = localStorage.getItem(key);
                  if (item) {
                    const parsed = JSON.parse(item);
                    accessToken = parsed.access_token || parsed.session?.access_token || (parsed.session && parsed.session.access_token) || '';
                    if (accessToken) {
                      found = true;
                      break;
                    }
                  }
                }
              }

              if (!found) {
                const authStorage = localStorage.getItem('auth-storage');
                if (authStorage) {
                  try {
                    const parsed = JSON.parse(authStorage);
                    accessToken = parsed.state?.user?.access_token || parsed.state?.token || parsed.state?.accessToken || '';
                  } catch (e) {}
                }
              }
            }
          } catch (e) {
            console.warn('[ManualPurchaseOrders] Failed to get session for cleanup', e);
          }

          const headers: HeadersInit = { 'Content-Type': 'application/json' }
          if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`
          }

          const tasks: Promise<Response>[] = []
          if (manualIds.length > 0) {
            tasks.push(fetchWithFallback('/api/manual-plans/batch-delete', {
              method: 'POST',
              headers,
              body: JSON.stringify({ ids: manualIds })
            }))
          }
          if (backupIds.length > 0) {
            tasks.push(fetchWithFallback('/api/backup-materials/batch-delete', {
              method: 'POST',
              headers,
              body: JSON.stringify({ ids: backupIds })
            }))
          }
          if (tasks.length > 0) {
            try { await Promise.all(tasks) } catch {}
          }

          // 前端立即移除选中项并重置选择，避免残留
          setManualDataPreserveScroll(prev => prev.filter(item => !manualIds.includes(item.id)))
          setBackupDataPreserveScroll(prev => prev.filter(item => !backupIds.includes(item.id)))
          setSelectedManualRowKeys([])
          setSelectedBackupRowKeys([])

          navigate('/purchase-management?tab=list')
        } else {
          message.error(result?.error || '生成采购单失败')
        }
      } catch (err) {
        message.error('生成采购单失败: ' + (err as Error).message)
      }
  }

  // 获取投产单位选项 - 与工装信息保持一致
  const fetchProductionUnits = async () => {
    try {
      const response = await fetchWithFallback('/api/options/production-units', { cache: 'no-store' });
      if (response.ok) {
        const result = await response.json();
        if (result && result.data) {
          const units = Array.isArray(result.data) ? result.data.map((x: any) => x.name).filter(Boolean) : [];
          setProductionUnits(units);
        }
      }
    } catch (error) {
      console.error('获取投产单位选项失败:', error);
    }
  };

  // 获取供应商选项
  const fetchSuppliers = async () => {
    try {
      const response = await fetchWithFallback('/api/options/suppliers', { cache: 'no-store' });
      if (response.ok) {
        const result = await response.json();
        if (result && result.data) {
          const supplierList = Array.isArray(result.data) ? result.data.map((x: any) => x.name).filter(Boolean) : [];
          setSuppliers(supplierList);
        }
      }
    } catch (error) {
      console.error('获取供应商选项失败:', error);
    }
  };

  // 获取材质选项 - 与工装信息保持一致
  const fetchMaterials = async () => {
    try {
      const response = await fetchWithFallback('/api/materials', { cache: 'no-store' });
      if (response.ok) {
        const result = await response.json();
        if (result && result.data) {
          setMaterials(result.data);
        }
      }
    } catch (error) {
      console.error('获取材质选项失败:', error);
    }
  };

  // 获取料型选项 - 与工装信息保持一致
  const fetchPartTypes = async () => {
    try {
      const response = await fetchWithFallback('/api/part-types', { cache: 'no-store' });
      if (response.ok) {
        const result = await response.json();
        if (result && result.data) {
          setPartTypes(result.data);
        }
      }
    } catch (error) {
      console.error('获取料型选项失败:', error);
    }
  };

  // 初始化
  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);
    }
  }, [isInitialized]);

  const [refreshKey, setRefreshKey] = useState(0);

  const loadTempPlanHiddenIds = useCallback(async () => {
    try {
      const resp = await fetchWithFallback('/api/temporary-plan-groups', { method: 'GET' })
      const json = await resp.json().catch(() => ({}))
      const groups = Array.isArray(json?.data) ? json.data : []
      const manualIds = new Set<string>()
      const backupIds = new Set<string>()
      groups.forEach((group: any) => {
        const items = Array.isArray(group?.items) ? group.items : []
        items.forEach((item: any) => {
          const inventoryNumber = String(item?.inventory_number || '').trim()
          if (inventoryNumber.startsWith('MANUAL-')) manualIds.add(inventoryNumber.slice(7).trim())
          if (inventoryNumber.startsWith('BACKUP-')) backupIds.add(inventoryNumber.slice(7).trim())
        })
      })
      setTempHiddenManualIds(Array.from(manualIds))
      setTempHiddenBackupIds(Array.from(backupIds))
    } catch {
      setTempHiddenManualIds([])
      setTempHiddenBackupIds([])
    }
  }, [])

  // 监听状态更新事件
  useEffect(() => {
    const handleStatusUpdate = () => {
      setRefreshKey(prev => prev + 1);
      fetchManualData();
      fetchBackupData();
      void loadTempPlanHiddenIds();
    };
    
    // 强制刷新处理
    const handleForceRefresh = () => {
      setRefreshKey(prev => prev + 1);
      fetchManualData();
      fetchBackupData();
      void loadTempPlanHiddenIds();
    };

    window.addEventListener('status_updated', handleStatusUpdate);
    window.addEventListener('force_refresh', handleForceRefresh);
    return () => {
      window.removeEventListener('status_updated', handleStatusUpdate);
      window.removeEventListener('force_refresh', handleForceRefresh);
    };
  }, [loadTempPlanHiddenIds]);

  // 紧急刷新功能：清空隐藏列表并重新加载
  const handleEmergencyRefresh = () => {
    setRefreshKey(prev => prev + 1);
    fetchManualData();
    fetchBackupData();
    void loadTempPlanHiddenIds();
    message.success('已刷新页面数据');
  };

  // 获取手动输入的数据（使用独立的临时计划数据源）
  const fetchManualData = async () => {
    try {
      const response = await fetchWithFallback('/api/manual-plans');
      
      if (response.ok) {
        const result = await response.json();
        
        if (result && result.data && Array.isArray(result.data)) {
          const rawOrders: any[] = result.data
          const trashIds = rawOrders
            .filter((o: any) => {
              const partName = String(o?.part_name || '').trim()
              const model = String(o?.model || '').trim()
              const projectName = String(o?.project_name || '').trim()
              const productionUnit = String(o?.production_unit || '').trim()
              const applicant = String(o?.applicant || '').trim()
              const demandDate = String(o?.demand_date || '').trim()
              const unit = String(o?.unit || '').trim()
              const qty = Number(o?.part_quantity || 0)
              const hasQty = isFinite(qty) && qty > 0
              const hasContent = !!(partName || model || projectName || productionUnit || applicant || demandDate || hasQty)
              const onlyDefaultUnit = !unit || unit === '件'
              return !hasContent && onlyDefaultUnit
            })
            .map((o: any) => String(o?.id || '').trim())
            .filter(Boolean)

          const cleaned = trashIds.length > 0
            ? rawOrders.filter((o: any) => !trashIds.includes(String(o?.id || '').trim()))
            : rawOrders

          if (trashIds.length > 0) {
            try {
              const posMap = getManualPos()
              trashIds.forEach((id: string) => { delete posMap[id] })
              localStorage.setItem('manualRowPositions', JSON.stringify(posMap))
            } catch {}
            fetchWithFallback('/api/manual-plans/batch-delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: trashIds })
            }).catch(() => {})
          }

          const manualOrders = cleaned.map((order: any) => ({
            ...order,
            part_quantity: String(order.part_quantity || ''),
            is_manual: true
          }));
          
          setManualAll(manualOrders);

          // 根据本地位置映射排序，保持用户创建时的行位置
          const posMap = getManualPos();
          const placed = applyPositions(manualOrders as any, posMap) as any[]
          const sliced = placed.slice(0, manualLimit)
          
          setManualData(sliced as any);
        } else {
          setManualAll([]);
          setManualData([]);
        }
      } else {
        const errorText = await response.text();
        if (response.status === 500 && /fetch failed/i.test(errorText)) {
          setManualAll([]);
          setManualData([]);
          message.warning('手动采购单数据暂不可用（网络波动），稍后重试');
          return;
        }
      }
    } catch (error) {
      console.error('[ManualPurchaseOrders] fetchManualData failed:', error);
      setManualAll([]);
      setManualData([]);
    }
  };

  // 获取备用材料数据
  const fetchBackupData = async () => {
    try {
      const response = await fetchWithFallback('/api/backup-materials');
      
      if (response.ok) {
        const result = await response.json();
        
        if (result && result.data && Array.isArray(result.data)) {
          const rawMaterials: any[] = result.data
          const trashIds = rawMaterials
            .filter((m: any) => {
              const materialName = String(m?.material_name || '').trim()
              const material = String(m?.material || '').trim()
              const materialType = String(m?.material_type || m?.material_source || '').trim()
              const model = String(m?.model || '').trim()
              const projectName = String(m?.project_name || '').trim()
              const supplier = String(m?.supplier || '').trim()
              const productionUnit = String(m?.production_unit || '').trim()
              const applicant = String(m?.applicant || '').trim()
              const demandDate = String(m?.demand_date || '').trim()
              const unit = String(m?.unit || '').trim()
              const qty = Number(m?.quantity || 0)
              const hasQty = isFinite(qty) && qty > 0
              const hasContent = !!(materialName || material || materialType || model || projectName || supplier || productionUnit || applicant || demandDate || hasQty)
              const onlyDefaultUnit = !unit || unit === 'kg'
              return !hasContent && onlyDefaultUnit
            })
            .map((m: any) => String(m?.id || '').trim())
            .filter(Boolean)

          const cleaned = trashIds.length > 0
            ? rawMaterials.filter((m: any) => !trashIds.includes(String(m?.id || '').trim()))
            : rawMaterials

          if (trashIds.length > 0) {
            try {
              const posMap = getBackupPos()
              trashIds.forEach((id: string) => { delete posMap[id] })
              localStorage.setItem('backupRowPositions', JSON.stringify(posMap))
            } catch {}
            fetchWithFallback('/api/backup-materials/batch-delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: trashIds })
            }).catch(() => {})
          }

          const backupMaterials = cleaned.map((material: any) => {
            // 如果后端不返回规格对象，则从规格文本解析，保证初始渲染即可显示
            const parsedSpecs = (material.specifications && Object.keys(material.specifications || {}).length > 0)
              ? material.specifications
              : (material.model ? parseProductionSpecifications(String(material.model), material.material_type || '') : {})
            return {
              ...material,
              material_type: material.material_type || material.material_source || '',
              quantity: String(material.quantity || ''),
              price: String(material.price || ''),
              applicant: String(material.applicant || user?.real_name || ''),
              specifications: parsedSpecs,
              weight: material.weight || 0,
              unit_price: material.unit_price || 0,
              total_price: material.total_price || 0,
              // 兼容显示：后端存 supplier，用于前端的 production_unit 展示
              production_unit: material.production_unit || material.supplier || '',
              is_manual: true
            };
          });
          
          setBackupAll(backupMaterials);
          
          // 根据本地位置映射排序，保持用户创建时的行位置
          const posMapB = getBackupPos();
          const placedB = applyPositions(backupMaterials as any, posMapB) as any[]
          const slicedB = placedB.slice(0, backupLimit)
          
          setBackupData(slicedB as any);
        } else {
          setBackupAll([]);
          setBackupData([]);
        }
      } else {
        const errorText = await response.text();
        if (response.status === 500 && /fetch failed/i.test(errorText)) {
          setBackupAll([]);
          setBackupData([]);
          message.warning('备用材料数据暂不可用（网络波动），稍后重试');
          return;
        }
      }
    } catch (error) {
      console.error('[ManualPurchaseOrders] fetchBackupData failed:', error);
      setBackupAll([]);
      setBackupData([]);
    }
  };

  // 添加标准件
  const handleAddManual = () => {
    const newId = `blank-manual-${Date.now()}`;
    const newRow: ManualPurchaseOrder = {
      id: newId,
      part_name: '',
      model: '',
      part_quantity: '',
      unit: '',
      project_name: '',
      production_unit: '',
      created_date: new Date().toISOString().split('T')[0],
      demand_date: '',
      applicant: user?.real_name || '',
      is_manual: true
    };
    setManualDataPreserveScroll(prev => [...prev, newRow]);
  };

  // 添加备用料
  const handleAddBackup = () => {
    const newId = `blank-backup-${Date.now()}`;
    const newRow: BackupMaterial = {
      id: newId,
      material_name: '',
      material: '',
      material_type: '',
      model: '',
      specifications: {},
      quantity: '',
      unit: '',
      project_name: '',
      supplier: '',
      price: '',
      weight: 0,
      unit_price: 0,
      total_price: 0,
      created_date: new Date().toISOString().split('T')[0],
      demand_date: '',
      applicant: user?.real_name || '',
      is_manual: true
    };
    setBackupDataPreserveScroll(prev => [...prev, newRow]);
  };

  // 严格的字段验证函数
  const validateManualOrder = (_order: ManualPurchaseOrder) => {
    return [];
  };

  // 备用材料验证函数
  const validateBackupMaterial = (material: BackupMaterial) => {
    const errors: string[] = [];
    
    // 验证必填字段
    if (!material.material_name || material.material_name.trim() === '') {
      errors.push('材料名称不能为空');
    }
    
    if (!material.unit || material.unit.trim() === '') {
      errors.push('单位不能为空');
    }
    
    // 验证数量（如果填写了）
    if (material.quantity && material.quantity.trim() !== '') {
      const quantity = parseInt(material.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        errors.push('数量必须是正整数');
      }
    }
    
    // 验证价格（如果填写了）
    if (material.price && material.price.trim() !== '') {
      const price = parseFloat(material.price);
      if (isNaN(price) || price < 0) {
        errors.push('价格必须是有效数字');
      }
    }
    
    // 验证需求日期（如果填写了）
    if (material.demand_date && material.demand_date.trim() !== '') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(material.demand_date)) {
        errors.push('需求日期格式必须为YYYY-MM-DD');
      }
    }
    
    return errors;
  };

  const handleManualSave = async (id: string, key: keyof ManualPurchaseOrder, value: string) => {
    try {
      
      // 如果是空白行，需要创建新记录
      if (id.startsWith('blank-')) {
        // 先获取当前行数据
        const currentRow = manualData.find(r => r.id === id) || {
          id,
          part_name: '',
          model: '',
          part_quantity: '',
          unit: '',
          project_name: '',
          production_unit: '',
          created_date: new Date().toISOString().split('T')[0],
          demand_date: '',
          applicant: user?.real_name || '',
          is_manual: true
        };
        
        const updatedRow = { ...currentRow, [key]: value };
        
        // 取消校验：只要有任意内容即允许创建
        const hasAnyContent = !!(String(updatedRow.part_name || '').trim() || 
                               String(updatedRow.model || '').trim() || 
                               String(updatedRow.part_quantity || '').trim() || 
                               String(updatedRow.unit || '').trim() || 
                               String(updatedRow.project_name || '').trim() || 
                               String(updatedRow.production_unit || '').trim() ||
                               String(updatedRow.demand_date || '').trim());
        
        if (hasAnyContent) {
          
          // 构建发送数据 - 严格按照验证规则
          const postData: any = {
            part_name: (updatedRow.part_name || '').trim(),
            unit: (updatedRow.unit || '').trim(),
            applicant: updatedRow.applicant || user?.real_name || '手动录入',
            created_date: updatedRow.created_date || new Date().toISOString().split('T')[0]
          };
          
          if (updatedRow.project_name && updatedRow.project_name.trim() !== '') {
            postData.project_name = updatedRow.project_name.trim()
          }
          if (updatedRow.production_unit && updatedRow.production_unit.trim() !== '') {
            postData.production_unit = updatedRow.production_unit.trim()
          }
          // 只有在有数量值且有效时才添加数量字段
          if (updatedRow.part_quantity && updatedRow.part_quantity.trim() !== '') {
            const quantity = parseInt(updatedRow.part_quantity);
            if (!isNaN(quantity) && quantity > 0) {
              postData.part_quantity = quantity;
            }
          }
          
          // 添加其他可选字段
          if (updatedRow.model && updatedRow.model.trim() !== '') {
            postData.model = updatedRow.model.trim();
          }
          
          // 只有在有需求日期且格式正确时才添加需求日期字段
          if (updatedRow.demand_date && updatedRow.demand_date.trim() !== '') {
            const valid = dayjs(updatedRow.demand_date.trim(), 'YYYY-MM-DD', true).isValid();
            if (valid) {
              postData.demand_date = updatedRow.demand_date;
            }
          }
          
          
          
          try {
            const response = await fetchWithFallback('/api/manual-plans', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orders: [postData] })
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error('HTTP错误响应:', {
                status: response.status,
                statusText: response.statusText,
                responseText: errorText
              });
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            // 兼容单个对象或数组返回
            let created = null;
            if (Array.isArray(result?.data)) {
              created = result.data[0];
            } else if (result?.data) {
              created = result.data;
            }
            
            if (!created || !created.id) {
              console.error('API返回数据格式异常:', result);
              throw new Error('创建失败 - 缺少记录ID');
            }
            
            // 更新本地数据并保持滚动位置稳定
            setManualDataPreserveScroll(prev => {
              const updated = prev.map(r => 
                r.id === id ? { 
                  ...created, 
                  part_quantity: String(created.part_quantity || ''),
                  is_manual: true
                } : r
              );
              const idx = prev.findIndex(r => r.id === id);
              if (idx >= 0) setManualPos(created.id, idx);
              return updated;
            });
            
            message.success('保存成功');
            // 创建完成后直接返回，避免后续本地更新重复执行
            return;
          } catch (error) {
            console.error('创建手动采购单失败:', error);
            message.error(`保存失败: ${error.message}`);
          }
        } else {
          // 未满足创建必填项，仅做本地更新，允许继续编辑
        }
        
          // 更新本地数据（乐观更新，不插入空白行，避免重排）
          setManualDataPreserveScroll(prev => prev.map(r => r.id === id ? updatedRow : r));
        
      } else {
        // 更新现有记录
        try {
          
          // 更新时也要验证
          const currentRow = manualData.find(r => r.id === id);
          if (currentRow) {
            const updatedRow = { ...currentRow, [key]: value };
          // 取消校验：允许更新任意内容
          }
          
          // 构建更新数据
          const updateData: any = { [key]: value };
          
          // 前端乐观更新，减少卡顿
          setManualDataPreserveScroll(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));

          const response = await fetchWithFallback(`/api/manual-plans/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          });
          
          if (!response.ok) throw new Error(String(response.status));
          if (!['weight','unit_price','total_price'].includes(String(key))) {
            message.success('更新成功');
          }
          
          // 保持乐观更新，不立即整表刷新
        } catch (error) {
          console.error('更新手动采购单失败:', error);
          message.error('更新失败');
        }
      }
    } catch (error) {
      console.error('保存手动采购单失败:', error);
      message.error('保存失败');
    }
  };

  const handleManualBatchDelete = async () => {
    if (selectedManualRowKeys.length === 0) {
      message.warning('请选择要删除的记录');
      return;
    }

    // 过滤掉空白行
    const idsToDelete = selectedManualRowKeys.filter(id => !String(id).startsWith('blank-'));
    
    if (idsToDelete.length === 0) {
      message.warning('没有可删除的记录');
      return;
    }

    try {
      const response = await fetchWithFallback('/api/manual-plans/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: idsToDelete }),
      });

      if (response.ok) {
        message.success(`成功删除 ${idsToDelete.length} 条记录`);
        setSelectedManualRowKeys([]);
        fetchManualData();
      } else {
        throw new Error('删除失败');
      }
    } catch (error) {
      console.error('批量删除失败:', error);
      message.error('批量删除失败');
    }
  };

  const handleBackupSave = async (id: string, key: keyof BackupMaterial, value: string) => {
    try {
      
      // 获取当前数据
      const currentRow = backupData.find(r => r.id === id);
      if (!currentRow) return;
      
      let updatedRow = { ...currentRow, [key]: value };
      if (key === 'specifications') {
        updatedRow.specifications = typeof value === 'string' ? parseProductionSpecifications(String(value), updatedRow.material_type || '') : (value || {});
        const formattedModel = formatSpecificationsForProduction(updatedRow.specifications as any, updatedRow.material_type || '');
        updatedRow.model = formattedModel;
      } else if (key === 'model') {
        // 规格组件保存时会先写 model，这里同步反解规格，避免后续重算使用旧规格
        updatedRow.specifications = parseProductionSpecifications(String(value || ''), updatedRow.material_type || '')
      } else if (typeof updatedRow.specifications === 'string') {
        updatedRow.specifications = parseProductionSpecifications(String(updatedRow.specifications), updatedRow.material_type || '');
      }
      
      // 若名称未填，选择材质时自动回填，避免“名称填写不上”体验问题
      if (key === 'material' && !String(updatedRow.material_name || '').trim()) {
        updatedRow.material_name = String(value || '').trim()
      }

      // 如果更新了材质、料型、规格、规格文本或数量，需要重新计算重量和价格
      if (key === 'material' || key === 'material_type' || key === 'specifications' || key === 'model' || key === 'quantity') {
        const currentMaterial = materials.find(m => m.name === updatedRow.material);
        const materialId = currentMaterial?.id || '';
        const weight = calculatePartWeight(updatedRow.specifications || {}, materialId, updatedRow.material_type || '', partTypes, materials);
        const quantityNum = parseInt(updatedRow.quantity || '0') || 0;
        const totalWeight = quantityNum > 0 ? weight * quantityNum : 0;
        const mat = materials.find(m => m.name === updatedRow.material)
        const unitPrice = Number((mat as any)?.unit_price || 0)
        const totalPrice = calculateTotalPrice(totalWeight, unitPrice);
        
        // 采购申请页展示与入库链路都使用总重量
        updatedRow.weight = totalWeight;
        updatedRow.unit_price = unitPrice;
        updatedRow.total_price = totalPrice;
      }
      
      setBackupDataPreserveScroll(prev => prev.map(r => r.id === id ? updatedRow : r));
      
      // 如果是空白行，需要创建新记录
      if (id.startsWith('blank-')) {
        // 检查是否填写了任何内容（临时计划允许部分字段为空）
        const hasAnyContent = !!(String(updatedRow.material_name || '').trim() || 
                               String(updatedRow.material || '').trim() || 
                               String(updatedRow.material_type || '').trim() || 
                               String(updatedRow.model || '').trim() || 
                               String(updatedRow.quantity || '').trim() || 
                               String(updatedRow.unit || '').trim() || 
                               String(updatedRow.project_name || '').trim() || 
                               String(updatedRow.supplier || '').trim() ||
                               String(updatedRow.price || '').trim() ||
                               String(updatedRow.demand_date || '').trim());
        
        if (hasAnyContent) {
          
          // 构建发送数据 - 严格按照验证规则
          const postData: any = {
            material_name: (updatedRow.material_name || '').trim(),
            unit: (updatedRow.unit || '').trim(),
            project_name: updatedRow.project_name || '',
            supplier: (updatedRow.production_unit || updatedRow.supplier || '').trim(),
            applicant: updatedRow.applicant || user?.real_name || '手动录入',
            created_date: updatedRow.created_date || new Date().toISOString().split('T')[0]
          };
          
          // 只有在有数量值且有效时才添加数量字段
          if (updatedRow.quantity && updatedRow.quantity.trim() !== '') {
            const quantity = parseInt(updatedRow.quantity);
            if (!isNaN(quantity) && quantity > 0) {
              postData.quantity = quantity;
            }
          }
          
          // 只有在有价格值且有效时才添加价格字段
          if (updatedRow.price && updatedRow.price.trim() !== '') {
            const price = parseFloat(updatedRow.price);
            if (!isNaN(price) && price >= 0) {
              postData.price = price;
            }
          }
          
          // 添加其他可选字段
          if (updatedRow.model && updatedRow.model.trim() !== '') {
            postData.model = updatedRow.model.trim();
          }
          
          if (updatedRow.material && updatedRow.material.trim() !== '') {
            postData.material = updatedRow.material.trim();
          }
          
          if (updatedRow.material_type && updatedRow.material_type.trim() !== '') {
            postData.material_type = updatedRow.material_type.trim();
          }
          
          if (updatedRow.specifications && Object.keys(updatedRow.specifications).length > 0) {
            postData.specifications = updatedRow.specifications;
          }
          
          if (updatedRow.weight !== undefined) {
            postData.weight = updatedRow.weight;
          }
          
          if (updatedRow.unit_price !== undefined) {
            postData.unit_price = updatedRow.unit_price;
          }
          
          if (updatedRow.total_price !== undefined) {
            postData.total_price = updatedRow.total_price;
          }
          
          // 只有在有需求日期且格式正确时才添加需求日期字段
          if (updatedRow.demand_date && updatedRow.demand_date.trim() !== '') {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (dateRegex.test(updatedRow.demand_date)) {
              postData.demand_date = updatedRow.demand_date;
            }
          }
          
          
          
          try {
            const response = await fetchWithFallback('/api/backup-materials', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ materials: [postData] })
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error('HTTP错误响应:', {
                status: response.status,
                statusText: response.statusText,
                responseText: errorText
              });
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            // 兼容单个对象或数组返回，以及嵌套在 results 字段中的情况
            let created = null;
            if (Array.isArray(result?.data)) {
              created = result.data[0];
            } else if (result?.data) {
              created = result.data;
            } else if (Array.isArray(result?.results)) {
              // 备用材料 API 返回结构包含 results 数组
              const firstResult = result.results[0];
              created = firstResult?.success ? firstResult.data : null;
            }
            
            if (!created?.id) {
              console.error('API返回数据格式异常:', result);
              throw new Error('创建失败 - 缺少记录ID');
            }
            
            // 替换空白行为新创建的记录
            setBackupDataPreserveScroll(prev => {
              const updated = prev.map(r => 
                r.id === id ? { 
                  ...created, 
                  quantity: String(created.quantity || ''),
                  price: String(created.price || ''),
                  is_manual: true
                } : r
              );
              const idx = prev.findIndex(r => r.id === id);
              if (idx >= 0) setBackupPos(String(created.id), idx);
              return updated;
            });
            
            message.success('保存成功');
            
            
          } catch (error) {
            console.error('创建备用材料失败:', error);
            message.error(`保存失败: ${error.message}`);
          }
        }
      } else {
        // 更新现有记录
        try {
          // 构建更新数据（最小字段集），避免无关字段阻塞保存
          let updateData: any = { [key]: value };
          if (key === 'specifications') {
            // 规格不持久化，仅写入规格文本
            updateData.model = updatedRow.model;
            delete updateData.specifications;
          }
          if (key === 'production_unit') {
            // 后端使用 supplier 字段存储投产单位
            updateData = { supplier: String(value || '').trim() };
            // 同步本地 supplier 以便刷新后仍显示
            updatedRow.supplier = String(value || '').trim();
          }

          // 计算字段一并持久化，避免刷新后重量/金额丢失
          updateData.weight = updatedRow.weight ?? 0
          updateData.unit_price = updatedRow.unit_price ?? 0
          updateData.total_price = updatedRow.total_price ?? 0
          
          // 规格对象不持久化；材质/料型更新仅提交该字段本身
          
          // 前端乐观更新，确保立即显示；不再在编辑时重复插入空白行，避免行跳动
          setBackupDataPreserveScroll(prev => prev.map(r => r.id === id ? {
            ...r,
            [key]: value,
            ...(key === 'material' && !String((r as any).material_name || '').trim() ? { material_name: String(value || '').trim() } : {}),
            ...(key === 'specifications' ? { model: updatedRow.model } : {}),
            ...(key === 'production_unit' ? { supplier: String(value || '').trim() } : {}),
            weight: updatedRow.weight ?? 0,
            unit_price: updatedRow.unit_price ?? 0,
            total_price: updatedRow.total_price ?? 0,
          } : r))

          const response = await fetchWithFallback(`/api/backup-materials/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          });
          
          if (!response.ok) throw new Error(String(response.status));
          message.success('更新成功');
          
          // 保持乐观更新，不立即重拉，避免行上下跳动
        } catch (error) {
          console.error('更新备用材料失败:', error);
          message.error('更新失败');
        }
      }
    } catch (error) {
      console.error('保存备用材料失败:', error);
      message.error('保存失败');
    }
  };

  const handleBackupBatchDelete = async () => {
    if (selectedBackupRowKeys.length === 0) {
      message.warning('请选择要删除的备用材料');
      return;
    }

    // 过滤掉空白行
    const idsToDelete = selectedBackupRowKeys.filter(id => !String(id).startsWith('blank-'));
    
    if (idsToDelete.length === 0) {
      message.warning('没有可删除的备用材料');
      return;
    }

    try {
      const response = await fetchWithFallback('/api/backup-materials/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: idsToDelete }),
      });

      if (response.ok) {
        message.success(`成功删除 ${idsToDelete.length} 条备用材料`);
        setSelectedBackupRowKeys([]);
        fetchBackupData();
      } else {
        throw new Error('删除失败');
      }
    } catch (error) {
      console.error('批量删除备用材料失败:', error);
      message.error('批量删除备用材料失败');
    }
  };

  const handleBatchDeleteAll = async () => {
    const manualIds = selectedManualRowKeys.filter(id => !String(id).startsWith('blank-'))
    const backupIds = selectedBackupRowKeys.filter(id => !String(id).startsWith('blank-'))
    const total = manualIds.length + backupIds.length
    if (total === 0) return

    try {
      const tasks: Promise<Response>[] = []
      if (manualIds.length > 0) {
        tasks.push(fetchWithFallback('/api/manual-plans/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: manualIds })
        }))
      }
      if (backupIds.length > 0) {
        tasks.push(fetchWithFallback('/api/backup-materials/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: backupIds })
        }))
      }

      const resList = await Promise.all(tasks)
      const ok = resList.every(r => r.ok)
      if (ok) {
        setSelectedManualRowKeys([])
        setSelectedBackupRowKeys([])
        fetchManualData()
        fetchBackupData()
        message.success(`成功删除 ${total} 条记录`)
      } else {
        message.error('批量删除失败')
      }
    } catch (err) {
      console.error('批量删除失败:', err)
      message.error('批量删除失败')
    }
  }

  // 已移除：临时计划的“生成采购单”功能

  const manualRowSelection = {
    selectedRowKeys: selectedManualRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedManualRowKeys(newSelectedRowKeys);
    },
  };

  const backupRowSelection = {
    selectedRowKeys: selectedBackupRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedBackupRowKeys(newSelectedRowKeys);
    },
  };

  const manualColumns: ColumnsType<ManualPurchaseOrder> = [
    {
      title: '序号',
      dataIndex: 'selection',
      width: 50,
      align: 'center',
      fixed: 'left',
      render: (_text: any, _record: ManualPurchaseOrder, index: number) => {
        const isBlank = String(_record.id).startsWith('blank-');
        if (isBlank) {
          return (
            <span style={{ display: 'inline-block', width: '100%', textAlign: 'center', color: '#888' }}>
              {index + 1}
            </span>
          );
        }
        return (
          <span style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
            {index + 1}
          </span>
        );
      }
    },
    {
      title: '名称*',
      dataIndex: 'part_name',
      width: 160,
      render: (text: string, record: ManualPurchaseOrder) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="part_name"
          onSave={handleManualSave}
        />
      )
    },
    {
      title: '型号',
      dataIndex: 'model',
      width: 130,
      render: (text: string, record: ManualPurchaseOrder) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="model"
          onSave={handleManualSave}
        />
      )
    },
    {
      title: '数量',
      dataIndex: 'part_quantity',
      width: 80,
      render: (text: string, record: ManualPurchaseOrder) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="part_quantity"
          onSave={handleManualSave}
        />
      )
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 70,
      render: (text: string, record: ManualPurchaseOrder) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="unit"
          onSave={handleManualSave}
        />
      )
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      width: 160,
      render: (text: string, record: ManualPurchaseOrder) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="project_name"
          onSave={handleManualSave}
        />
      )
    },
    {
      title: '投产单位',
      dataIndex: 'production_unit',
      width: 120,
      render: (text: string, record: ManualPurchaseOrder) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="production_unit"
          onSave={handleManualSave}
          options={productionUnits}
        />
      )
    },

    {
      title: '需求日期',
      dataIndex: 'demand_date',
      width: 120,
      render: (text: string, record: ManualPurchaseOrder) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="demand_date"
          onSave={handleManualSave}
        />
      )
    },
    {
      title: '提交人',
      dataIndex: 'applicant',
      width: 100,
      render: (text: string, record: ManualPurchaseOrder) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="applicant"
          onSave={handleManualSave}
        />
      )
    }
  ];

  const backupColumns: ColumnsType<BackupMaterial> = [
    {
      title: '序号',
      dataIndex: 'selection',
      width: 50,
      align: 'center',
      fixed: 'left',
      render: (_text: any, _record: BackupMaterial, index: number) => {
        const isBlank = String(_record.id).startsWith('blank-');
        if (isBlank) {
          return (
            <span style={{ display: 'inline-block', width: '100%', textAlign: 'center', color: '#888' }}>
              {index + 1}
            </span>
          );
        }
        return (
          <span style={{ display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
            {index + 1}
          </span>
        );
      }
    },
    {
      title: '名称',
      dataIndex: 'material_name',
      width: 160,
      render: (text: string, record: BackupMaterial) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="material_name"
          onSave={handleBackupSave}
        />
      )
    },
    {
      title: '材质',
      dataIndex: 'material',
      width: 120,
      render: (text: string, record: BackupMaterial) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="material"
          onSave={handleBackupSave}
          options={materials.map(m => m.name)}
        />
      )
    },
    {
      title: '料型',
      dataIndex: 'material_type',
      width: 100,
      render: (text: string, record: BackupMaterial) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="material_type"
          onSave={handleBackupSave}
          options={partTypes.map(pt => pt.name)}
        />
      )
    },
    {
      title: '规格',
      dataIndex: 'model',
      width: 130,
      render: (text: string, record: BackupMaterial) => (
        <SpecificationsInput
          specs={(() => {
            const specsVal = record.specifications as any
            const hasSpecs = specsVal && typeof specsVal === 'object' && Object.keys(specsVal).length > 0
            if (hasSpecs) {
              return specsVal
            }
            const modelText = String(record.model || '')
            return modelText
              ? parseProductionSpecifications(modelText, record.material_type || '')
              : {}
          })()}
          partType={record.material_type}
          partTypes={partTypes}
          modelText={String(record.model || '')}
          onSave={async (newSpecs) => {
            const currentMaterial = materials.find(m => m.name === record.material);
            const materialId = currentMaterial?.id || '';
            const weight = calculatePartWeight(newSpecs, materialId, record.material_type || '', partTypes, materials);
            const qty = Number(record.quantity || 0);
            const totalWeight = qty > 0 ? weight * qty : 0;
            const unitPrice = Number((currentMaterial as any)?.unit_price || 0);
            const totalPrice = calculateTotalPrice(totalWeight, unitPrice);
            const formatted = formatSpecificationsForProduction(newSpecs as any, record.material_type || '');
            setBackupDataPreserveScroll(prev => prev.map(r => r.id === record.id ? {
              ...r,
              specifications: newSpecs as any,
              model: formatted,
              weight: totalWeight,
              unit_price: unitPrice,
              total_price: totalPrice
            } : r))
            handleBackupSave(record.id, 'model' as keyof BackupMaterial, formatted);
          }}
          />
      )
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 80,
      render: (text: string, record: BackupMaterial) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="quantity"
          onSave={handleBackupSave}
        />
      )
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      width: 160,
      render: (text: string, record: BackupMaterial) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="project_name"
          onSave={handleBackupSave}
        />
      )
    },
    {
      title: '投产单位',
      dataIndex: 'production_unit',
      width: 120,
      render: (text: string, record: BackupMaterial) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="production_unit"
          onSave={handleBackupSave}
          options={productionUnits}
        />
      )
    },
    {
      title: '需求日期',
      dataIndex: 'demand_date',
      width: 120,
      render: (text: string, record: BackupMaterial) => (
        <EditableCell
          value={text}
          record={record}
          dataIndex="demand_date"
          onSave={handleBackupSave}
        />
      )
    },
    {
      title: '重量(kg)',
      dataIndex: 'weight',
      width: 90,
      render: (_text: string, record: BackupMaterial) => {
        const show = Number(record.weight || 0)
        return (
          <span className="text-blue-600 font-medium">{show > 0 ? show.toFixed(3) : '-'}</span>
        )
      }
    },
    
    {
      title: '金额(元)',
      dataIndex: 'total_price',
      width: 100,
      render: (_text: string, record: BackupMaterial) => {
        const show = Number(record.total_price || 0)
        return (
          <span className="text-blue-600 font-medium">{show > 0 ? `¥${show.toFixed(2)}` : '-'}</span>
        )
      }
    },
    {
      title: '提交人',
      dataIndex: 'applicant',
      width: 100,
      render: (text: string, record: BackupMaterial) => (
        <EditableCell
          value={text || user?.real_name || ''}
          record={record}
          dataIndex="applicant"
          onSave={handleBackupSave}
        />
      )
    }
  ];

  useEffect(() => {
    fetchProductionUnits();
    fetchSuppliers();
    fetchMaterials();
    fetchPartTypes();
    fetchManualData();
    fetchBackupData();
    void loadTempPlanHiddenIds();
    const handler = () => setHiddenTick(v => v + 1)
    const statusHandler = () => {
      fetchManualData();
      fetchBackupData();
      void loadTempPlanHiddenIds();
    };
    window.addEventListener('temporary_plans_updated', handler)
    window.addEventListener('status_updated', statusHandler)
    return () => {
      window.removeEventListener('temporary_plans_updated', handler)
      window.removeEventListener('status_updated', statusHandler)
    }
  }, [loadTempPlanHiddenIds]);

  return (
    <div style={{ padding: '16px 0', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', paddingTop: 0, paddingBottom: 8, flexShrink: 0 }} className="flex items-center justify-end mb-4">
        <Space>
          <Button size="small" onClick={downloadExcelTemplate}>
            下载模板
          </Button>
          <Button size="small" loading={excelImporting} disabled={excelImporting} style={{ position: 'relative', overflow: 'hidden' }}>
            导入EXCEL
            <input
              key={excelInputKey}
              ref={excelFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={excelImporting}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleExcelImport(file)
              }}
            />
          </Button>
          <Button danger disabled={(selectedManualRowKeys.length + selectedBackupRowKeys.length) === 0} onClick={handleBatchDeleteAll}>
            批量删除 ({selectedManualRowKeys.length + selectedBackupRowKeys.length})
          </Button>
          <Button type="primary" disabled={(selectedManualRowKeys.length + selectedBackupRowKeys.length) === 0} onClick={handleGeneratePurchaseAll}>
            生成采购单
          </Button>
        </Space>
      </div>
      <div ref={tableWrapRef} style={{ flex: 1, overflow: 'auto' }}>
        <style>{`
          .excel-table { --row-h: ${rowH}px; }
          .excel-table .ant-table-thead > tr > th {
            height: var(--row-h) !important;
            background: #fafafa;
            font-weight: 600;
            position: sticky;
            top: 0;
            z-index: 10;
            border: 1px solid #d9d9d9;
            text-align: center;
            padding: 8px;
            font-size: 13px;
          }
          .excel-table .ant-table-tbody > tr > td {
            height: var(--row-h) !important;
            padding: 0 8px;
            border: 1px solid #e8e8e8;
            transition: none;
          }
          .excel-table .ant-table-tbody > tr:hover > td {
            background-color: #f8f9fa;
          }
          .excel-table .ant-table-tbody > tr:nth-child(even) {
            background-color: #fafafa;
          }
          .excel-table .ant-table-tbody > tr:nth-child(odd) {
            background-color: #ffffff;
          }
          .editing-input { 
            border: none !important; 
            box-shadow: none !important; 
            outline: none !important; 
            background: transparent !important; 
          }
          .editing-input.ant-input:focus { 
            border: none !important; 
            box-shadow: none !important; 
            outline: none !important; 
          }
          .excel-table .ant-table-tbody > tr > td .ant-select,
          .excel-table .ant-table-tbody > tr > td .ant-input,
          .excel-table .ant-table-tbody > tr > td .ant-input-number,
          .excel-table .ant-table-tbody > tr > td .ant-picker {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            width: 100% !important;
            height: 100% !important;
          }
          .excel-table .ant-select-selector {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
        `}</style>
        
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div style={{ fontWeight: 600, fontSize: 14 }}>标准件</div>
            <Button type="dashed" size="small" onClick={handleAddManual} icon={<ToolOutlined />}>添加标准件</Button>
          </div>
          <Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={handleEmergencyRefresh}>刷新</Button>
            <span style={{ color: '#666' }}>共 {manualAll.length} 条，当前显示 {Math.min(manualLimit, manualAll.length)} 条</span>
            {manualAll.length > manualLimit && (
              <Button size="small" onClick={() => {
                const next = manualAll
                setManualLimit(next.length)
                setManualDataPreserveScroll(() => next as any)
              }}>显示全部</Button>
            )}
          </Space>
        </div>

        {/* 表格区域 - 使用工装信息系统的成熟样式 */}
        <Table
          className="excel-table"
          rowKey="id"
          rowSelection={manualRowSelection}
          columns={manualColumns}
          dataSource={(() => {
            // 使用 refreshKey 确保数据过滤在状态更新后重新执行
            void refreshKey;
            void hiddenTick;

            const filtered = manualData.filter(r => {
              // 确保 ID 比较时类型一致，且去除可能的空白
              const rid = String(r.id).trim();
              return !tempHiddenManualIds.includes(rid);
            })

            return filtered
          })()}
          pagination={false}
          bordered={false}
          scroll={{ y: 'calc(100% - 10px)' }}
          size="small"
          locale={{ emptyText: '' }}
          onRow={(record) => ({
            className: ((() => {
              const nameOk = !!String((record as any).part_name || '').trim()
              const q = (record as any).part_quantity
              const qtyOk = !(q === '' || q === null || typeof q === 'undefined') && Number(q) > 0
              const unitOk = !!String((record as any).unit || '').trim()
              const projectOk = !!String((record as any).project_name || '').trim()
              const prodUnitOk = !!String((record as any).production_unit || '').trim()
              const demandDateOk = !!String((record as any).demand_date || '').match(/\d{4}-\d{2}-\d{2}/)
              const applicantOk = !!String((record as any).applicant || user?.real_name || '').trim()
              return nameOk && qtyOk && unitOk && projectOk && prodUnitOk && demandDateOk && applicantOk ? 'text-blue-600' : undefined
            })()),
            style: { height: `${rowH}px` }
          })}
        />

        

        {/* 备用材料表格 */}
        <div style={{ marginTop: '20px' }}>
          {/* 备用材料标题 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div style={{ fontWeight: 600, fontSize: 14 }}>备用料</div>
              <Button type="dashed" size="small" onClick={handleAddBackup} icon={<ToolOutlined />}>添加备用料</Button>
            </div>
            <Space>
              <Button size="small" icon={<ReloadOutlined />} onClick={handleEmergencyRefresh}>刷新</Button>
              <span style={{ color: '#666' }}>共 {backupAll.length} 条，当前显示 {Math.min(backupLimit, backupAll.length)} 条</span>
              {backupAll.length > backupLimit && (
                <Button size="small" onClick={() => {
                  const next = backupAll
                  setBackupLimit(next.length)
                  setBackupDataPreserveScroll(() => next as any)
                }}>显示全部</Button>
              )}
            </Space>
          </div>

          {/* 备用材料表格 */}
          <Table
            className="excel-table"
            rowKey="id"
            rowSelection={backupRowSelection}
            columns={backupColumns}
          dataSource={(() => {
            // 使用 refreshKey 确保数据过滤在状态更新后重新执行
            void refreshKey;
            void hiddenTick;

            const filtered = backupData.filter(r => {
              // 确保 ID 比较时类型一致，且去除可能的空白
              const rid = String(r.id).trim();
              return !tempHiddenBackupIds.includes(rid);
            })

            return filtered
          })()}
            pagination={false}
            bordered={false}
            scroll={{ y: 'calc(100% - 10px)' }}
            size="small"
            locale={{ emptyText: '' }}
            onRow={(record) => ({
              className: ((() => {
                const nameOk = !!String((record as any).material_name || '').trim()
                const qtyOk = !( (record as any).quantity === '' || (record as any).quantity === null || typeof (record as any).quantity === 'undefined') && Number((record as any).quantity) > 0
                const projectOk = !!String((record as any).project_name || '').trim()
                const prodUnitOk = !!String((record as any).production_unit || '').trim()
                const demandDateOk = !!String((record as any).demand_date || '').match(/\d{4}-\d{2}-\d{2}/)
                const amountOk = !( (record as any).total_price === '' || (record as any).total_price === null || typeof (record as any).total_price === 'undefined')
                const applicantOk = !!String((record as any).applicant || user?.real_name || '').trim()
                return nameOk && qtyOk && projectOk && prodUnitOk && demandDateOk && amountOk && applicantOk ? 'text-blue-600' : undefined
              })()),
              style: { height: `${rowH}px` }
            })}
          />

          
        </div>
      </div>
    </div>
  );
}
