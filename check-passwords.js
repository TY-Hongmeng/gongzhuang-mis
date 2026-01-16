// Check user passwords
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const dbConfig = {
  connectionString: 'postgresql://postgres.oltsiocyesbgezlrcxze:li18004499801@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
}

async function checkPasswords() {
  console.log('Checking user passwords...')
  
  try {
    const pool = new Pool(dbConfig)
    const client = await pool.connect()
    
    // Check users with password_hash
    const usersResult = await client.query('SELECT id, phone, real_name, status, password_hash FROM users')
    console.log('Users found:', usersResult.rows.length)
    
    for (const user of usersResult.rows) {
      console.log(`User: ${user.phone} (${user.real_name}) - Status: ${user.status}`)
      console.log(`  Password hash exists: ${!!user.password_hash}`)
      console.log(`  Password hash: ${user.password_hash ? user.password_hash.substring(0, 20) + '...' : 'N/A'}`)
      
      // Test if password is '123456'
      if (user.password_hash) {
        try {
          const isValid = await bcrypt.compare('123456', user.password_hash)
          console.log(`  Password '123456' valid: ${isValid}`)
        } catch (err) {
          console.log(`  Password check error: ${err.message}`)
        }
      }
      console.log('')
    }
    
    client.release()
    await pool.end()
    
    console.log('Check completed')
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkPasswords()
