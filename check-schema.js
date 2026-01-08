// Check database schema
const { Pool } = require('pg')

const dbConfig = {
  connectionString: 'postgresql://postgres.oltsiocyesbgezlrcxze:li18004499801@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
}

async function checkSchema() {
  console.log('Checking database schema...')
  
  try {
    const pool = new Pool(dbConfig)
    const client = await pool.connect()
    
    // Check cutting_orders table structure
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'cutting_orders'
      ORDER BY ordinal_position
    `)
    
    console.log('cutting_orders table structure:')
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable}`)
    })
    
    // Check if cutting_order_items table exists
    const itemsResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'cutting_order_items'
      ORDER BY ordinal_position
    `)
    
    if (itemsResult.rows.length > 0) {
      console.log('\ncutting_order_items table structure:')
      itemsResult.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable}`)
      })
    } else {
      console.log('\ncutting_order_items table does not exist')
    }
    
    // Check some sample data
    const sampleResult = await client.query('SELECT * FROM cutting_orders LIMIT 2')
    console.log('\nSample cutting_orders data:')
    sampleResult.rows.forEach((row, index) => {
      console.log(`Row ${index + 1}:`, JSON.stringify(row, null, 2))
    })
    
    client.release()
    await pool.end()
    
  } catch (error) {
    console.error('Error checking schema:', error.message)
  }
}

checkSchema()