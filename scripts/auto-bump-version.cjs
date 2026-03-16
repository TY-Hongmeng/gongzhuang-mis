const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const root = path.resolve(__dirname, '..')
const packagePath = path.join(root, 'package.json')
const statePath = path.join(root, '.trae', 'version-state.json')
const scanDirs = ['src', 'api', 'scripts']
const ignored = new Set(['node_modules', 'dist', 'build', '.git', '.trae'])
const selfPath = path.resolve(__filename)

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

const collectFiles = (dirPath, acc) => {
  if (!fs.existsSync(dirPath)) return
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  entries.forEach((entry) => {
    const abs = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) collectFiles(abs, acc)
      return
    }
    const ext = path.extname(entry.name).toLowerCase()
    if (ext === '.log' || ext === '.tmp' || entry.name.endsWith('.tsbuildinfo')) return
    if (path.resolve(abs) === selfPath) return
    acc.push(abs)
  })
}

const fileHash = (filePath) => {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    return ''
  }
}

const aggregateHash = (files) => {
  const sorted = [...files].sort((a, b) => a.localeCompare(b))
  const h = crypto.createHash('sha256')
  sorted.forEach((f) => {
    h.update(path.relative(root, f))
    h.update(':')
    h.update(fileHash(f))
    h.update('\n')
  })
  return h.digest('hex')
}

const bumpPatch = (version) => {
  const [major = '0', minor = '0', patch = '0'] = String(version || '0.0.0').split('.')
  const nextPatch = Number(patch) + 1
  return `${Number(major)}.${Number(minor)}.${Number.isFinite(nextPatch) ? nextPatch : 0}`
}

const run = () => {
  const pkg = readJson(packagePath, null)
  if (!pkg || typeof pkg !== 'object') return

  const files = []
  scanDirs.forEach((d) => collectFiles(path.join(root, d), files))
  const currentHash = aggregateHash(files)
  const state = readJson(statePath, { hash: '', version: '' })

  if (state.hash === currentHash) return

  const nextVersion = bumpPatch(pkg.version)
  pkg.version = nextVersion
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify({ hash: currentHash, version: nextVersion }, null, 2) + '\n', 'utf8')
  process.stdout.write(`version bumped to ${nextVersion}\n`)
}

run()
