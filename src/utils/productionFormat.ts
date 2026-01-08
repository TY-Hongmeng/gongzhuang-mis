// 下料单格式转换函数
export const formatSpecificationsForProduction = (specs: Record<string, any> | undefined, partType: string): string => {
  if (!specs || Object.keys(specs).length === 0) return '';
  
  switch (partType) {
    case '板料':
      const length = specs['长'] || specs['A'] || 0;
      const width = specs['宽'] || specs['B'] || 0;
      const height = specs['高'] || specs['C'] || 0;
      return `${length}*${width}*${height}`;
      
    case '圆料':
      const diameter = specs['直径'] || specs['φA'] || 0;
      const length2 = specs['高'] || specs['B'] || 0;
      return `φ${diameter}*${length2}`;
      
    case '圆环':
      const outerDiam = specs['外径'] || specs['φA'] || 0;
      const innerDiam = specs['内径'] || specs['φB'] || 0;
      const height3 = specs['高'] || specs['C'] || 0;
      return `φ${outerDiam}-${innerDiam}*${height3}`;
      
    case '板料割圆':
      const diam = specs['直径'] || specs['φA'] || 0;
      const thickness = specs['厚'] || specs['B'] || 0;
      return `φ${diam}*${thickness}`;
      
    case '锯床割方':
      // 支持A*B*C格式显示
      const sawLength = specs['长'] || specs['A'] || 0;
      const sawWidth = specs['宽'] || specs['B'] || 0;
      const sawHeight = specs['高'] || specs['C'] || 0;
      return `${sawLength}*${sawWidth}*${sawHeight}`;
      
    case '圆管':
    default:
      // 默认格式保持原有的键值对格式
      return Object.entries(specs)
        .map(([key, value]) => `${key}:${value}`)
        .join(',');
  }
};

// 解析下料单格式为规格对象
export const parseProductionSpecifications = (specText: string, partType: string): Record<string, number> => {
  const specs: Record<string, number> = {};
  if (!specText) return specs;
  
  switch (partType) {
    case '板料':
      // 格式: A*B*C 或 长*宽*高
      const boardMatch = specText.match(/^(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)$/);
      if (boardMatch) {
        specs['长'] = parseFloat(boardMatch[1]);
        specs['宽'] = parseFloat(boardMatch[2]);
        specs['高'] = parseFloat(boardMatch[3]);
        specs['A'] = parseFloat(boardMatch[1]);
        specs['B'] = parseFloat(boardMatch[2]);
        specs['C'] = parseFloat(boardMatch[3]);
      }
      break;
      
    case '圆料':
      // 格式: φA*B 或 φ直径*高
      const roundMatch = specText.match(/^φ(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)$/);
      if (roundMatch) {
        specs['直径'] = parseFloat(roundMatch[1]);
        specs['高'] = parseFloat(roundMatch[2]);
        specs['φA'] = parseFloat(roundMatch[1]);
        specs['B'] = parseFloat(roundMatch[2]);
      }
      break;
      
    case '圆环':
      // 格式: φA-B*C 或 φ外径-内径*高
      const ringMatch = specText.match(/^φ(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)$/);
      if (ringMatch) {
        specs['外径'] = parseFloat(ringMatch[1]);
        specs['内径'] = parseFloat(ringMatch[2]);
        specs['高'] = parseFloat(ringMatch[3]);
        specs['φA'] = parseFloat(ringMatch[1]);
        specs['φB'] = parseFloat(ringMatch[2]);
        specs['C'] = parseFloat(ringMatch[3]);
      }
      break;
      
    case '板料割圆':
      // 格式: φ直径*厚 或 φA*B
      const circleMatch = specText.match(/^φ(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)$/);
      if (circleMatch) {
        specs['直径'] = parseFloat(circleMatch[1]);
        specs['厚'] = parseFloat(circleMatch[2]);
        specs['φA'] = parseFloat(circleMatch[1]);
        specs['B'] = parseFloat(circleMatch[2]);
      }
      break;
      
    case '锯床割方':
      // 支持A*B*C格式解析
      const sawMatch = specText.match(/^(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)$/);
      if (sawMatch) {
        specs['长'] = parseFloat(sawMatch[1]);
        specs['宽'] = parseFloat(sawMatch[2]);
        specs['高'] = parseFloat(sawMatch[3]);
        specs['A'] = parseFloat(sawMatch[1]);
        specs['B'] = parseFloat(sawMatch[2]);
        specs['C'] = parseFloat(sawMatch[3]);
      } else {
        // 回退到键值对解析
        const pairs = specText.split(',');
        pairs.forEach(pair => {
          const [key, value] = pair.split(':');
          if (key && value) {
            const trimmedKey = key.trim();
            const numValue = parseFloat(value.trim());
            if (!isNaN(numValue)) {
              specs[trimmedKey] = numValue;
            }
          }
        });
      }
      break;
      
    case '圆管':
    default:
      // 默认解析原有的键值对格式
      const pairs = specText.split(',');
      pairs.forEach(pair => {
        const [key, value] = pair.split(':');
        if (key && value) {
          const trimmedKey = key.trim();
          const numValue = parseFloat(value.trim());
          if (!isNaN(numValue)) {
            specs[trimmedKey] = numValue;
          }
        }
      });
      break;
  }
  
  return specs;
};
