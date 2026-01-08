/**
 * 测试下料单生成功能
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3010/api';

async function testCuttingOrders() {
  console.log('🧪 开始测试下料单生成功能...\n');
  
  try {
    // 测试数据
    const testOrders = [
      {
        inventory_number: 'TEST-CUTTING-001',
        project_name: '测试项目-下料单',
        part_name: '测试零件A',
        part_drawing_number: 'DWG-001',
        specifications: '100x50x20',
        part_quantity: 5,
        material: '45#',
        total_weight: 2.5,
        remarks: '测试备注',
        material_source: '下料',
        tooling_id: '38cc6e60-deb5-4f3e-8999-a3b426b8de10',
        part_id: 'bd10db88-9da6-4aa1-90c3-11ab538c1f11',
        created_date: new Date().toISOString()
      }
    ];
    
    console.log('📦 发送下料单创建请求...');
    const response = await axios.post(`${API_BASE}/cutting-orders`, {
      orders: testOrders
    });
    
    console.log('✅ 下料单创建成功！');
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    // 验证操作统计
    if (response.data.stats) {
      console.log('\n📊 操作统计:');
      console.log(`   - 插入: ${response.data.stats.inserted}`);
      console.log(`   - 更新: ${response.data.stats.updated}`);
      console.log(`   - 跳过: ${response.data.stats.skipped}`);
    }
    
    // 清理测试数据
    if (response.data.data && response.data.data.length > 0) {
      const orderId = response.data.data[0].id;
      console.log('\n🧹 清理测试数据...');
      await axios.delete(`${API_BASE}/cutting-orders/${orderId}`);
      console.log('✅ 测试数据已清理');
    }
    
    console.log('\n🎉 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('错误详情:', error.response.data);
    }
  }
}

// 运行测试
testCuttingOrders().catch(console.error);