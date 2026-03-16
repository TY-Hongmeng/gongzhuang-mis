/**
 * 计算零件的总价格
 * @param totalWeight 总重量（kg）
 * @param unitPrice 单价（元/kg）
 * @returns 总价格（元）
 */
export function calculateTotalPrice(totalWeight: number, unitPrice: number): number {
  if (!totalWeight || !unitPrice) {
    return 0;
  }
  return Math.round(totalWeight * unitPrice * 100) / 100; // 保留2位小数
}
