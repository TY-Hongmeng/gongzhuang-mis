// Test login through frontend proxy
const testLoginThroughProxy = async () => {
  console.log('Testing login through frontend proxy...\n')
  
  try {
    // Test health endpoint through proxy
    const healthResponse = await fetch('http://localhost:5182/api/health')
    const healthData = await healthResponse.json()
    console.log('Health check through proxy:', JSON.stringify(healthData, null, 2))
    
    // Test login through proxy
    const loginResponse = await fetch('http://localhost:5182/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone: '13800000001', password: '123456' })
    })
    
    const loginData = await loginResponse.json()
    console.log('\nLogin test through proxy:')
    console.log('Status:', loginResponse.status)
    console.log('Response:', JSON.stringify(loginData, null, 2))
    
    if (loginData.success) {
      console.log('\n✅ Login successful through frontend proxy!')
    } else {
      console.log('\n❌ Login failed through frontend proxy')
    }
  } catch (error) {
    console.error('Error:', error.message)
    console.log('\n❌ Cannot connect to frontend proxy')
  }
}

testLoginThroughProxy()
