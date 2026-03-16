import { chromium, type FullConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 全局登录（一次）：
 * - 访问 /reports，触发路由守卫跳转到 /login
 * - 点击“一键填充测试账号”并登录
 * - 保存 storageState 供后续用例复用
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use?.baseURL || 'http://localhost:33000')
  const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
    ? String(process.env.PLAYWRIGHT_STORAGE_STATE)
    : path.join('test-results', '.auth', 'storageState.json')

  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage()

  const reportsUrl = new URL('/reports', baseURL).toString()
  await page.goto(reportsUrl, { waitUntil: 'domcontentloaded' })

  // 路由守卫会在客户端重定向到 /login?redirect=...，因此需要等待“登录页”或“报表页”其中之一出现。
  const quickFill = page.getByRole('button', { name: '一键填充测试账号' })
  const inspectionTab = page.getByRole('button', { name: '巡检报告', exact: true })

  const reached = await Promise.race([
    quickFill.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'login' as const),
    inspectionTab.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'reports' as const),
  ])

  if (reached === 'login') {
    await quickFill.click()
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST' &&
          resp.url().includes('/api/v1/auth/login') &&
          resp.status() >= 200 &&
          resp.status() < 300
      ),
      page.getByRole('button', { name: '立即登录' }).click(),
    ])

    // 登录后可能跳转到 /dashboard，这里统一回到 /reports 再保存状态，确保后续用例稳定。
    await page.goto(reportsUrl, { waitUntil: 'domcontentloaded' })
    await inspectionTab.waitFor({ state: 'visible', timeout: 30_000 })
  }

  // 等待报表页关键元素出现，避免保存到“半路状态”
  await inspectionTab.waitFor({ state: 'visible', timeout: 30_000 })

  await page.context().storageState({ path: storageStatePath })
  await browser.close()
}
