// Detailed test to see what's happening with both APIs
async function testAPI(name, url) {
  console.log(`\n=== Testing ${name} ===`);
  const startTime = Date.now();
  
  try {
    console.log(`Fetching: ${url}`);
    const response = await fetch(url);
    const responseTime = Date.now() - startTime;
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response time: ${responseTime}ms`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Error response: ${errorText}`);
      return;
    }
    
    const data = await response.json();
    console.log(`Success: ${data.success}`);
    console.log(`Total records: ${data.total}`);
    console.log(`Items count: ${data.items?.length || 0}`);
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`Fetch failed after ${responseTime}ms`);
    console.log(`Error: ${error.message}`);
  }
}

async function runTests() {
  await testAPI('Cutting Orders', 'http://localhost:3010/api/cutting-orders?page=1&pageSize=20');
  await testAPI('Tooling', 'http://localhost:3010/api/tooling?page=1&pageSize=20');
}

runTests();