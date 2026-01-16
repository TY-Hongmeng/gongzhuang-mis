// Check users in database
const { Pool } = require('pg')

const dbConfig = {
  connectionString: 'postgresql://postgres.oltsiocyesbgezlrcxze:li18004499801@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
}

async function checkUsers() {
  console.log('Checking users in database...')
  
  try {
    const pool = new Pool(dbConfig)
    const client = await pool.connect()
    
    // Check users table
    const usersResult = await client.query('SELECT id, phone, real_name, status FROM users')
    console.log('Users found:', usersResult.rows.length)
    console.log('Users:', JSON.stringify(usersResult.rows, null, 2))
    
    // Check companies table
    const companiesResult = await client.query('SELECT id, name FROM companies')
    console.log('Companies found:', companiesResult.rows.length)
    console.log('Companies:', JSON.stringify(companiesResult.rows, null, 2))
    
    // Check roles table
    const rolesResult = await client.query('SELECT id, name FROM roles')
    console.log('Roles found:', rolesResult.rows.length)
    console.log('Roles:', JSON.stringify(rolesResult.rows, null, 2))
    
    client.release()
    await pool.end()
    
    console.log('Check completed')
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkUsers()
