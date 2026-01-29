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
import { formatSpecificationsForProduction, parseProductionSpecifications } from '../../utils/productionFormat';
import { getProductionFormatHint } from '../../utils/productionHint';
import { getApplicableMaterialPrice, calculateTotalPrice } from '../../utils/priceCalculator';
import SpecificationsInput from '../../components/SpecificationsInput';
import EditableCell from '../../components/EditableCell';
import { useToolingOperations } from '../../hooks/useToolingOperations';

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
  const rowH = 32;

  // 备用材料状态
  const [backupData, setBackupData] = useState<BackupMaterial[]>([]);
  const [selectedBackupRowKeys, setSelectedBackupRowKeys] = useState<React.Key[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [materials, setMaterials] = useState<{id: string, name: string, density?: number}[]>([]);
  const [hiddenTick, setHiddenTick] = useState(0)
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
  const [materialPrices, setMaterialPrices] = useState<Record<string, any[]>>({});
  const ensureMaterialPriceLoaded = useCallback(async (materialId: string) => {
    if (!materialId) return;
    if (Array.isArray(materialPrices[materialId]) && materialPrices[materialId].length > 0) return;
    try {
      const resp = await fetch(`/api/materials/${materialId}/prices`);
      if (!resp.ok) return;
      const js = await resp.json();
      const list = js?.data || [];
      setMaterialPrices(prev => ({ ...prev, [materialId]: list }));
    } catch {}
  }, [materialPrices]);

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
      const applicantOk = !!String(user?.real_name || '').trim()
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
      const prices = materialPrices[materialId] || []
      const dateKey = (r.demand_date && /^\d{4}-\d{2}-\d{2}$/.test(String(r.demand_date))) ? String(r.demand_date) : new Date().toISOString().split('T')[0]
      const unitPrice = getApplicableMaterialPrice(prices, dateKey) || 0
      const totalPrice = calculateTotalPrice(totalW, unitPrice)

      orders.push({
        inventory_number: `BACKUP-${r.id}`,
        project_name: r.project_name || '临时计划',
        part_name: String(r.material_name || '').trim(),
        part_quantity: qty,
        unit: (String(r.unit ?? '').trim() || '件'),
        model: modelText,
        supplier: String(r.supplier || '').trim(),
        required_date: String(r.demand_date || '').trim(),
        remark: String(r.remark || '').trim(),
        created_date: new Date().toISOString(),
        production_unit: '',
        demand_date: String(r.demand_date || '').trim(),
        applicant: String(user?.real_name || '手动录入'),
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
      const response = await fetch('/api/options/production-units', { cache: 'no-store' });
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
      const response = await fetch('/api/options/suppliers', { cache: 'no-store' });
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
      const response = await fetch('/api/materials', { cache: 'no-store' });
      if (response.ok) {
        const result = await response.json();
        if (result && result.data) {
          setMaterials(result.data);
          setMaterialPrices({});
        }
      }
    } catch (error) {
      console.error('获取材质选项失败:', error);
    }
  };

  // 获取料型选项 - 与工装信息保持一致
  const fetchPartTypes = async () => {
    try {
      const response = await fetch('/api/part-types', { cache: 'no-store' });
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

  // 获取手动输入的数据（使用独立的临时计划数据源）
  const fetchManualData = async () => {
    try {
      const response = await fetch('/api/manual-plans');
      
      if (response.ok) {
        const result = await response.json();
        
        if (result && result.data && Array.isArray(result.data)) {
          const manualOrders = result.data.map((order: any) => ({
            ...order,
            part_quantity: String(order.part_quantity || ''),
            is_manual: true
          }));
          
          // 根据本地位置映射排序，保持用户创建时的行位置
          const posMap = getManualPos();
          const placed = applyPositions(manualOrders as any, posMap) as any[]
          setManualAll(placed as any)
          const sliced = placed.slice(0, manualLimit)
          
          setManualData(sliced as any);
        } else {
        }
      } else {
        const errorText = await response.text();
        if (response.status === 500 && /fetch failed/i.test(errorText)) {
          setManualData([]);
          message.warning('手动采购单数据暂不可用（网络波动），稍后重试');
          return;
        }
      }
    } catch (error) {
    }
  };

  // 获取备用材料数据
  const fetchBackupData = async () => {
    try {
      const response = await fetch('/api/backup-materials');
      
      if (response.ok) {
        const result = await response.json();
        
        if (result && result.data && Array.isArray(result.data)) {
          const backupMaterials = result.data.map((material: any) => {
            // 如果后端不返回规格对象，则从规格文本解析，保证初始渲染即可显示
            const parsedSpecs = (material.specifications && Object.keys(material.specifications || {}).length > 0)
              ? material.specifications
              : (material.model ? parseProductionSpecifications(String(material.model), material.material_type || '') : {})
            return {
              ...material,
              quantity: String(material.quantity || ''),
              price: String(material.price || ''),
              specifications: parsedSpecs,
              weight: material.weight || 0,
              unit_price: material.unit_price || 0,
              total_price: material.total_price || 0,
              // 兼容显示：后端存 supplier，用于前端的 production_unit 展示
              production_unit: material.production_unit || material.supplier || '',
              is_manual: true
            };
          });
          
          // 根据本地位置映射排序，保持用户创建时的行位置
          const posMapB = getBackupPos();
            const placedB = applyPositions(backupMaterials as any, posMapB) as any[]
            setBackupAll(placedB as any)
            const slicedB = placedB.slice(0, backupLimit)
          
          setBackupData(slicedB as any);
        } else {
        }
      } else {
        const errorText = await response.text();
        if (response.status === 500 && /fetch failed/i.test(errorText)) {
          setBackupData([]);
          message.warning('备用材料数据暂不可用（网络波动），稍后重试');
          return;
        }
      }
    } catch (error) {
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
            const response = await fetch('/api/manual-plans', {
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
            
            const createdList = Array.isArray(result?.data) ? result.data : [];
            const created = createdList[0];
            if (!created || !created.id) {
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

          const response = await fetch(`/api/manual-plans/${id}`, {
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
      const response = await fetch('/api/manual-plans/batch-delete', {
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
      } else if (typeof updatedRow.specifications === 'string') {
        updatedRow.specifications = parseProductionSpecifications(String(updatedRow.specifications), updatedRow.material_type || '');
      }
      
      // 如果更新了材质、料型、规格或数量，需要重新计算重量和价格
      if (key === 'material' || key === 'material_type' || key === 'specifications' || key === 'quantity') {
        const currentMaterial = materials.find(m => m.name === updatedRow.material);
        const materialId = currentMaterial?.id || '';
        const weight = calculatePartWeight(updatedRow.specifications || {}, materialId, updatedRow.material_type || '', partTypes, materials);
        const quantityNum = parseInt(updatedRow.quantity || '0') || 0;
        const totalWeight = quantityNum > 0 ? weight * quantityNum : 0;
        const mat = materials.find(m => m.name === updatedRow.material)
        const materialIdForPrice = mat?.id || ''
        await ensureMaterialPriceLoaded(materialIdForPrice);
        const prices = materialPrices[materialIdForPrice] || [];
        const applicablePrice = getApplicableMaterialPrice(prices, new Date().toISOString().split('T')[0]);
        const unitPrice = applicablePrice || 0;
        const totalPrice = calculateTotalPrice(totalWeight, unitPrice);
        
        updatedRow.weight = weight;
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
            const response = await fetch('/api/backup-materials', {
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
            
            const firstResult = result?.results?.[0];
            
            if (!firstResult?.success) {
              throw new Error(firstResult?.error || '创建失败 - 数据验证错误');
            }
            
            const created = firstResult?.data;
            
            if (!created?.id) {
              throw new Error('创建失败 - 缺少记录ID');
            }
            
            // 替换空白行为新创建的记录
            setBackupDataPreserveScroll(prev => {
              const updated = prev.map(r => 
                r.id === id ? { 
                  ...firstResult.data, 
                  quantity: String(firstResult.data.quantity || ''),
                  price: String(firstResult.data.price || ''),
                  is_manual: true
                } : r
              );
              const idx = prev.findIndex(r => r.id === id);
              if (idx >= 0) setBackupPos(String(firstResult.data.id), idx);
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
          console.log('更新现有备用材料记录:', { id, key, value });
          
          // 仅在修改必填字段时进行校验（名称、单位）
          const isRequiredField = key === 'material_name' || key === 'unit';
          if (isRequiredField) {
            const validationErrors = validateBackupMaterial(updatedRow);
            if (validationErrors.length > 0) {
              console.warn('字段验证失败(静默):', validationErrors.join(', '));
              return;
            }
          }
          
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
          
          // 规格对象不持久化；材质/料型更新仅提交该字段本身
          
          // 前端乐观更新，确保立即显示；不再在编辑时重复插入空白行，避免行跳动
          setBackupDataPreserveScroll(prev => prev.map(r => r.id === id ? {
            ...r,
            [key]: value,
            ...(key === 'specifications' ? { model: updatedRow.model } : {}),
            ...(key === 'production_unit' ? { supplier: String(value || '').trim() } : {}),
          } : r))

          const response = await fetch(`/api/backup-materials/${id}`, {
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
      const response = await fetch('/api/backup-materials/batch-delete', {
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
        tasks.push(fetch('/api/manual-plans/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: manualIds })
        }))
      }
      if (backupIds.length > 0) {
        tasks.push(fetch('/api/backup-materials/batch-delete', {
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
            await ensureMaterialPriceLoaded(materialId);
            const prices = materialPrices[materialId] || [];
            const unitPrice = getApplicableMaterialPrice(prices, new Date().toISOString().split('T')[0]) || 0;
            const totalPrice = calculateTotalPrice(totalWeight, unitPrice);
            const formatted = formatSpecificationsForProduction(newSpecs as any, record.material_type || '');
            setBackupDataPreserveScroll(prev => prev.map(r => r.id === record.id ? {
              ...r,
              specifications: newSpecs as any,
              model: formatted,
              weight,
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
          value={text}
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
    const handler = () => setHiddenTick(v => v + 1)
    window.addEventListener('temporary_plans_updated', handler)
    return () => window.removeEventListener('temporary_plans_updated', handler)
  }, []);

  return (
    <div style={{ padding: '16px 0', height: 'calc(100vh - 200px)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', paddingTop: 0, paddingBottom: 8 }} className="flex items-center justify-end mb-4">
        <Space>
          <Button danger disabled={(selectedManualRowKeys.length + selectedBackupRowKeys.length) === 0} onClick={handleBatchDeleteAll}>
            批量删除 ({selectedManualRowKeys.length + selectedBackupRowKeys.length})
          </Button>
          <Button type="primary" disabled={(selectedManualRowKeys.length + selectedBackupRowKeys.length) === 0} onClick={handleGeneratePurchaseAll}>
            生成采购单
          </Button>
        </Space>
      </div>
      <div ref={tableWrapRef} style={{ height: 'calc(100vh - 240px)', overflow: 'auto' }}>
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
            const hiddenManualIds = (() => { try { return JSON.parse(localStorage.getItem('temporary_hidden_manual_ids') || '[]') } catch { return [] } })()
            return manualData.filter(r => !hiddenManualIds.includes(String(r.id)))
          })()}
          pagination={false}
          bordered={false}
          scroll={{ y: 'calc(100vh - 240px)' }}
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
              const hiddenBackupIds = (() => { try { return JSON.parse(localStorage.getItem('temporary_hidden_backup_ids') || '[]') } catch { return [] } })()
              return backupData.filter(r => !hiddenBackupIds.includes(String(r.id)))
            })()}
            pagination={false}
            bordered={false}
            scroll={{ y: 'calc(100vh - 240px)' }}
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
                const applicantOk = !!String(user?.real_name || '').trim()
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
