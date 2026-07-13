const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://postgres.oltsiocyesbgezlrcxze:li18004499801@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
c.connect().then(() => c.query("SELECT module, name, code FROM permissions WHERE module = 'measure_tools' ORDER BY id"))
.then(r => {
  console.log(JSON.stringify(r.rows, null, 2));
  return c.end();
}).catch(e => { console.error('ERROR:', e.message); return c.end(); });
