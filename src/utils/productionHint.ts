// 获取下料单格式提示
export const getProductionFormatHint = (partType: string): string => {
  switch (partType) {
    case '板料':
      return 'A*B*C';
    case '圆料':
      return 'φA*B';
    case '圆环':
      return 'φA-B*C';
    case '板料割圆':
      return 'φA*B';
    case '锯床割方':
      return 'A*B*C';
    case '圆管':
    default:
      return '长*宽*高';
  }
};