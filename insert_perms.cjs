const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://postgres.oltsiocyesbgezlrcxze:li18004499801@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const perms = [
  { module: 'measure_tools', name: '访问模块', code: 'measure_tools:access' },
  { module: 'measure_tools', name: '查看量具台账', code: 'measure_tools:view_ledger' },
  { module: 'measure_tools', name: '新增量具', code: 'measure_tools:add' },
  { module: 'measure_tools', name: '导入量具', code: 'measure_tools:import' },
  { module: 'measure_tools', name: '确认报废', code: 'measure_tools:scrap' },
  { module: 'measure_tools', name: '查看历史记录', code: 'measure_tools:history' },
  { module: 'my_measure_tools', name: '访问模块', code: 'my_measure_tools:access' },
  { module: 'my_measure_tools', name: '借用量具', code: 'my_measure_tools:borrow' },
  { module: 'my_measure_tools', name: '归还量具', code: 'my_measure_tools:return' },
  { module: 'my_measure_tools', name: '续借', code: 'my_measure_tools:renew' }
];

async function run() {
  await c.connect();
  const existing = await c.query("SELECT code FROM permissions WHERE module IN ('measure_tools', 'my_measure_tools')");
  const existSet = new Set(existing.rows.map(r => r.code));

  let inserted = 0;
  for (const p of perms) {
    if (existSet.has(p.code)) continue;
    try {
      await c.query(
        "INSERT INTO permissions (module, name, code, description) VALUES ($1, $2, $3, $4)",
        [p.module, p.name, p.code, p.module + '-' + p.name]
      );
      console.log('OK:', p.code, '-', p.name);
      inserted++;
    } catch (e) {
      console.error('FAIL:', p.code, e.message);
    }
  }
  if (inserted === 0) console.log('所有权限已存在');
  else console.log('\n共插入', inserted, '条新权限');
  await c.end();
}
run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
