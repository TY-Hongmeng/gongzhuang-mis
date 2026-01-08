/**
 * 测试零件名称变更时的重复生成检测机制
 * 
 * 测试场景：
 * 1. 创建外购零件采购单
 * 2. 修改零件名称
 * 3. 重新生成采购单，验证是否更新而非重复生成
 * 4. 验证标准件同样机制
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3010/api';

// 测试数据
const testData = {
  tooling: {
    inventory_number: 'TEST-2024-' + Date.now(),
    project_name: '测试项目-零件名称变更',
    production_unit: '测试单位',
    category: '铝锻',
    sets_count: 1,
    production_date: '2024-12-01',
    demand_date: '2024-12-15',
    recorder: '测试员'
  },
  parts: [
    {
      part_name: '测试零件A',
      part_drawing_number: 'DWG-001',
      part_quantity: 2,
      material_id: '28f6aee1-e411-41f6-9891-656577926a3e', // 45# 材料
      part_category: '板料',
      specifications: { size: '100x50x20' },
      source: '外购',
      weight: 0.5
    },
    {
      part_name: '测试标准件B',
      part_drawing_number: 'DWG-002',
      part_quantity: 3,
      material_id: '9bdfc721-4810-48e0-9870-3bc85332325c', // H13 材料
      part_category: '板料',
      specifications: { size: 'M10x50' },
      source: '自备',
      weight: 0.3
    }
  ]
};

let toolingId;
let partIds = [];
let originalPartNames = [];

async function runTest() {
  console.log('🧪 开始测试零件名称变更检测机制...\n');
  
  try {
    // 步骤1: 创建工装记录
    console.log('📋 步骤1: 创建工装记录...');
    const toolingResponse = await axios.post(`${API_BASE}/tooling`, testData.tooling);
    toolingId = toolingResponse.data.data?.id || toolingResponse.data.id;
    console.log(`✅ 工装记录创建成功，ID: ${toolingId}`);
    console.log(`响应数据:`, toolingResponse.data);
    
    // 步骤2: 创建零件记录
    console.log('\n🔧 步骤2: 创建零件记录...');
    for (let i = 0; i < testData.parts.length; i++) {
      const partData = {
        ...testData.parts[i],
        tooling_id: toolingId
      };
      
      const partResponse = await axios.post(`${API_BASE}/tooling/${toolingId}/parts`, partData);
      const partId = partResponse.data.data?.id || partResponse.data.id;
      partIds.push(partId);
      originalPartNames.push(testData.parts[i].part_name);
      console.log(`✅ 零件 ${i + 1} 创建成功，ID: ${partId}`);
    }
    
    // 步骤3: 生成采购单（第一次）
    console.log('\n📦 步骤3: 第一次生成采购单...');
    const firstPurchaseResponse = await axios.post(`${API_BASE}/purchase-orders`, {
      tooling_id: toolingId,
      orders: [
        {
          inventory_number: testData.tooling.inventory_number,
          project_name: testData.tooling.project_name,
          part_name: testData.parts[0].part_name, // 外购零件
          part_quantity: testData.parts[0].part_quantity,
          unit: '块',
          model: '测试型号A',
          supplier: '供应商A',
          required_date: '2024-12-15',
          remark: '外购零件备注',
          tooling_id: toolingId,
          child_item_id: null,
          part_id: partIds[0], // 外购零件ID
          status: 'pending'
        },
        {
          inventory_number: testData.tooling.inventory_number,
          project_name: testData.tooling.project_name,
          part_name: testData.parts[1].part_name, // 标准件
          part_quantity: testData.parts[1].part_quantity,
          unit: '个',
          model: '标准件型号B',
          supplier: '标准件供应商',
          required_date: '',
          remark: '标准件备注',
          tooling_id: toolingId,
          child_item_id: null, // 标准件没有child_item_id
          part_id: null, // 标准件不设置part_id
          status: 'pending'
        }
      ]
    });
    
    console.log(`✅ 第一次采购单生成成功`);
    console.log(`响应数据:`, firstPurchaseResponse.data);
    console.log(`   - 插入: ${firstPurchaseResponse.data.stats?.inserted}`);
    console.log(`   - 更新: ${firstPurchaseResponse.data.stats?.updated}`);
    console.log(`   - 跳过: ${firstPurchaseResponse.data.stats?.skipped}`);
    
    // 记录第一次生成的采购单ID
    const firstOrderIds = firstPurchaseResponse.data.data?.map(order => order.id) || [];
    console.log(`   - 生成的采购单IDs: [${firstOrderIds.join(', ')}]`);
    
    // 步骤4: 修改零件名称
    console.log('\n✏️ 步骤4: 修改零件名称...');
    const newPartNames = ['测试零件A-已修改', '测试标准件B-已修改'];
    
    for (let i = 0; i < partIds.length; i++) {
      await axios.put(`${API_BASE}/tooling/parts/${partIds[i]}`, {
        part_name: newPartNames[i]
      });
      console.log(`✅ 零件 ${i + 1} 名称已修改为: ${newPartNames[i]}`);
    }
    
    // 步骤5: 再次生成采购单（验证更新机制）
    console.log('\n📦 步骤5: 第二次生成采购单（验证更新机制）...');
    const secondPurchaseResponse = await axios.post(`${API_BASE}/purchase-orders`, {
      tooling_id: toolingId,
      orders: [
        {
          inventory_number: testData.tooling.inventory_number,
          project_name: testData.tooling.project_name,
          part_name: newPartNames[0], // 修改后的外购零件名称
          part_quantity: testData.parts[0].part_quantity,
          unit: '块',
          model: '测试型号A-已修改', // 同时修改型号
          supplier: '供应商A-已修改', // 同时修改供应商
          required_date: '2024-12-20', // 同时修改需求日期
          remark: '外购零件备注-已修改',
          tooling_id: toolingId,
          child_item_id: null,
          part_id: partIds[0], // 使用相同的零件ID
          status: 'pending'
        },
        {
          inventory_number: testData.tooling.inventory_number,
          project_name: testData.tooling.project_name,
          part_name: newPartNames[1], // 修改后的标准件名称
          part_quantity: testData.parts[1].part_quantity,
          unit: '个',
          model: '标准件型号B-已修改',
          supplier: '标准件供应商-已修改',
          required_date: '',
          remark: '标准件备注-已修改',
          tooling_id: toolingId,
          child_item_id: null,
          part_id: null, // 标准件不设置part_id
          status: 'pending'
        }
      ]
    });
    
    console.log(`✅ 第二次采购单生成成功`);
    console.log(`响应数据:`, secondPurchaseResponse.data);
    console.log(`   - 插入: ${secondPurchaseResponse.data.stats?.inserted}`);
    console.log(`   - 更新: ${secondPurchaseResponse.data.stats?.updated}`);
    console.log(`   - 跳过: ${secondPurchaseResponse.data.stats?.skipped}`);
    
    // 记录第二次生成的采购单ID
    const secondOrderIds = secondPurchaseResponse.data.data?.map(order => order.id) || [];
    console.log(`   - 生成的采购单IDs: [${secondOrderIds.join(', ')}]`);
    
    // 步骤6: 验证结果
    console.log('\n🔍 步骤6: 验证结果...');
    
    // 验证外购零件（应该更新，ID不变）
    const externalPurchaseOrder = (secondPurchaseResponse.data.data || []).find(order => order.part_id === partIds[0]);
    if (externalPurchaseOrder) {
      console.log(`✅ 外购零件采购单:`);
      console.log(`   - ID: ${externalPurchaseOrder.id} (应该与第一次相同)`);
      console.log(`   - 零件名称: ${externalPurchaseOrder.part_name}`);
      console.log(`   - 型号: ${externalPurchaseOrder.model}`);
      console.log(`   - 供应商: ${externalPurchaseOrder.supplier}`);
      console.log(`   - 需求日期: ${externalPurchaseOrder.required_date}`);
      
      if (externalPurchaseOrder.id === firstOrderIds[0]) {
        console.log(`   ✅ ID匹配 - 正确执行了更新操作！`);
      } else {
        console.log(`   ❌ ID不匹配 - 可能重复生成了记录！`);
      }
    }
    
    // 验证标准件（应该更新，ID不变）
    const standardPurchaseOrder = (secondPurchaseResponse.data.data || []).find(order => 
      order.tooling_id === toolingId && 
      order.part_name === newPartNames[1] && 
      order.part_id === null
    );
    if (standardPurchaseOrder) {
      console.log(`\n✅ 标准件采购单:`);
      console.log(`   - ID: ${standardPurchaseOrder.id} (应该与第一次相同)`);
      console.log(`   - 零件名称: ${standardPurchaseOrder.part_name}`);
      console.log(`   - 型号: ${standardPurchaseOrder.model}`);
      console.log(`   - 供应商: ${standardPurchaseOrder.supplier}`);
      
      if (standardPurchaseOrder.id === firstOrderIds[1]) {
        console.log(`   ✅ ID匹配 - 正确执行了更新操作！`);
      } else {
        console.log(`   ❌ ID不匹配 - 可能重复生成了记录！`);
      }
    }
    
    // 步骤7: 验证数据库中没有重复记录
    console.log('\n📊 步骤7: 验证数据库中没有重复记录...');
    const allPurchaseOrdersResponse = await axios.get(`${API_BASE}/purchase-orders`);
    const relatedOrders = (allPurchaseOrdersResponse.data.data || allPurchaseOrdersResponse.data).filter(order => 
      order.tooling_id === toolingId
    );
    
    console.log(`相关采购单总数: ${relatedOrders.length}`);
    if (relatedOrders.length === 2) {
      console.log(`✅ 没有重复记录 - 检测机制工作正常！`);
    } else {
      console.log(`❌ 发现 ${relatedOrders.length} 条记录，可能存在重复生成问题！`);
      relatedOrders.forEach((order, index) => {
        console.log(`   记录 ${index + 1}: ID=${order.id}, 零件名称=${order.part_name}`);
      });
    }
    
    // 清理测试数据
    console.log('\n🧹 清理测试数据...');
    // 删除采购单
    for (const orderId of secondOrderIds) {
      await axios.delete(`${API_BASE}/purchase-orders/${orderId}`);
    }
    // 删除零件
    for (const partId of partIds) {
      await axios.delete(`${API_BASE}/tooling/parts/${partId}`);
    }
    // 删除工装
    await axios.delete(`${API_BASE}/tooling/${toolingId}`);
    
    console.log('\n🎉 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('错误详情:', error.response.data);
    }
    
    // 尝试清理测试数据
    try {
      if (toolingId) {
        console.log('\n🧹 尝试清理测试数据...');
        if (partIds.length > 0) {
          for (const partId of partIds) {
            await axios.delete(`${API_BASE}/tooling/parts/${partId}`);
          }
        }
        await axios.delete(`${API_BASE}/tooling/${toolingId}`);
      }
    } catch (cleanupError) {
      console.error('清理测试数据时出错:', cleanupError.message);
    }
  }
}

// 运行测试
runTest().catch(console.error);