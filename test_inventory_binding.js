// 测试盘存编号绑定功能
const testInventoryBinding = async () => {
  console.log('=== 开始测试盘存编号绑定功能 ===');
  
  try {
    // 1. 首先获取现有的工装信息
    console.log('1. 获取现有工装信息...');
    const toolingResponse = await fetch('http://localhost:3020/api/tooling?page=1&pageSize=10');
    const toolingData = await toolingResponse.json();
    
    if (!toolingData.success || !toolingData.data || toolingData.data.length === 0) {
      console.log('没有找到工装数据，需要先创建工装');
      return;
    }
    
    const tooling = toolingData.data[0];
    console.log(`找到工装: ID=${tooling.id}, 盘存编号=${tooling.inventory_number || '无'}`);
    
    // 2. 获取该工装的零件信息
    console.log('2. 获取工装零件信息...');
    const partsResponse = await fetch(`http://localhost:3020/api/tooling/${tooling.id}/parts`);
    const partsData = await partsResponse.json();
    
    console.log('零件数据:', partsData);
    
    if (!partsData.items || partsData.items.length === 0) {
      console.log('该工装没有零件，测试完成');
      return;
    }
    
    // 3. 检查每个零件的盘存编号
    partsData.items.forEach((part, index) => {
      console.log(`零件 ${index + 1}:`);
      console.log(`  ID: ${part.id}`);
      console.log(`  图号: ${part.part_drawing_number || '无'}`);
      console.log(`  名称: ${part.part_name || '无'}`);
      console.log(`  盘存编号: ${part.part_inventory_number || '无'}`);
      console.log(`  父级盘存编号: ${tooling.inventory_number || '无'}`);
      
      // 验证盘存编号格式
      if (part.part_inventory_number && tooling.inventory_number) {
        const expectedPattern = new RegExp(`^${tooling.inventory_number}\\d{2}$`);
        const isValid = expectedPattern.test(part.part_inventory_number);
        console.log(`  格式验证: ${isValid ? '✓ 正确' : '✗ 错误'}`);
      }
    });
    
    // 4. 测试更新零件（如果存在有内容的零件）
    const testPart = partsData.items.find(p => p.part_drawing_number || p.part_name);
    if (testPart) {
      console.log('3. 测试更新零件盘存编号...');
      
      // 先更新工装盘存编号（如果不存在）
      if (!tooling.inventory_number) {
        console.log('更新工装盘存编号为 TEST001');
        const updateToolingResponse = await fetch(`http://localhost:3020/api/tooling/${tooling.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventory_number: 'TEST001' })
        });
        
        if (!updateToolingResponse.ok) {
          console.log('更新工装盘存编号失败');
          return;
        }
      }
      
      // 更新零件信息
      console.log(`更新零件 ${testPart.id} 的信息...`);
      const updatePartResponse = await fetch(`http://localhost:3020/api/tooling/parts/${testPart.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part_inventory_number: 'TEST00101'
        })
      });
      
      if (updatePartResponse.ok) {
        console.log('✓ 零件盘存编号更新成功');
      } else {
        console.log('✗ 零件盘存编号更新失败');
      }
    }
    
    console.log('=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
};

// 运行测试
testInventoryBinding();