import { MaterialPrice } from '../types/tooling';

/**
 * 根据接收日期获取适用的材料价格
 * @param prices 材料价格历史数组
 * @param receivingDate 接收日期（YYYY-MM-DD格式）
 * @returns 适用的单价，如果未找到则返回0
 */
export function getApplicableMaterialPrice(prices: MaterialPrice[], receivingDate?: string): number {
  if (!prices || prices.length === 0) {
    return 0;
  }

  const list = [...prices]
    .filter((p) => p && p.unit_price != null && p.effective_start_date)
    .sort((a, b) => new Date(b.effective_start_date).getTime() - new Date(a.effective_start_date).getTime())
  if (list.length === 0) return 0

  if (!receivingDate) {
    return Number(list[0].unit_price || 0);
  }

  const targetDate = new Date(receivingDate);
  if (Number.isNaN(targetDate.getTime())) {
    return Number(list[0].unit_price || 0)
  }
  
  const applicablePrice = list.find(price => {
    const startDate = new Date(price.effective_start_date);
    const endDate = price.effective_end_date ? new Date(price.effective_end_date) : null;
    
    return startDate <= targetDate && (!endDate || endDate >= targetDate);
  });

  if (!applicablePrice) {
    const validPrices = list.filter(price => new Date(price.effective_start_date) <= targetDate);
    if (validPrices.length === 0) return 0;
    return Number(validPrices[0].unit_price || 0);
  }

  return Number(applicablePrice.unit_price || 0);
}

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
