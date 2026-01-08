// Check materials table schema
const { Pool } = require('pg')

const dbConfig = {
  connectionString: 'postgresql://postgres.oltsiocyesbgezlrcxze:li18004499801@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
}

async function checkMaterialsSchema() {
  console.log('Checking materials table schema...')
  
  try {
    const pool = new Pool(dbConfig)
    const client = await pool.connect()
    
    // Check materials table structure
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'materials'
      ORDER BY ordinal_position
    `)
    
    console.log('materials table structure:')
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable}`)
    })
    
    // Check some sample data
    const sampleResult = await client.query('SELECT * FROM materials LIMIT 2')
    console.log('\nSample materials data:')
    sampleResult.rows.forEach((row, index) => {
      console.log(`Row ${index + 1}:`, JSON.stringify(row, null, 2))
    })
    
    client.release()
    await pool.end()
    
  } catch (error) {
    console.error('Error checking materials schema:', error.message)
  }
}

checkMaterialsSchema()