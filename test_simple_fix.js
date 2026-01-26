// 简化的修复验证测试
const testSimpleFix = async () => {
  console.log('=== 简化的修复验证测试 ===');
  
  try {
    const API_BASE = 'http://localhost:3010/api';
    
    // 1. 创建测试工装
    console.log('1. 创建测试工装...');
    const toolingResponse = await fetch(`${API_BASE}/tooling`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inventory_number: 'SIMPLE001',
        production_unit: '简单测试单位',
        category: '简单测试类别',
        project_name: '简单测试项目',
        sets_count: 1,
        recorder: '简单测试员'
      })
    });
    
    if (!toolingResponse.ok) {
      console.log('创建工装失败');
      return;
    }
    
    const toolingData = await toolingResponse.json();
    const tooling = toolingData.data;
    console.log(`✓ 工装创建成功: ID=${tooling.id}`);
    
    // 2. 创建测试零件（包含空的UUID字段）
    console.log('2. 创建测试零件（包含空的UUID字段）...');
    const partResponse = await fetch(`${API_BASE}/tooling/${tooling.id}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_drawing_number: 'SIMPLE-PART-001',
        part_name: '简单测试零件',
        part_quantity: 1,
        part_category: '板料',
        source: '自备',
        material_id: '',  // 空的UUID
        material_source_id: ''  // 空的UUID
      })
    });
    
    if (!partResponse.ok) {
      const errorText = await partResponse.text();
      console.log('创建零件失败:', errorText);
      return;
    }
    
    const partData = await partResponse.json();
    const part = partData.data;
    console.log(`✓ 零件创建成功: ID=${part.id}`);
    console.log(`✓ 自动生成的盘存编号: ${part.part_inventory_number}`);
    
    // 3. 测试更新零件（模拟前端保存盘存编号）
    console.log('3. 测试更新零件盘存编号...');
    const updateResponse = await fetch(`${API_BASE}/tooling/parts/${part.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_inventory_number: 'SIMPLE00101',
        part_drawing_number: 'SIMPLE-PART-001',
        part_name: '简单测试零件',
        part_quantity: 1,
        part_category: '板料',
        specifications: {},
      weight: 0,
      remarks: ''
        // 注意：没有包含空的material_id和material_source_id
      })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.log('更新零件失败:', errorText);
      return;
    }
    
    console.log('✓ 更新零件成功');
    
    // 4. 验证最终结果
    console.log('4. 验证最终结果...');
    const finalResponse = await fetch(`${API_BASE}/tooling/${tooling.id}/parts`);
    const finalData = await finalResponse.json();
    const finalPart = finalData.items.find(p => p.id === part.id);
    
    if (finalPart && finalPart.part_inventory_number === 'SIMPLE00101') {
      console.log('✓ 盘存编号正确保存和显示');
      console.log(`最终盘存编号: ${finalPart.part_inventory_number}`);
    } else {
      console.log('✗ 盘存编号验证失败');
    }
    
    console.log('=== 修复验证完成 ===');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
};

// 运行测试
testSimpleFix();
