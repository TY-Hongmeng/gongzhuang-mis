// 测试价格选择逻辑
const prices = [
  {
    "id": "f13b82dd-8a99-4b4e-92bd-f719240a3af9",
    "unit_price": 22.6,
    "effective_start_date": "2025-11-24",
    "effective_end_date": "2025-12-31"
  },
  {
    "id": "4c363414-fe0e-4415-8c2e-60bbf2df1bf9",
    "unit_price": 25.5,
    "effective_start_date": "2025-12-01",
    "effective_end_date": "2025-12-31"
  },
  {
    "id": "98f2f5a7-2a74-40cf-a5d2-b1445ca7556e",
    "unit_price": 28,
    "effective_start_date": "2026-01-01",
    "effective_end_date": "2026-01-31"
  },
  {
    "id": "04fbf0d1-d0ac-48f1-a862-60f07ad8aa61",
    "unit_price": 30,
    "effective_start_date": "2026-02-01",
    "effective_end_date": null
  }
];

function getApplicableMaterialPrice(prices, receivingDate) {
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

// 测试不同的投图日期
console.log('=== 价格选择逻辑测试 ===');
console.log('价格历史:');
prices.forEach(p => {
  console.log(`  ${p.effective_start_date} 至 ${p.effective_end_date || '至今'}: ¥${p.unit_price}`);
});

console.log('\n=== 测试结果 ===');
const testDates = [
  '2025-11-20', // 早于所有价格
  '2025-11-24', // 第一个价格开始日期
  '2025-12-15', // 在第一个价格期间
  '2025-12-31', // 第一个价格结束日期
  '2026-01-15', // 在第三个价格期间
  '2026-02-15', // 在第四个价格期间
  '2027-01-01'  // 晚于所有价格
];

testDates.forEach(date => {
  const price = getApplicableMaterialPrice(prices, date);
  console.log(`投图日期 ${date}: ¥${price}`);
});