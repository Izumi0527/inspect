import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')
const css = fs.readFileSync(path.resolve(ROOT, 'frontend/src/app/globals.css'), 'utf8')
const statusSource = fs.readFileSync(
  path.resolve(ROOT, 'frontend/src/components/atoms/status.tsx'),
  'utf8'
)

/**
 * 浅色玻璃拟态皮肤的结构守卫：锁住「恒浅色」「光斑可见」「减少动态可关」三条承诺，
 * 以及状态点锚点。令牌数值本身由 docs/plans/2026-10-08-glass-skin/evidence/palette-verify.py 验证。
 */
describe('浅色玻璃拟态皮肤守卫', () => {
  it('调色板用单一选择器列表同时覆盖明暗轴（恒浅色）', () => {
    expect(css).toMatch(/:is\(\[data-skin="glass"\],\s*\.dark\[data-skin="glass"\]\)\s*\{/)
  })

  it('不存在单独的 glass 暗色调色板', () => {
    expect(css).not.toMatch(/^\s*\.dark\[data-skin="glass"\]\s*\{/m)
  })

  it('光斑铺在 body 上且外壳透明', () => {
    expect(css).toMatch(/\[data-skin="glass"\]\s*\{[\s\S]*?&\s*body::before/)
    expect(css).toMatch(/\[data-slot="app-layout"\][^}]*background-color:\s*transparent/)
  })

  it('减少动态偏好下关闭全部 glass 动画', () => {
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*\[data-skin="glass"\][\s\S]*animation:\s*none/
    )
  })

  it('StatusDot 带 status-dot 锚点与 tone 属性', () => {
    expect(statusSource).toContain('data-slot="status-dot"')
    expect(statusSource).toContain('data-tone={tone}')
  })
})
