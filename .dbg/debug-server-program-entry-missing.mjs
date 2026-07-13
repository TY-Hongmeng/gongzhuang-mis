import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'

const sessionId = 'program-entry-missing'
const outdir = path.resolve(process.cwd(), '.dbg')
const port = 7777
const host = '127.0.0.1'

fs.mkdirSync(outdir, { recursive: true })

const logFile = path.join(outdir, `trae-debug-log-${sessionId}.ndjson`)
const envFile = path.join(outdir, `${sessionId}.env`)

fs.writeFileSync(logFile, '')
fs.writeFileSync(envFile, `DEBUG_SERVER_URL=http://${host}:${port}/event\nDEBUG_SESSION_ID=${sessionId}\n`)

const writeCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const server = http.createServer((req, res) => {
  writeCors(res)

  if (req.method === 'OPTIONS' && req.url === '/event') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true, sessionId, logFile }))
    return
  }

  if (req.method === 'DELETE' && req.url === '/logs') {
    fs.writeFileSync(logFile, '')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method === 'POST' && req.url === '/event') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const event = JSON.parse(body || '{}')
        if (!event.ts) event.ts = Date.now()
        fs.appendFileSync(logFile, `${JSON.stringify(event)}\n`)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: String(error?.message || error || 'bad json') }))
      }
    })
    return
  }

  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
})

server.listen(port, host, () => {
  process.stdout.write('@@DEBUG_SERVER_INFO\n')
  process.stdout.write(JSON.stringify({
    api_url: `http://${host}:${port}/event`,
    session_id: sessionId,
    log_dir: outdir,
    log_file: logFile,
    env_file: envFile
  }, null, 2))
  process.stdout.write('\n@@END_DEBUG_SERVER_INFO\n')
})
