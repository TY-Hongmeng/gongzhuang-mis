// 工装信息相关工具函数

import { CATEGORY_CODE_MAP } from '../types/tooling'

// 生成盘存编号函数 - 根据输入内容生成
export const generateInventoryNumber = (rowData: any, existingData: any[]) => {
  if (!rowData.category || !rowData.received_date) return ''
  
  const categoryCode = CATEGORY_CODE_MAP[rowData.category] || 'QT'
  const datePart = rowData.received_date.replace(/-/g, '').slice(2)
  
  // 计算同前缀的数量
  const todayCount = existingData.filter((r: any) => 
    r.inventory_number && 
    r.inventory_number.startsWith(categoryCode + datePart) && 
    r.id !== rowData.id // 排除当前行
  ).length
  
  const serialNumber = String(todayCount + 1).padStart(2, '0')
  return categoryCode + datePart + serialNumber
}

// 检查是否可以生成盘存编号
export const canGenerateInventoryNumber = (rowData: any) => {
  return rowData.category && rowData.received_date && rowData.project_name && 
         rowData.project_name.trim() !== '' && !rowData.inventory_number
}

// 解析体积公式并提取变量
export const parseVolumeFormula = (formula: string): string[] => {
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

// 根据规格文本和公式计算体积
export const calculateVolume = (formula: string, specifications: Record<string, number>): number => {
  if (!formula) return 0;
  
  try {
    let expression = formula;
    
    // 替换变量为实际值
    Object.entries(specifications).forEach(([key, value]) => {
      const regex = new RegExp(key, 'g');
      expression = expression.replace(regex, value.toString());
    });
    
    // 处理数学函数
    expression = expression.replace(/π/g, Math.PI.toString());
    expression = expression.replace(/²/g, '**2');
    
    // 安全计算表达式
    const result = Function('"use strict"; return (' + expression + ')')();
    return isNaN(result) ? 0 : result;
  } catch (error) {
    console.error('体积计算错误:', error);
    return 0;
  }
};

// 解析规格文本为数值对象
export const parseSpecifications = (specText: string, formula: string): Record<string, number> => {
  const vars = parseVolumeFormula(formula);
  const specs: Record<string, number> = {};
  
  if (!specText) return specs;
  
  // 简单的键值对解析，格式如：长:100,宽:50,高:20
  const pairs = specText.split(',');
  pairs.forEach(pair => {
    const [key, value] = pair.split(':');
    if (key && value) {
      const trimmedKey = key.trim();
      const numValue = parseFloat(value.trim());
      if (vars.includes(trimmedKey) && !isNaN(numValue)) {
        specs[trimmedKey] = numValue;
      }
    }
  });
  
  return specs;
};

// 将规格对象转换为显示文本
export const formatSpecifications = (specs: Record<string, any> | undefined): string => {
  if (!specs || Object.keys(specs).length === 0) return '';
  return Object.entries(specs)
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
};

// 判断是否应该自动填入责任人（任何一列输入内容就触发）
export const shouldAutoFillRecorder = (row: any): boolean => {
  // 检查是否有任何字段有值（除id和recorder外）
  const fieldsToCheck = [
    row.inventory_number,
    row.project_name,
    row.production_unit,
    row.category,
    row.received_date,
    row.demand_date,
    row.completed_date,
    row.production_date
  ]
  // 只要有任何一个字段有值就返回true
  return fieldsToCheck.some(field => field && field.toString().trim() !== '')
}

// 计算零件重量
export const calculatePartWeight = (
  specifications: Record<string, any>,
  materialId: string,
  partCategory: string,
  materials: Array<{id: string, name: string, density: number}>,
  partTypes: Array<{id: string, name: string, volume_formula?: string}>
): number => {
  const currentPartType = partTypes.find(pt => pt.name === partCategory);
  const formula = currentPartType?.volume_formula || '';
  const material = materials.find(m => m.id === materialId);
  const density = material?.density || 7.85; // 默认钢材密度 g/cm³
  
  let weight = 0;
  const hasSpecs = specifications && Object.keys(specifications).length > 0;
  
  if (hasSpecs && formula) {
    // 将规格对象转换为数值对象进行计算
    const specValues: Record<string, number> = {};
    Object.entries(specifications).forEach(([k, v]) => {
      const numValue = parseFloat(String(v));
      if (!isNaN(numValue)) {
        specValues[k] = numValue;
      }
    });
    
    const volume = calculateVolume(formula, specValues); // 计算出的体积单位是 mm³
    const volumeInCm3 = volume / 1000; // 转换为 cm³
    weight = (volumeInCm3 * density) / 1000; // 转换为 kg
  }
  
  return Math.round(weight * 1000) / 1000; // 保留3位小数
};

// 生成零件盘存编号
export const generatePartInventoryNumber = (
  parentInventoryNumber: string,
  partIndex: number,
  partData: any
): string => {
  const hasContent = partData.part_drawing_number || partData.part_name || partData.part_quantity;
  
  if (!hasContent || !parentInventoryNumber) {
    return '';
  }
  
  return `${parentInventoryNumber}${String(partIndex + 1).padStart(2, '0')}`;
};

// 确保有足够的空白行
export const ensureBlankRows = <T extends { id: string }>(
  items: T[],
  toolingId: string,
  blankCount: number = 2,
  createBlankItem: (index: number) => T
): T[] => {
  const blanks = items.filter(x => x.id.startsWith('blank-')).length;
  const arr = [...items];
  
  for (let i = blanks; i < blankCount; i++) {
    arr.push(createBlankItem(i));
  }
  
  return arr;
};