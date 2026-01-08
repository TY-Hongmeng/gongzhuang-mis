// Test script to measure cutting orders API performance
const startTime = Date.now();

console.log('Testing cutting orders API performance...');

fetch('http://localhost:3010/api/cutting-orders?page=1&pageSize=20')
  .then(response => response.json())
  .then(data => {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log('✅ API Response received in:', responseTime + 'ms');
    console.log('📊 Response data:');
    console.log('- Success:', data.success);
    console.log('- Total records:', data.total);
    console.log('- Items count:', data.items?.length || 0);
    console.log('- Page:', data.page);
    console.log('- Page size:', data.pageSize);
    
    if (responseTime > 1000) {
      console.log('⚠️  Response time is slow (>1s)');
    } else if (responseTime > 500) {
      console.log('⚠️  Response time is moderate (>500ms)');
    } else {
      console.log('✅ Response time is good (<500ms)');
    }
  })
  .catch(error => {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    console.error('❌ API Error after:', responseTime + 'ms');
    console.error('Error:', error.message);
  });