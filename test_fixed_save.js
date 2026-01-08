// 测试修复后的保存功能
const testFixedSaveFunction = async () => {
  console.log('=== 测试修复后的保存功能 ===');
  
  try {
    // 1. 创建测试工装
    console.log('1. 创建测试工装...');
    const createToolingResponse = await fetch('http://localhost:3010/api/tooling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inventory_number: 'FIXED001',
        production_unit: '修复测试单位',
        category: '修复测试类别',
        project_name: '修复测试项目',
        sets_count: 1,
        recorder: '修复测试员'
      })
    });
    
    if (!createToolingResponse.ok) {
      console.log('创建工装失败');
      return;
    }
    
    const toolingData = await createToolingResponse.json();
    const tooling = toolingData.data;
    console.log(`✓ 工装创建成功: ID=${tooling.id}`);
    
    // 2. 创建测试零件（包含空的material_id）
    console.log('2. 创建测试零件（包含空的material_id）...');
    const createPartResponse = await fetch(`http://localhost:3020/api/tooling/${tooling.id}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_drawing_number: 'FIXED-PART-001',
        part_name: '修复测试零件',
        part_quantity: 2,
        part_category: '板料',
        source: '自备',
        material_id: '',  // 空的UUID字段
        material_source_id: ''  // 空的UUID字段
      })
    });
    
    if (!createPartResponse.ok) {
      console.log('创建零件失败');
      return;
    }
    
    const partData = await createPartResponse.json();
    const part = partData.data;
    console.log(`✓ 零件创建成功: ID=${part.id}`);
    
    // 3. 测试更新零件（模拟前端的保存逻辑）
    console.log('3. 测试更新零件（模拟前端的保存逻辑）...');
    
    // 模拟前端的 payload 构建逻辑
    const payload = {
      part_inventory_number: 'FIXED00101',
      part_drawing_number: 'FIXED-PART-001',
      part_name: '修复测试零件',
      part_quantity: 2,
      part_category: '板料',
      specifications: {},
      weight: 0,
      heat_treatment: false
      // 注意：没有包含 material_id 和 material_source_id
    };
    
    console.log('发送的payload:', payload);
    
    const updateResponse = await fetch(`http://localhost:3020/api/tooling/parts/${part.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (updateResponse.ok) {
      console.log('✓ 更新零件成功');
      
      // 验证更新结果
      const verifyResponse = await fetch(`http://localhost:3020/api/tooling/${tooling.id}/parts`);
      const verifyData = await verifyResponse.json();
      const updatedPart = verifyData.items.find(p => p.id === part.id);
      
      if (updatedPart && updatedPart.part_inventory_number === 'FIXED00101') {
        console.log('✓ 盘存编号更新验证成功');
      } else {
        console.log('✗ 盘存编号更新验证失败');
      }
    } else {
      const errorText = await updateResponse.text();
      console.log('✗ 更新零件失败:', errorText);
    }
    
    // 4. 测试包含有效material_id的更新
    console.log('4. 测试包含有效material_id的更新...');
    
    const payloadWithMaterial = {
      part_inventory_number: 'FIXED00101',
      part_drawing_number: 'FIXED-PART-001',
      part_name: '修复测试零件',
      part_quantity: 2,
      material_id: '9bdfc721-4810-48e0-9870-3bc85332325c',  // 有效的UUID
      part_category: '板料',
      specifications: {},
      weight: 1.5,
      heat_treatment: false
    };
    
    const updateWithMaterialResponse = await fetch(`http://localhost:3020/api/tooling/parts/${part.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadWithMaterial)
    });
    
    if (updateWithMaterialResponse.ok) {
      console.log('✓ 包含material_id的更新成功');
    } else {
      console.log('✗ 包含material_id的更新失败');
    }
    
    console.log('=== 修复验证完成 ===');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
};

// 运行测试
testFixedSaveFunction();