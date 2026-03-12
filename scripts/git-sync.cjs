const { spawnSync } = require('child_process')

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
  const out = { message: '', files: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
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

const { message, files } = parseArgs(process.argv.slice(2))
if (!message) {
  console.error('Commit message is required. Use -Message "your message".')
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

runGit(['commit', '-m', message])
runGit(['pull', '--rebase', '--autostash', 'origin', 'main'])
runGit(['push', 'origin', 'main'])
