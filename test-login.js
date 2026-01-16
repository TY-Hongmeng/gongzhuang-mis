// Test login API
const testLogin = async (phone, password) => {
  try {
    const response = await fetch('http://localhost:3003/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone, password })
    })
    
    const data = await response.json()
    console.log(`Testing login for phone: ${phone}, password: ${password}`)
    console.log(`Status: ${response.status}`)
    console.log(`Response:`, JSON.stringify(data, null, 2))
    console.log('')
    return data
  } catch (error) {
    console.error(`Error testing login for ${phone}:`, error.message)
    return { error: error.message }
  }
}

async function testAllLogins() {
  console.log('Testing login API...\n')
  
  // Test with different users
  await testLogin('18004499801', '123456')
  await testLogin('13800000001', '123456')
  await testLogin('13800000002', '123456')
  await testLogin('13800000003', '123456')
  await testLogin('13800000004', '123456')
  
  // Test with wrong password
  await testLogin('18004499801', 'wrongpassword')
  
  // Test with non-existent user
  await testLogin('99999999999', '123456')
}

testAllLogins()
