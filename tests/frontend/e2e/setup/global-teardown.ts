import fs from 'node:fs'
import path from 'node:path'

/**
 * 全局收尾：清理登录态文件（可选）。
 * 说明：不清理也不会影响仓库（test-results 已在 .gitignore 中忽略）。
 */
export default async function globalTeardown() {
  const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
    ? String(process.env.PLAYWRIGHT_STORAGE_STATE)
    : path.join('test-results', '.auth', 'storageState.json')

  try {
    fs.rmSync(storageStatePath, { force: true })
  } catch {
    // ignore
  }
}

