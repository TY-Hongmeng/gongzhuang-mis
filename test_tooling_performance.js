// Test script to measure tooling API performance for comparison
const startTime = Date.now();

console.log('Testing tooling API performance for comparison...');

fetch('http://localhost:3003/api/tooling?page=1&pageSize=20')
  .then(response => response.json())
  .then(data => {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log('✅ Tooling API Response received in:', responseTime + 'ms');
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
    console.error('❌ Tooling API Error after:', responseTime + 'ms');
    console.error('Error:', error.message);
  });