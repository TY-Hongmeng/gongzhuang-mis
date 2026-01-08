// 重新测试盘存编号自动生成功能
const testAutoInventoryGeneration = async () => {
  console.log('=== 重新测试盘存编号自动生成功能 ===');
  
  try {
    // 1. 创建测试工装
    console.log('1. 创建测试工装...');
    const createToolingResponse = await fetch('http://localhost:3020/api/tooling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inventory_number: 'AUTO002',
        production_unit: '自动测试单位',
        category: '自动测试类别',
        project_name: '自动测试项目',
        sets_count: 1,
        recorder: '自动测试员'
      })
    });
    
    if (!createToolingResponse.ok) {
      console.log('创建工装失败');
      return;
    }
    
    const toolingData = await createToolingResponse.json();
    const tooling = toolingData.data;
    console.log(`✓ 工装创建成功: ID=${tooling.id}, 盘存编号=${tooling.inventory_number}`);
    
    // 2. 创建测试零件（应该自动生成盘存编号）
    console.log('2. 创建测试零件（应该自动生成盘存编号）...');
    const createPartResponse = await fetch(`http://localhost:3020/api/tooling/${tooling.id}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_drawing_number: 'AUTO-PART-001',
        part_name: '自动测试零件',
        part_quantity: 3,
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
    console.log(`零件数据:`, part);
    
    // 3. 验证盘存编号是否自动生成
    if (part.part_inventory_number) {
      console.log(`✓ 盘存编号自动生成成功: ${part.part_inventory_number}`);
      
      // 验证格式
      const expectedFormat = /^AUTO002\d{2}$/;
      if (expectedFormat.test(part.part_inventory_number)) {
        console.log('✓ 盘存编号格式正确');
      } else {
        console.log('✗ 盘存编号格式错误');
      }
    } else {
      console.log('✗ 盘存编号未自动生成');
    }
    
    // 4. 创建第二个零件测试序号递增
    console.log('4. 创建第二个零件测试序号递增...');
    const createPart2Response = await fetch(`http://localhost:3020/api/tooling/${tooling.id}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_drawing_number: 'AUTO-PART-002',
        part_name: '第二个自动测试零件',
        part_quantity: 1,
        part_category: '圆料',
        source: '自备'
      })
    });
    
    if (!createPart2Response.ok) {
      console.log('创建第二个零件失败');
      return;
    }
    
    const part2Data = await createPart2Response.json();
    const part2 = part2Data.data;
    console.log(`✓ 第二个零件创建成功: ID=${part2.id}`);
    console.log(`第二个零件盘存编号: ${part2.part_inventory_number || '无'}`);
    
    // 5. 验证前端加载时是否能正确显示
    console.log('5. 验证前端加载时是否能正确显示...');
    const loadPartsResponse = await fetch(`http://localhost:3020/api/tooling/${tooling.id}/parts`);
    const loadPartsData = await loadPartsResponse.json();
    
    console.log('重新加载的零件数据:');
    loadPartsData.items.forEach((p, index) => {
      console.log(`  零件 ${index + 1}: ${p.part_name} - 盘存编号: ${p.part_inventory_number || '无'}`);
    });
    
    console.log('=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
};

// 运行测试
testAutoInventoryGeneration();