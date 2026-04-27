import fs from 'node:fs'
import path from 'node:path'

describe('globals.css 暗色变体配置', () => {
  it('为 next-themes 的 .dark 类声明 Tailwind v4 自定义暗色变体', () => {
    const cssPath = path.join(process.cwd(), 'src', 'app', 'globals.css')
    const cssContent = fs.readFileSync(cssPath, 'utf8')

    expect(cssContent).toContain('@custom-variant dark (&:where(.dark, .dark *));')
  })
})
