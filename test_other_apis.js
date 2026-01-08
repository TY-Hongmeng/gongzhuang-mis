// 测试其他 API 端点
const API_BASE = 'http://localhost:3020/api';

async function testOtherAPIs() {
  console.log('测试其他 API 端点...');
  
  const endpoints = [
    '/tooling',
    '/materials', 
    '/options/production-units',
    '/options/tooling-categories'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`\n测试 GET ${endpoint}`);
      const response = await fetch(`${API_BASE}${endpoint}`);
      console.log('响应状态:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('成功 - 数据条数:', data.items?.length || 0);
      } else {
        const errorText = await response.text();
        console.log('错误响应:', errorText.substring(0, 200));
      }
    } catch (error) {
      console.error(`测试 ${endpoint} 失败:`, error.message);
    }
  }
}

// 运行测试
testOtherAPIs();