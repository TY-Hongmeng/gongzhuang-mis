// 测试前端数据加载和盘存编号显示
const testFrontendDataLoading = async () => {
  console.log('=== 测试前端数据加载和盘存编号显示 ===');
  
  try {
    // 1. 使用之前创建的测试数据
    const toolingId = '1814d5fe-fac1-4b10-a431-25e909bd6c0d';
    
    console.log('1. 模拟前端加载零件数据...');
    const response = await fetch(`http://localhost:3020/api/tooling/${toolingId}/parts`);
    const data = await response.json();
    
    if (!data.success || !data.items) {
      console.log('加载零件数据失败');
      return;
    }
    
    console.log('2. 模拟前端数据处理逻辑...');
    
    // 模拟前端的 fetchPartsFor 函数逻辑
    const toolingInfo = {
      id: toolingId,
      inventory_number: 'AUTO002'
    };
    
    const processedItems = data.items.map((x, index) => {
      // 生成盘存编号（与前端逻辑一致）
      const hasContent = x.part_drawing_number || x.part_name || x.part_quantity;
      console.log(`零件 ${index}:`, {
        original_data: x,
        hasContent: hasContent,
        parent_inventory_number: toolingInfo?.inventory_number,
        existing_inventory_number: x.part_inventory_number
      });
      
      // 如果后端已经有盘存编号，使用它；否则生成新的
      const partInventoryNumber = x.part_inventory_number || 
        (hasContent && toolingInfo?.inventory_number ? 
          `${toolingInfo.inventory_number}${String(index + 1).padStart(2, '0')}` : 
          '');
      
      console.log(`最终盘存编号: ${partInventoryNumber}`);
      
      return {
        id: x.id,
        tooling_id: x.tooling_id,
        inventory_number: toolingInfo?.inventory_number || '',
        project_name: toolingInfo?.project_name || '',
        part_inventory_number: partInventoryNumber,
        part_drawing_number: x.part_drawing_number || '',
        part_name: x.part_name || '',
        part_quantity: x.part_quantity || '',
        material_id: x.material_id || '',
        material_source_id: x.material_source_id || '',
        part_category: x.part_category || '',
        specifications: x.specifications || {},
        weight: x.weight || 0,
        remarks: x.remarks || ''
      };
    });
    
    console.log('3. 验证处理结果...');
    processedItems.forEach((item, index) => {
      console.log(`零件 ${index + 1}:`);
      console.log(`  名称: ${item.part_name}`);
      console.log(`  图号: ${item.part_drawing_number}`);
      console.log(`  盘存编号: ${item.part_inventory_number}`);
      console.log(`  期望格式: AUTO002${String(index + 1).padStart(2, '0')}`);
      
      const expected = `AUTO002${String(index + 1).padStart(2, '0')}`;
      if (item.part_inventory_number === expected) {
        console.log(`  ✓ 盘存编号正确`);
      } else {
        console.log(`  ✗ 盘存编号错误`);
      }
    });
    
    console.log('=== 前端数据加载测试完成 ===');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
};

// 运行测试
testFrontendDataLoading();
