const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function runGit(args) {
  const result = spawnSync('git', args, { stdio: 'inherit', shell: false })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function getOutput(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', shell: false })
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '')
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

const { message, files, auto } = parseArgs(process.argv.slice(2))
const version = readVersion()
const commitMessage = message || (auto ? `chore: auto sync ${version ? `v${version} ` : ''}${nowText()}`.trim() : '')
if (!commitMessage) {
  console.error('Commit message is required. Use -Message "your message", or run with --auto.')
  process.exit(1)
}

if (files.length > 0) {
  runGit(['add', '--', ...files])
} else {
  runGit(['add', '-A', '--', '.'])
}

const staged = getOutput(['diff', '--cached', '--name-only']).trim()
if (!staged) {
  console.log('No staged changes. Exit.')
  process.exit(0)
}

runGit(['commit', '-m', commitMessage])
runGit(['pull', '--rebase', '--autostash', 'origin', 'main'])
runGit(['push', 'origin', 'main'])
