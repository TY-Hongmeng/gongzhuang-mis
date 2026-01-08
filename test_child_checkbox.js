// 测试标准件复选框功能
const testChildItemCheckbox = () => {
  console.log('=== 测试标准件复选框功能 ===');
  
  // 模拟标准件数据
  const mockChildItems = [
    { id: 'child-1', name: '标准件1', model: 'M1', quantity: 10, unit: '个' },
    { id: 'child-2', name: '标准件2', model: 'M2', quantity: 20, unit: '个' },
    { id: 'blank-child-123', name: '', model: '', quantity: '', unit: '' }
  ];
  
  // 测试复选框逻辑
  console.log('标准件数据:', mockChildItems);
  
  // 测试选择逻辑
  const selectedKeys = ['child-1'];
  const processedList = mockChildItems;
  
  // 模拟onChange事件
  const newKeys = ['child-1', 'child-2'];
  const prefixed = newKeys.map(k => 'child-' + k);
  console.log('新选择的key:', newKeys);
  console.log('添加前缀后的key:', prefixed);
  
  // 测试空白行过滤
  const nonBlankItems = processedList.filter(item => !String(item.id || '').startsWith('blank-child-'));
  console.log('非空白行数据:', nonBlankItems);
  
  // 测试禁用逻辑
  const disabledItems = processedList.filter(item => String(item.id || '').startsWith('blank-child-'));
  console.log('应该禁用的空白行:', disabledItems);
  
  console.log('✓ 标准件复选框逻辑测试完成');
};

testChildItemCheckbox();