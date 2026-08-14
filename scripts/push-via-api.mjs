// Push a fresh local git repo to GitHub via Contents API (fallback when git
// push to github.com:443 is network-blocked but api.github.com works).
// Usage: node scripts/push-via-api.js <owner>/<repo> <branch>
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ownerRepo = process.argv[2]
const branch = process.argv[3] ?? 'main'

// 1. Get files in tree order (git orders dirs before files → parent creation works)
// core.quotePath=false: 中文/非 ASCII 文件名输出原始 UTF-8，避免八进制转义
const files = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .sort((a, b) => a.split('/').length - b.split('/').length)

// 2. Create/update each file (parent dirs auto-created by Contents API)
for (const [i, path] of files.entries()) {
  const content = readFileSync(path)
  const size = content.length
  // GitHub blob sha ≠ git blob sha: existing files must pass the GitHub-side
  // blob sha (from GET contents) for update.
  let sha = null
  try {
    const existing = execFileSync('gh', ['api', `repos/${ownerRepo}/contents/${path}`, '--jq', '.sha'], {
      encoding: 'utf8',
    }).trim()
    if (existing && existing !== 'null') sha = existing
  } catch {
    // new file → no sha needed
  }
  const data = {
    message: `import ${path} (${size} bytes${sha ? ', update' : ', new'})`,
    content: content.toString('base64'),
    ...(sha ? { sha } : {}),
  }
  const res = execFileSync(
    'gh',
    ['api', `repos/${ownerRepo}/contents/${path}`, '--method', 'PUT', '--input', '-'],
    { input: JSON.stringify(data), encoding: 'utf8' },
  )
  const parsed = JSON.parse(res)
  console.log(`[${i + 1}/${files.length}] ${path} -> ${parsed.content?.sha?.slice(0, 7) ?? parsed.commit?.sha?.slice(0, 7) ?? '?'}`)
}

console.log(`Done: ${files.length} files via Contents API on ${branch}`)
