import { expect, test, type Page } from '@playwright/test'

const EXPECTED_OPTIONS = ['10条/页', '20条/页', '50条/页', '100条/页']

type SurfaceKind = 'alerts' | 'logs' | 'strategies' | 'templates' | 'executions' | 'reports' | 'devices' | 'users' | 'audit'

interface Surface {
  kind: SurfaceKind
  name: string
  path: string
  endpoint: string
  tab?: string
}

const SURFACES: Surface[] = [
  { kind: 'alerts', name: '告警中心', path: '/alerts', endpoint: '/alerts' },
  { kind: 'logs', name: '日志中心', path: '/logs', endpoint: '/logs' },
  { kind: 'strategies', name: '巡检策略', path: '/inspection', endpoint: '/inspection/strategies' },
  { kind: 'templates', name: '巡检模板', path: '/inspection', endpoint: '/inspection/templates', tab: '巡检模板' },
  { kind: 'executions', name: '执行历史', path: '/inspection', endpoint: '/inspection/executions', tab: '执行历史' },
  { kind: 'reports', name: '巡检报告', path: '/reports', endpoint: '/reports' },
  { kind: 'devices', name: '设备管理', path: '/devices', endpoint: '/devices' },
  { kind: 'users', name: '用户管理', path: '/settings?tab=users', endpoint: '/settings/users' },
  { kind: 'audit', name: '审计日志', path: '/settings?tab=audit', endpoint: '/settings/audit/logs' },
]

const pageSizeSelect = (page: Page) => page.getByRole('combobox', { name: '每页条数' })
// 巡检 tab 保活：不能用 first()，它可能指向隐藏的策略分页。
const rangeText = (page: Page) => page.getByText(/^显示 \d+ - \d+ \/ 共 [\d,]+ 条$/).locator('visible=true')
const testRows = (page: Page) => page.getByText(/^分页测试-\d+$/, { exact: true }).locator('visible=true')

async function openSurface(page: Page, surface: Surface): Promise<void> {
  await page.goto(surface.path, { waitUntil: 'domcontentloaded' })
  if (surface.tab) await page.getByRole('button', { name: surface.tab, exact: true }).click()
  await expect(pageSizeSelect(page)).toBeVisible({ timeout: 30_000 })
}

// 固定记录只存在于浏览器路由拦截内，不创建账号/设备，也不修改数据库。
function fixtureRow(kind: SurfaceKind, id: number) {
  const name = `分页测试-${id}`
  const created_at = '2026-09-30T00:00:00Z'
  switch (kind) {
    case 'alerts': return { id: String(id), title: name, severity: 'warning', status: 'active', timestamp: created_at }
    case 'logs': return { id, message: name, level: 'info', facility: 'system', source: 'syslog', device_name: '测试设备', device_id: 1, log_timestamp: created_at, collected_at: created_at, created_at }
    case 'strategies': return { id, name, type: 'manual', devices: [], templates: [], enabled: true, created_at }
    case 'templates': return { id, name, category: 'custom', device_types: ['switch'], is_active: true, check_items: [], created_at }
    case 'executions': return { id, strategy_name: name, status: 'completed', progress: 100, start_time: created_at }
    case 'reports': return { id, name, type: 'inspection', status: 'completed', format: 'pdf', created_at }
    case 'devices': return { id, name, ip_address: `192.0.2.${id}`, device_type: 'switch', status: 'online', created_at }
    case 'users': return { id: String(id), username: name, email: '', role: 'viewer', status: 'active', createdAt: created_at }
    case 'audit': return { id: String(id), description: name, action: 'login', resource_type: 'auth', status: 'success', created_at }
  }
}

interface PageRequest {
  page: number
  pageSize: number
}

