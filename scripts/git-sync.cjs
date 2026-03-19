const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function execGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', shell: false })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  return result
}

function runGitOrExit(args) {
  const result = execGit(args)
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function getOutputOrExit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', shell: false })
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    process.exit(result.status || 1)
  }
  return String(result.stdout || '')
}

function parseArgs(argv) {
  const out = { message: '', files: [], auto: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--auto' || a === '-Auto') {
      out.auto = true
      continue
    }
    if (a === '-Message' || a === '--message' || a === '-m') {
      const parts = []
      i += 1
      while (i < argv.length && !argv[i].startsWith('-')) {
        parts.push(argv[i])
        i += 1
      }
      i -= 1
      out.message = parts.join(' ').trim()
      continue
    }
    if (a === '-Files' || a === '--files') {
      i += 1
      while (i < argv.length && !argv[i].startsWith('-')) {
        const raw = argv[i]
        raw.split(',').map(x => x.trim()).filter(Boolean).forEach(x => out.files.push(x))
        i += 1
      }
      i -= 1
      continue
    }
  }
  return out
}

function readVersion() {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    const raw = fs.readFileSync(pkgPath, 'utf8')
    const pkg = JSON.parse(raw)
    return String(pkg.version || '').trim()
  } catch {
    return ''
  }
}

function nowText() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getRemoteHead(remoteRef) {
  const out = getOutputOrExit(['ls-remote', 'origin', remoteRef]).trim()
  return String(out.split(/\s+/)[0] || '').trim()
}

function pushMainWithLease(remoteRef, maxRetry) {
  const attempts = Math.max(1, Number(maxRetry) || 1)
  for (let i = 0; i < attempts; i += 1) {
    const remoteHead = getRemoteHead(remoteRef)
    const args = remoteHead
      ? ['push', `--force-with-lease=${remoteRef}:${remoteHead}`, 'origin', `HEAD:${remoteRef}`]
      : ['push', 'origin', `HEAD:${remoteRef}`]
    const result = execGit(args)
    if (result.status === 0) return
    if (i === attempts - 1) {
      process.exit(result.status || 1)
    }
  }
}

const { message, files, auto } = parseArgs(process.argv.slice(2))
const version = readVersion()
const commitMessage = message || (auto ? `chore: auto sync ${version ? `v${version} ` : ''}${nowText()}`.trim() : '')
if (!commitMessage) {
  console.error('Commit message is required. Use -Message "your message", or run with --auto.')
  process.exit(1)
}

if (files.length > 0) {
  runGitOrExit(['add', '--', ...files])
} else {
  runGitOrExit(['add', '-A', '--', '.'])
}

const staged = getOutputOrExit(['diff', '--cached', '--name-only']).trim()
if (staged) {
  runGitOrExit(['commit', '-m', commitMessage])
}

const remoteRef = 'refs/heads/main'
pushMainWithLease(remoteRef, 3)
const localHead = getOutputOrExit(['rev-parse', 'HEAD']).trim()
const remoteHead = getRemoteHead(remoteRef)
if (!localHead || !remoteHead || localHead !== remoteHead) {
  console.error(`Git sync verify failed: local=${localHead} remote=${remoteHead}`)
  process.exit(2)
}
console.log(`Git sync verified: ${localHead}`)
