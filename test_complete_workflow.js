/**
 * 完整测试：验证下料单和采购单生成功能
 * 包括零件名称变更时的重复检测机制
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3010/api';

// 获取材料列表
async function getMaterials() {
  const response = await axios.get(`${API_BASE}/materials`);
  return response.data.data;
}

// 获取材料来源列表
async function getMaterialSources() {
  const response = await axios.get(`${API_BASE}/options/material-sources`);
  return response.data;
}

async function runCompleteTest() {
  console.log('🧪 开始完整测试：下料单和采购单生成功能...\n');
  
  try {
    // 获取基础数据
    const materials = await getMaterials();
    const materialSources = await getMaterialSources();
    
    console.log('📋 获取基础数据:');
    console.log(`   - 材料数量: ${materials.length}`);
    console.log(`   - 材料来源数量: ${materialSources.length}`);
    
    // 步骤1: 创建工装记录
    console.log('\n📦 步骤1: 创建工装记录...');
    const toolingResponse = await axios.post(`${API_BASE}/tooling`, {
      inventory_number: `TEST-COMPLETE-${Date.now()}`,
      project_name: '完整测试项目-下料单和采购单',
      production_unit: '测试单位',
      category: '铝锻',
      sets_count: 1,
      production_date: '2024-12-01',
      demand_date: '2024-12-15',
      recorder: '测试员'
    });
    
    const toolingId = toolingResponse.data.data.id;
    console.log(`✅ 工装记录创建成功，ID: ${toolingId}`);
    
    // 步骤2: 创建不同类型的零件
    console.log('\n🔧 步骤2: 创建不同类型的零件...');
    
    // 创建下料零件（材料来源：火切）
    const cuttingPartResponse = await axios.post(`${API_BASE}/tooling/${toolingId}/parts`, {
      part_name: '测试下料零件A',
      part_drawing_number: 'DWG-CUT-001',
      part_quantity: 5,
      material_id: materials[0].id,
      part_category: '板料',
      specifications: { size: '200x100x30' },
      source: '下料',
      weight: 1.2
    });
    const cuttingPartId = cuttingPartResponse.data.data.id;
    console.log(`✅ 下料零件创建成功，ID: ${cuttingPartId}`);
    
    // 创建锯切零件（材料来源：锯切）
    const sawingPartResponse = await axios.post(`${API_BASE}/tooling/${toolingId}/parts`, {
      part_name: '测试锯切零件B',
      part_drawing_number: 'DWG-SAW-002',
      part_quantity: 3,
      material_id: materials[1].id,
      part_category: '原料',
      specifications: { size: 'Φ50x150' },
      source: '锯切',
      weight: 0.8
    });
    const sawingPartId = sawingPartResponse.data.data.id;
    console.log(`✅ 锯切零件创建成功，ID: ${sawingPartId}`);
    
    // 创建外购零件（材料来源：外购）
    const purchasePartResponse = await axios.post(`${API_BASE}/tooling/${toolingId}/parts`, {
      part_name: '测试外购零件C',
      part_drawing_number: 'DWG-PUR-003',
      part_quantity: 2,
      material_id: materials[2].id,
      part_category: '板料',
      specifications: { size: '80x40x15' },
      source: '外购',
      weight: 0.5
    });
    const purchasePartId = purchasePartResponse.data.data.id;
    console.log(`✅ 外购零件创建成功，ID: ${purchasePartId}`);
    
    // 步骤3: 生成下料单（第一次）
    console.log('\n📋 步骤3: 生成下料单（第一次）...');
    const firstCuttingResponse = await axios.post(`${API_BASE}/cutting-orders`, {
      orders: [
        {
          inventory_number: 'TEST-CUT-001',
          project_name: '完整测试项目-下料单和采购单',
          part_name: '测试下料零件A',
          part_drawing_number: 'DWG-CUT-001',
          specifications: '200x100x30',
          part_quantity: 5,
          material: materials[0].name,
          total_weight: 6.0,
          remarks: '下料备注',
          material_source: '下料',
          tooling_id: toolingId,
          part_id: cuttingPartId,
          created_date: new Date().toISOString()
        },
        {
          inventory_number: 'TEST-SAW-002',
          project_name: '完整测试项目-下料单和采购单',
          part_name: '测试锯切零件B',
          part_drawing_number: 'DWG-SAW-002',
          specifications: 'Φ50x150',
          part_quantity: 3,
          material: materials[1].name,
          total_weight: 2.4,
          remarks: '锯切备注',
          material_source: '锯切',
          tooling_id: toolingId,
          part_id: sawingPartId,
          created_date: new Date().toISOString()
        }
      ]
    });
    
    console.log(`✅ 第一次下料单生成成功`);
    console.log(`   - 插入: ${firstCuttingResponse.data.stats.inserted}`);
    console.log(`   - 更新: ${firstCuttingResponse.data.stats.updated}`);
    console.log(`   - 跳过: ${firstCuttingResponse.data.stats.skipped}`);
    const firstCuttingIds = firstCuttingResponse.data.data.map(order => order.id);
    console.log(`   - 生成的下料单IDs: [${firstCuttingIds.join(', ')}]`);
    
    // 步骤4: 生成采购单（第一次）
    console.log('\n📦 步骤4: 生成采购单（第一次）...');
    const firstPurchaseResponse = await axios.post(`${API_BASE}/purchase-orders`, {
      tooling_id: toolingId,
      orders: [
        {
          inventory_number: 'TEST-PUR-003',
          project_name: '完整测试项目-下料单和采购单',
          part_name: '测试外购零件C',
          part_quantity: 2,
          unit: '块',
          model: `${materials[2].name}  (80x40x15)`,
          supplier: '测试供应商',
          required_date: '2024-12-20',
          remark: '外购零件备注',
          tooling_id: toolingId,
          child_item_id: null,
          part_id: purchasePartId,
          status: 'pending'
        }
      ]
    });
    
    console.log(`✅ 第一次采购单生成成功`);
    console.log(`   - 插入: ${firstPurchaseResponse.data.stats.inserted}`);
    console.log(`   - 更新: ${firstPurchaseResponse.data.stats.updated}`);
    console.log(`   - 跳过: ${firstPurchaseResponse.data.stats.skipped}`);
    const firstPurchaseIds = firstPurchaseResponse.data.data.map(order => order.id);
    console.log(`   - 生成的采购单IDs: [${firstPurchaseIds.join(', ')}]`);
    
    // 步骤5: 修改零件名称
    console.log('\n✏️ 步骤5: 修改零件名称...');
    await axios.put(`${API_BASE}/tooling/parts/${cuttingPartId}`, {
      part_name: '测试下料零件A-已修改'
    });
    console.log(`✅ 下料零件名称已修改为: 测试下料零件A-已修改`);
    
    await axios.put(`${API_BASE}/tooling/parts/${purchasePartId}`, {
      part_name: '测试外购零件C-已修改'
    });
    console.log(`✅ 外购零件名称已修改为: 测试外购零件C-已修改`);
    
    // 步骤6: 再次生成下料单（验证更新机制）
    console.log('\n📋 步骤6: 再次生成下料单（验证更新机制）...');
    const secondCuttingResponse = await axios.post(`${API_BASE}/cutting-orders`, {
      orders: [
        {
          inventory_number: 'TEST-CUT-001-MODIFIED',
          project_name: '完整测试项目-下料单和采购单',
          part_name: '测试下料零件A-已修改',
          part_drawing_number: 'DWG-CUT-001',
          specifications: '200x100x30-修改后',
          part_quantity: 5,
          material: materials[0].name,
          total_weight: 6.5,
          remarks: '下料备注-已修改',
          material_source: '下料',
          tooling_id: toolingId,
          part_id: cuttingPartId,
          created_date: new Date().toISOString()
        }
      ]
    });
    
    console.log(`✅ 第二次下料单生成成功`);
    console.log(`   - 插入: ${secondCuttingResponse.data.stats.inserted}`);
    console.log(`   - 更新: ${secondCuttingResponse.data.stats.updated}`);
    console.log(`   - 跳过: ${secondCuttingResponse.data.stats.skipped}`);
    
    // 步骤7: 再次生成采购单（验证更新机制）
    console.log('\n📦 步骤7: 再次生成采购单（验证更新机制）...');
    const secondPurchaseResponse = await axios.post(`${API_BASE}/purchase-orders`, {
      tooling_id: toolingId,
      orders: [
        {
          inventory_number: 'TEST-PUR-003-MODIFIED',
          project_name: '完整测试项目-下料单和采购单',
          part_name: '测试外购零件C-已修改',
          part_quantity: 2,
          unit: '块',
          model: `${materials[2].name}  (80x40x15-修改后)`,
          supplier: '测试供应商-已修改',
          required_date: '2024-12-25',
          remark: '外购零件备注-已修改',
          tooling_id: toolingId,
          child_item_id: null,
          part_id: purchasePartId,
          status: 'pending'
        }
      ]
    });
    
    console.log(`✅ 第二次采购单生成成功`);
    console.log(`   - 插入: ${secondPurchaseResponse.data.stats.inserted}`);
    console.log(`   - 更新: ${secondPurchaseResponse.data.stats.updated}`);
    console.log(`   - 跳过: ${secondPurchaseResponse.data.stats.skipped}`);
    
    // 步骤8: 验证结果
    console.log('\n🔍 步骤8: 验证结果...');
    
    // 验证下料单（应该更新，ID不变）
    const updatedCuttingOrder = secondCuttingResponse.data.data[0];
    if (updatedCuttingOrder.id === firstCuttingIds[0]) {
      console.log(`✅ 下料单正确执行了更新操作！ID保持不变: ${updatedCuttingOrder.id}`);
      console.log(`   - 零件名称: ${updatedCuttingOrder.part_name}`);
      console.log(`   - 规格: ${updatedCuttingOrder.specifications}`);
      console.log(`   - 备注: ${updatedCuttingOrder.remarks}`);
    } else {
      console.log(`❌ 下料单可能重复生成了！ID发生变化`);
    }
    
    // 验证采购单（应该更新，ID不变）
    const updatedPurchaseOrder = secondPurchaseResponse.data.data[0];
    if (updatedPurchaseOrder.id === firstPurchaseIds[0]) {
      console.log(`✅ 采购单正确执行了更新操作！ID保持不变: ${updatedPurchaseOrder.id}`);
      console.log(`   - 零件名称: ${updatedPurchaseOrder.part_name}`);
      console.log(`   - 型号: ${updatedPurchaseOrder.model}`);
      console.log(`   - 供应商: ${updatedPurchaseOrder.supplier}`);
    } else {
      console.log(`❌ 采购单可能重复生成了！ID发生变化`);
    }
    
    // 步骤9: 验证数据库中没有重复记录
    console.log('\n📊 步骤9: 验证数据库中没有重复记录...');
    const allCuttingOrdersResponse = await axios.get(`${API_BASE}/cutting-orders`);
    const allCuttingOrders = (allCuttingOrdersResponse.data.data || allCuttingOrdersResponse.data).filter(order => 
      order.tooling_id === toolingId
    );
    
    const allPurchaseOrdersResponse = await axios.get(`${API_BASE}/purchase-orders`);
    const allPurchaseOrders = (allPurchaseOrdersResponse.data.data || allPurchaseOrdersResponse.data).filter(order => 
      order.tooling_id === toolingId
    );
    
    console.log(`相关下料单总数: ${allCuttingOrders.length} (期望: 1)`);
    console.log(`相关采购单总数: ${allPurchaseOrders.length} (期望: 1)`);
    
    if (allCuttingOrders.length === 1 && allPurchaseOrders.length === 1) {
      console.log(`✅ 没有重复记录 - 检测机制工作正常！`);
    } else {
      console.log(`❌ 发现重复记录，需要进一步检查！`);
    }
    
    // 清理测试数据
    console.log('\n🧹 清理测试数据...');
    // 删除下料单
    for (const orderId of [updatedCuttingOrder.id]) {
      await axios.delete(`${API_BASE}/cutting-orders/${orderId}`);
    }
    // 删除采购单
    for (const orderId of [updatedPurchaseOrder.id]) {
      await axios.delete(`${API_BASE}/purchase-orders/${orderId}`);
    }
    // 删除零件
    for (const partId of [cuttingPartId, sawingPartId, purchasePartId]) {
      await axios.delete(`${API_BASE}/tooling/parts/${partId}`);
    }
    // 删除工装
    await axios.delete(`${API_BASE}/tooling/${toolingId}`);
    
    console.log('\n🎉 完整测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('错误详情:', error.response.data);
    }
  }
}

// 运行完整测试
runCompleteTest().catch(console.error);