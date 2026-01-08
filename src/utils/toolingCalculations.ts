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
export const calculateVolume = (rawFormula: string, specifications: Record<string, number>): number => {
  if (!rawFormula) return 0;
  try {
    // 1) 规范化公式字符
    let expression = rawFormula
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/[－—–﹣]/g, '-')
      .replace(/[＋﹢]/g, '+')
      .replace(/[（﹙]/g, '(')
      .replace(/[）﹚]/g, ')')
      .replace(/φ/g, '')
      .replace(/π/g, Math.PI.toString())
      .replace(/²/g, '**2');

    // 2) 变量映射与同义键
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

    // 3) 收集有效数值
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

    // 派生量
    if (values['直径'] !== undefined && values['半径'] === undefined) values['半径'] = values['直径'] / 2;
    if (values['外径'] !== undefined && values['外半径'] === undefined) values['外半径'] = values['外径'] / 2;
    if (values['内径'] !== undefined && values['内半径'] === undefined) values['内半径'] = values['内径'] / 2;

    // 4) 缺失变量保护：若公式包含某变量但无值，返回0
    const supportedVars = Object.keys(varKeyMap).concat(['半径', '外半径', '内半径']);
    const unresolved = supportedVars.filter((varName) => new RegExp(varName, 'g').test(expression) && values[varName] === undefined);
    if (unresolved.length > 0) return 0;

    // 5) 替换变量为数值
    supportedVars.forEach((varName) => {
      const num = values[varName];
      if (num !== undefined) {
        const re = new RegExp(varName, 'g');
        expression = expression.replace(re, num.toString());
      }
    });

    // 6) 计算
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
