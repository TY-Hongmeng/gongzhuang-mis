// 简单的 API 测试脚本
const API_BASE = 'http://localhost:3020/api';

async function testCuttingOrdersAPI() {
  console.log('测试下料单 API...');
  
  try {
    // 测试 GET 请求
    console.log('1. 测试 GET /cutting-orders');
    const getResponse = await fetch(`${API_BASE}/cutting-orders`);
    console.log('GET 响应状态:', getResponse.status);
    
    if (getResponse.ok) {
      const data = await getResponse.json();
      console.log('GET 响应数据:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await getResponse.text();
      console.log('GET 错误响应:', errorText);
    }
    
    // 测试 POST 请求（带示例数据）
    console.log('\n2. 测试 POST /cutting-orders');
    const testOrder = {
      orders: [{
        inventory_number: 'TEST001',
        project_name: '测试项目',
        part_drawing_number: 'DRAW001',
        part_name: '测试零件',
        specifications: '100x200x300',
        part_quantity: 10,
        remarks: '',
        material_source: '火切',
        created_date: new Date().toISOString(),
        tooling_id: '00000000-0000-0000-0000-000000000000',
        part_id: '00000000-0000-0000-0000-000000000000'
      }]
    };
    
    const postResponse = await fetch(`${API_BASE}/cutting-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testOrder)
    });
    
    console.log('POST 响应状态:', postResponse.status);
    
    if (postResponse.ok) {
      const data = await postResponse.json();
      console.log('POST 响应数据:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await postResponse.text();
      console.log('POST 错误响应:', errorText);
    }
    
  } catch (error) {
    console.error('API 测试失败:', error);
  }
}

// 运行测试
testCuttingOrdersAPI();
