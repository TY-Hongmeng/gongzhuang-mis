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

  // 如果没有接收日期，返回最近的价格（生效开始日期最大的）
  if (!receivingDate) {
    const latestPrice = prices.reduce((latest, current) => {
      return new Date(current.effective_start_date) > new Date(latest.effective_start_date) ? current : latest;
    });
    return latestPrice.unit_price;
  }

  const targetDate = new Date(receivingDate);
  
  // 查找适用的价格：生效开始日期 <= 接收日期，且（生效结束日期为空或 >= 接收日期）
  const applicablePrice = prices.find(price => {
    const startDate = new Date(price.effective_start_date);
    const endDate = price.effective_end_date ? new Date(price.effective_end_date) : null;
    
    return startDate <= targetDate && (!endDate || endDate >= targetDate);
  });

  // 如果没找到精确匹配的价格，返回最近的生效价格
  if (!applicablePrice) {
    const validPrices = prices.filter(price => new Date(price.effective_start_date) <= targetDate);
    if (validPrices.length === 0) return 0;
    
    const latestValidPrice = validPrices.reduce((latest, current) => {
      return new Date(current.effective_start_date) > new Date(latest.effective_start_date) ? current : latest;
    });
    return latestValidPrice.unit_price;
  }

  return applicablePrice.unit_price;
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