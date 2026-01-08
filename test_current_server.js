// 测试当前运行的服务器
const API_BASE = 'http://localhost:3003/api';

async function testCurrentServer() {
  console.log('测试当前运行的服务器...');
  
  try {
    // 尝试不同的端点
    const endpoints = ['/health', '/tooling', '/cutting-orders'];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`\n测试 ${endpoint}`);
        const response = await fetch(`${API_BASE}${endpoint}`, {
          timeout: 5000 // 5秒超时
        });
        console.log(`${endpoint} 响应状态:`, response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`${endpoint} 成功:`, data.success);
        } else {
          const errorText = await response.text();
          console.log(`${endpoint} 错误:`, errorText.substring(0, 100));
        }
      } catch (endpointError) {
        console.log(`${endpoint} 请求失败:`, endpointError.message);
      }
    }
    
  } catch (error) {
    console.error('整体测试失败:', error.message);
  }
}

// 运行测试
testCurrentServer();