async function mockList(page: Page, surface: Surface, total: number): Promise<PageRequest[]> {
  const requests: PageRequest[] = []
  await page.route((url) => url.pathname.replace(/\/$/, '') === `/api/v1${surface.endpoint}`, async (route) => {
    const url = new URL(route.request().url())
    const pageSize = Number(url.searchParams.get('page_size') || url.searchParams.get('limit') || 20)
    const current = url.searchParams.has('skip')
      ? Number(url.searchParams.get('skip')) / pageSize + 1
      : Number(url.searchParams.get('page') || 1)
    requests.push({ page: current, pageSize })
    const offset = (current - 1) * pageSize
    const rows = Array.from({ length: Math.max(0, Math.min(pageSize, total - offset)) }, (_, index) => fixtureRow(surface.kind, offset + index + 1))
    const metadata = { total, pages: Math.ceil(total / pageSize), page: current, page_size: pageSize }
    const data = surface.kind === 'alerts' ? { ...metadata, alerts: rows }
      : surface.kind === 'reports' ? { ...metadata, reports: rows }
      : surface.kind === 'devices' ? { ...metadata, devices: rows }
      : surface.kind === 'users' ? { users: rows, total_count: total, page: current, page_size: pageSize }
      : surface.kind === 'audit' ? { items: rows, total, page: current, pageSize }
      : { ...metadata, items: rows }
    const json = ['alerts', 'users', 'audit'].includes(surface.kind) ? data : { success: true, data }
    await route.fulfill({ json })
  })
  return requests
}

for (const surface of SURFACES) {
  test(`${surface.name}：真实接口下的默认值与选项一致`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await openSurface(page, surface)
    await expect(pageSizeSelect(page)).toHaveCount(1)
    await expect(pageSizeSelect(page)).toHaveText('20条/页')
    await pageSizeSelect(page).click()
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText(EXPECTED_OPTIONS)
    await page.keyboard.press('Escape')
    await expect(rangeText(page)).toBeVisible()
    await expect(page.getByText('每页', { exact: true }).locator('visible=true')).toBeVisible()
    expect(errors).toEqual([])
  })

  test(`${surface.name}：第二页切换档位后请求归一且行数更新`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const requests = await mockList(page, surface, 61)
    await openSurface(page, surface)
    await expect(testRows(page)).toHaveCount(20)
    await expect(rangeText(page)).toHaveText('显示 1 - 20 / 共 61 条')
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(rangeText(page)).toHaveText('显示 21 - 40 / 共 61 条')
    await expect.poll(() => requests.at(-1)).toEqual({ page: 2, pageSize: 20 })
    await pageSizeSelect(page).click()
    await page.getByRole('option', { name: '50条/页', exact: true }).click()
    await expect(rangeText(page)).toHaveText('显示 1 - 50 / 共 61 条')
    await expect(testRows(page)).toHaveCount(50)
    await expect.poll(() => requests.at(-1)).toEqual({ page: 1, pageSize: 50 })
    await expect(page.getByRole('button', { name: '上一页', exact: true })).toBeDisabled()
    if (surface.kind === 'executions') {
      await expect(page).toHaveURL(/[?&]page=1(&|$)/)
      await expect(page).toHaveURL(/page_size=50/)
    }
    expect(errors).toEqual([])
  })

  test(`${surface.name}：空列表仍可切换档位`, async ({ page }) => {
    const requests = await mockList(page, surface, 0)
    await openSurface(page, surface)
    await expect(pageSizeSelect(page)).toHaveCount(1)
    await expect(page.getByRole('heading', { name: /加载.*失败|.*加载失败/ })).toHaveCount(0)
    await expect(rangeText(page)).toHaveText('显示 0 - 0 / 共 0 条')
    await pageSizeSelect(page).click()
    await page.getByRole('option', { name: '50条/页', exact: true }).click()
    await expect(pageSizeSelect(page)).toHaveText('50条/页')
    await expect.poll(() => requests[requests.length - 1]).toEqual({ page: 1, pageSize: 50 })
    await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  })
}
