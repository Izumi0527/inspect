import fs from 'node:fs'
import path from 'node:path'

const cssPath = path.join(process.cwd(), 'src', 'app', 'globals.css')

describe('globals.css 暗色变体配置', () => {
  it('为 next-themes 的 .dark 类声明 Tailwind v4 自定义暗色变体', () => {
    const cssContent = fs.readFileSync(cssPath, 'utf8')

    expect(cssContent).toContain('@custom-variant dark (&:where(.dark, .dark *));')
  })
})

describe('globals.css 皮肤覆盖层字号契约', () => {
  it('输入 / 选择器分组规则不得覆盖字号，字号由组件自身 text-sm 决定', () => {
    const cssContent = fs.readFileSync(cssPath, 'utf8')
    const rules = cssContent.match(/& :is\(\[data-slot="input"\][^)]*\)\s*\{[^}]*\}/g)

    expect(rules).not.toBeNull()
    expect(rules!.length).toBeGreaterThan(0)
    for (const rule of rules!) {
      expect(rule).not.toMatch(/font-size/)
    }
  })
})
