import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')

const TARGET_DIRS = [
  'frontend/src/features/reports',
  'frontend/src/features/settings',
  'frontend/src/features/monitoring',
  'frontend/src/features/devices',
  'frontend/src/components/pages',
  'frontend/src/components/shared',
  'frontend/src/components/atoms',
]

const BANNED_GRAY_TOKEN_REGEX =
  /\b(?:text|bg|border)-gray-(?:50|100|200|300|400|500|600|700|800|900|950)\b|\bdark:(?:text|bg|border)-gray-(?:50|100|200|300|400|500|600|700|800|900|950)\b|\bhover:bg-gray-(?:50|100|200|300|400|500|600|700|800|900|950)\b|\bdark:hover:bg-gray-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  const absDir = path.resolve(ROOT, dir)
  if (!fs.existsSync(absDir)) {
    return out
  }

  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(absDir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(path.relative(ROOT, full), out)
      continue
    }

    if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }

  return out
}

describe('阶段2严格语义化收敛', () => {
  it('目标目录不应再出现 gray 硬编码类名', () => {
    const files = TARGET_DIRS.flatMap((dir) => collectSourceFiles(dir))
    const violations: Array<{ file: string; tokens: string[] }> = []

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      const matches = content.match(BANNED_GRAY_TOKEN_REGEX) ?? []
      if (matches.length > 0) {
        violations.push({
          file: path.relative(ROOT, file),
          tokens: Array.from(new Set(matches)).sort(),
        })
      }
    }

    expect(violations).toEqual([])
  })
})
