import fs from 'fs'
import path from 'path'

import { SKINS } from '@/lib/contexts/skin-context'

const ROOT = path.resolve(__dirname, '../../..')
const LAYOUT = path.resolve(ROOT, 'frontend/src/app/layout.tsx')

/**
 * 首帧防闪烁脚本是 layout.tsx 里的字符串字面量，无法随 Skin 类型自动扩展。
 * 这里锁住「SKINS 中除默认值外的每个 slug 都出现在脚本里」，新增皮肤漏改脚本时此用例失败。
 */
describe('首帧皮肤脚本', () => {
  it('覆盖 SKINS 中除默认 classic 外的全部皮肤', () => {
    const source = fs.readFileSync(LAYOUT, 'utf8')
    const script = source.match(/__html:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? ''

    expect(script).not.toBe('')
    for (const skin of SKINS.filter((s) => s !== 'classic')) {
      expect(script).toContain(`'${skin}'`)
    }
  })
})
