// 测试登录功能
const testLogin = async () => {
  console.log('=== 测试登录功能 ===\n')

  // 测试健康检查
  try {
    const healthResp = await fetch('http://localhost:5182/api/health')
    const healthData = await healthResp.json()
    console.log('✅ 前端代理健康检查:', healthData)
  } catch (error) {
    console.log('❌ 前端代理连接失败:', error.message)
  }

  // 测试后端健康检查
  try {
    const backendHealthResp = await fetch('http://localhost:3003/api/health')
    const backendHealthData = await backendHealthResp.json()
    console.log('✅ 后端服务器健康检查:', backendHealthData)
  } catch (error) {
    console.log('❌ 后端服务器连接失败:', error.message)
  }

  // 测试登录API
  console.log('\n=== 测试登录API ===')
  const testUsers = [
    { phone: '13800000001', password: '123456', name: '张三' },
    { phone: '13800000002', password: '123456', name: '申震' },
    { phone: '13800000003', password: '123456', name: '郭大师' },
    { phone: '13800000004', password: '123456', name: '饭团' }
  ]

  for (const user of testUsers) {
    try {
      const resp = await fetch('http://localhost:5182/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: user.phone, password: user.password })
      })
      const data = await resp.json()
      
      if (data.success) {
        console.log(`✅ ${user.name} (${user.phone}): 登录成功`)
      } else {
        console.log(`❌ ${user.name} (${user.phone}): 登录失败 - ${data.error}`)
      }
    } catch (error) {
      console.log(`❌ ${user.name} (${user.phone}): 网络错误 - ${error.message}`)
    }
  }

  console.log('\n=== 测试完成 ===')
  console.log('\n请检查浏览器控制台是否有错误信息：')
  console.log('1. 按F12打开开发者工具')
  console.log('2. 切换到"Console"标签')
  console.log('3. 查看是否有红色错误信息')
  console.log('4. 切换到"Network"标签')
  console.log('5. 查看登录请求的状态码和响应')
}

testLogin()
