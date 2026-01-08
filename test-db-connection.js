// Test database connection
const { Pool } = require('pg')

const dbConfig = {
  connectionString: 'postgresql://postgres.oltsiocyesbgezlrcxze:li18004499801@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000
}

async function testConnection() {
  console.log('Testing database connection...')
  
  try {
    const pool = new Pool(dbConfig)
    
    // Test basic connection
    const client = await pool.connect()
    console.log('Connected successfully')
    
    // Test a simple query
    const result = await client.query('SELECT 1')
    console.log('Query test result:', result.rows)
    
    // Test tooling_info table
    try {
      const toolingResult = await client.query('SELECT COUNT(*) as count FROM tooling_info LIMIT 1')
      console.log('Tooling info count:', toolingResult.rows[0].count)
    } catch (err) {
      console.log('Tooling_info table error:', err.message)
    }
    
    client.release()
    await pool.end()
    
    console.log('Database connection test completed successfully')
  } catch (error) {
    console.error('Database connection failed:', error.message)
    console.error('Full error:', error)
  }
}

testConnection()