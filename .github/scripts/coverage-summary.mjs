// CI'da server ve client coverage özetini GitHub Actions iş özetine tablo olarak yazar.
// Kullanım: node .github/scripts/coverage-summary.mjs server/coverage client/coverage
import fs from 'node:fs'
import path from 'node:path'

const METRICS = ['statements', 'branches', 'functions', 'lines']

const rows = process.argv.slice(2).map((dir) => {
  const file = path.join(dir, 'coverage-summary.json')
  if (!fs.existsSync(file)) return `| ${dir} | ${METRICS.map(() => 'missing').join(' | ')} |`
  const { total } = JSON.parse(fs.readFileSync(file, 'utf8'))
  return `| ${dir.split(/[\\/]/)[0]} | ${METRICS.map((m) => `${total[m].pct}% (${total[m].covered}/${total[m].total})`).join(' | ')} |`
})

const table = [
  '## Test coverage',
  '',
  `| Part | ${METRICS.map((m) => m[0].toUpperCase() + m.slice(1)).join(' | ')} |`,
  `|---|${METRICS.map(() => '---').join('|')}|`,
  ...rows,
  '',
].join('\n')

// GITHUB_STEP_SUMMARY yoksa (yerelde çalıştırılınca) ekrana yazar
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, table)
else console.log(table)
