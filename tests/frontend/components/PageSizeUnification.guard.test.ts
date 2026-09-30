import fs from 'fs'
import path from 'path'

/**
 * 「每页条数」控件唯一出口守卫。
 *
 * 历史问题：巡检模板、日志中心各自拼装分页条并直接调用 PageSizeSelect，
 * 导致同站出现「每页: 10条/页」「每页显示 20 条」两套文案与不同档位集合。
 * 本守卫确保业务代码只能通过共享 `Pagination`（或委托它的 `Table`）使用该控件。
 */

const FRONTEND_SRC = path.resolve(__dirname, '../../../frontend/src')
const FEATURES_DIR = path.join(FRONTEND_SRC, 'features')

const SOURCE_EXT = /\.(ts|tsx)$/
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'dist', '.next'])

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectSourceFiles(path.join(dir, entry.name), acc)
    } else if (SOURCE_EXT.test(entry.name)) {
      acc.push(path.join(dir, entry.name))
    }
  }
  return acc
}

function toRelPosix(file: string): string {
  return path.relative(FRONTEND_SRC, file).replace(/\\/g, '/')
}

function read(file: string): string {
  return fs.readFileSync(file, 'utf8')
}

describe('「每页条数」控件唯一出口守卫', () => {
  it('业务 feature 不应直接引用 PageSizeSelect，必须经共享 Pagination / Table', () => {
    const offenders = collectSourceFiles(FEATURES_DIR)
      .filter((file) => /\bPageSizeSelect\b/.test(read(file)))
      .map(toRelPosix)

    expect(offenders).toEqual([])
  })

  it('档位常量与默认值应只在纯配置模块中定义（单一真源）', () => {
    const defining = collectSourceFiles(FRONTEND_SRC)
      .filter((file) =>
        /export const (PAGE_SIZE_OPTIONS|DEFAULT_PAGE_SIZE)\b/.test(read(file))
      )
      .map(toRelPosix)

    expect(defining).toEqual(['constants/pagination.ts'])
  })

  it('共享 Pagination 应是唯一渲染档位选择器的分页条', () => {
    const importing = collectSourceFiles(FRONTEND_SRC)
      .filter((file) => {
        const content = read(file)
        return (
          /\bPageSizeSelect\b/.test(content) &&
          /['"]@\/components\/atoms\/page-size-select['"]/.test(content)
        )
      })
      .map(toRelPosix)

    expect(importing).toEqual(['components/atoms/pagination.tsx'])
  })

  it('业务代码不应再出现「每页显示」「每页:」等自定义标签（标签由共享组件统一提供）', () => {
    const offenders = collectSourceFiles(FEATURES_DIR)
      .filter((file) => /每页显示|每页:/.test(read(file)))
      .map(toRelPosix)

    expect(offenders).toEqual([])
  })
})

describe('业务分页规范守卫', () => {
  it('业务页不应覆盖统一档位、标签或隐藏选择器', () => {
    const offenders = collectSourceFiles(FEATURES_DIR)
      .filter(file => /pageSizeOptions\s*=|sizeChangerLabel\s*=|showPageSizeSelector=\{false\}/.test(read(file)))
      .map(toRelPosix)
    expect(offenders).toEqual([])
  })

  it('无论使用绝对还是相对导入，选择器只在 Pagination 中渲染', () => {
    const rendering = collectSourceFiles(FRONTEND_SRC)
      .filter(file => /<PageSizeSelect\b/.test(read(file)))
      .map(toRelPosix)
    expect(rendering).toEqual(['components/atoms/pagination.tsx'])
  })
})

describe('分页数值策略分层守卫', () => {
  it('纯配置模块不得导入其他模块或转发其他模块的导出', () => {
    const config = path.join(FRONTEND_SRC, 'constants/pagination.ts')
    expect(fs.existsSync(config)).toBe(true)
    expect(read(config)).not.toMatch(/^\s*import\b|\bimport\s*\(|\brequire\s*\(|\bfrom\s*['"]/m)
  })

  it('分页数值常量的调用方必须直接引用纯配置模块', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(FRONTEND_SRC)) {
      const imports = read(file).matchAll(/\b(?:import|export)\s*\{[^}]*\b(?:DEFAULT_PAGE_SIZE|PAGE_SIZE_OPTIONS)\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/g)
      for (const match of imports) {
        if (match[1] !== '@/constants/pagination') offenders.push(toRelPosix(file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('UI 入口不再导出数值常量，但保留格式化函数', () => {
    const barrel = read(path.join(FRONTEND_SRC, 'components/atoms/index.ts'))
    const selector = read(path.join(FRONTEND_SRC, 'components/atoms/page-size-select.tsx'))
    expect(barrel).not.toMatch(/\bDEFAULT_PAGE_SIZE\b|\bPAGE_SIZE_OPTIONS\b|constants\/pagination/)
    expect(selector).not.toMatch(/export\s*\{[^}]*\b(?:DEFAULT_PAGE_SIZE|PAGE_SIZE_OPTIONS)\b|export\s+\*\s+from/)
    expect(selector).toMatch(/export const formatPageSizeOption\b/)
  })
})

describe('截图分页布局守卫', () => {
  it('业务列表不再开启跳页输入框', () => {
    const offenders = collectSourceFiles(FEATURES_DIR)
      .filter(file => /showJumpToPage/.test(read(file)))
      .map(toRelPosix)
    expect(offenders).toEqual([])
  })

  it('表格不存在另一套手写分页', () => {
    const table = read(path.join(FRONTEND_SRC, 'components/atoms/table.tsx'))
    expect(table.match(/<Pagination\b/g)).toHaveLength(1)
    expect(table).not.toMatch(/pagination\.current [+-] 1|显示第/)
  })
})
