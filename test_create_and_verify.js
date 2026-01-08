// 创建测试工装并验证盘存编号功能
const createTestToolingAndTestInventory = async () => {
  console.log('=== 创建测试工装并验证盘存编号绑定 ===');
  
  try {
    // 1. 创建测试工装
    console.log('1. 创建测试工装...');
    const createToolingResponse = await fetch('http://localhost:3020/api/tooling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inventory_number: 'TEST001',
        production_unit: '测试单位',
        category: '测试类别',
        project_name: '测试项目',
        sets_count: 1,
        recorder: '测试员'
      })
    });
    
    if (!createToolingResponse.ok) {
      console.log('创建工装失败');
      return;
    }
    
    const toolingData = await createToolingResponse.json();
    const tooling = toolingData.data;
    console.log(`✓ 工装创建成功: ID=${tooling.id}`);
    
    // 2. 创建测试零件
    console.log('2. 创建测试零件...');
    const createPartResponse = await fetch(`http://localhost:3020/api/tooling/${tooling.id}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_drawing_number: 'PART-001',
        part_name: '测试零件',
        part_quantity: 2,
        part_category: '板料',
        source: '自备'
      })
    });
    
    if (!createPartResponse.ok) {
      console.log('创建零件失败');
      return;
    }
    
    const partData = await createPartResponse.json();
    const part = partData.data;
    console.log(`✓ 零件创建成功: ID=${part.id}`);
    
    // 3. 检查零件的盘存编号
    console.log('3. 检查零件盘存编号...');
    const partsResponse = await fetch(`http://localhost:3020/api/tooling/${tooling.id}/parts`);
    const partsData = await partsResponse.json();
    
    console.log('零件数据:', partsData);
    
    if (partsData.items && partsData.items.length > 0) {
      const testPart = partsData.items[0];
      console.log(`零件盘存编号: ${testPart.part_inventory_number || '无'}`);
      console.log(`期望格式: ${tooling.inventory_number}01`);
      
      if (testPart.part_inventory_number === 'TEST00101') {
        console.log('✓ 盘存编号格式正确');
      } else {
        console.log('✗ 盘存编号格式错误');
      }
    }
    
    // 4. 测试更新零件盘存编号
    console.log('4. 测试手动更新盘存编号...');
    const updateResponse = await fetch(`http://localhost:3020/api/tooling/parts/${part.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_inventory_number: 'TEST00102'
      })
    });
    
    if (updateResponse.ok) {
      console.log('✓ 手动更新盘存编号成功');
      
      // 验证更新结果
      const verifyResponse = await fetch(`http://localhost:3020/api/tooling/${tooling.id}/parts`);
      const verifyData = await verifyResponse.json();
      const updatedPart = verifyData.items[0];
      
      if (updatedPart.part_inventory_number === 'TEST00102') {
        console.log('✓ 手动更新验证成功');
      } else {
        console.log('✗ 手动更新验证失败');
      }
    } else {
      console.log('✗ 手动更新盘存编号失败');
    }
    
    console.log('=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
};

// 运行测试
createTestToolingAndTestInventory();