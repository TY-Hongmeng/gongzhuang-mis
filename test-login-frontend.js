const testLogin = async () => {
  try {
    const response = await fetch('http://localhost:5182/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone: '13800000001', password: '123456' })
    })
    
    const data = await response.json()
    console.log('Status:', response.status)
    console.log('Response:', JSON.stringify(data, null, 2))
    
    if (data.success) {
      console.log('\n✅ Login successful!')
    } else {
      console.log('\n❌ Login failed')
    }
  } catch (error) {
    console.error('Error:', error.message)
  }
}

testLogin()
