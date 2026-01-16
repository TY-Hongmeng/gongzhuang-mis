// Test frontend API connection
const testFrontendConnection = async () => {
  console.log('Testing frontend API connection...\n')
  
  // Test health endpoint
  try {
    const response = await fetch('http://localhost:3003/api/health')
    const data = await response.json()
    console.log('Health check:', JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('Health check failed:', error.message)
  }
  
  console.log('\nFrontend is running on: http://localhost:5182')
  console.log('Backend is running on: http://localhost:3003')
  console.log('\nYou can test login at: http://localhost:5182/login')
  console.log('\nAvailable test users:')
  console.log('  Phone: 13800000001, Password: 123456 (张三)')
  console.log('  Phone: 13800000002, Password: 123456 (申震)')
  console.log('  Phone: 13800000003, Password: 123456 (郭大师)')
  console.log('  Phone: 13800000004, Password: 123456 (饭团)')
}

testFrontendConnection()
