import { existsSync } from 'fs'
import path from 'path'

describe('favicon 资源护栏', () => {
  it('应存在 favicon 文件，避免浏览器请求 /favicon.ico 404', () => {
    const candidates = [
      path.join(__dirname, '../../public/favicon.ico'),
      path.join(__dirname, '../../public/favicon.svg'),
      path.join(__dirname, '../../src/app/favicon.ico'),
      path.join(__dirname, '../../src/app/icon.ico'),
      path.join(__dirname, '../../src/app/icon.png'),
    ]

    expect(candidates.some((item) => existsSync(item))).toBe(true)
  })
})

