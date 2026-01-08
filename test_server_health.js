// 测试服务器健康状态
const API_BASE = 'http://localhost:3020/api';

async function testServerHealth() {
  console.log('测试服务器健康状态...');
  
  try {
    // 测试健康检查端点
    console.log('1. 测试 /api/health');
    const healthResponse = await fetch(`${API_BASE}/health`);
    console.log('健康检查响应状态:', healthResponse.status);
    
    if (healthResponse.ok) {
      const data = await healthResponse.json();
      console.log('健康检查响应数据:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await healthResponse.text();
      console.log('健康检查错误响应:', errorText);
    }
    
    // 测试服务器是否监听
    console.log('\n2. 测试服务器连接...');
    const serverResponse = await fetch('http://localhost:3020/');
    console.log('根路径响应状态:', serverResponse.status);
    
  } catch (error) {
    console.error('服务器连接失败:', error.message);
    console.log('可能的原因:');
    console.log('- 服务器尚未完全启动');
    console.log('- 端口未正确监听');
    console.log('- 网络连接问题');
  }
}

// 运行测试
testServerHealth();