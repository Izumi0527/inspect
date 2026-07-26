import { expect, test } from '@playwright/test'

const reportsOnlyProfile = {
  id: 'e2e-reports-user',
  username: 'report_viewer',
  email: 'report-viewer@example.com',
  full_name: '报表查看员',
  role: 'viewer',
  permissions: ['reports:read'],
  is_active: true,
  created_at: '2026-04-03T00:00:00.000Z',
  updated_at: '2026-04-03T00:00:00.000Z',
}

const dashboardOverviewPayload = {
  stats: [
    {
      title: '在线设备',
      value: '-',
      change: '',
      iconName: 'Monitor',
      iconColor: 'text-green-500',
      color: 'green',
    },
    {
      title: '活跃告警',
      value: '-',
      change: '',
      iconName: 'AlertTriangle',
      iconColor: 'text-red-500',
      color: 'red',
    },
    {
      title: '上行流量',
      value: '-',
      change: '24小时峰值',
      iconName: 'Upload',
      iconColor: 'text-blue-500',
      color: 'blue',
    },
    {
      title: '下行流量',
      value: '-',
      change: '24小时峰值',
      iconName: 'Download',
      iconColor: 'text-cyan-500',
      color: 'cyan',
    },
    {
      title: '巡检成功率',
      value: '-',
      change: '',
      iconName: 'ClipboardCheck',
      iconColor: 'text-purple-500',
      color: 'purple',
    },
  ],
  recent_alerts: [],
  network_overview: [],
  last_updated: '2026-04-03T00:00:00.000Z',
  permissions: {
    devices: false,
    alerts: false,
    monitoring: false,
    inspections: false,
  },
  sections: {
    stats: { ok: true },
    statsDevices: {
      ok: true,
      limitedByPermission: true,
      requiredPermission: 'devices:read',
    },
    statsAlerts: {
      ok: true,
      limitedByPermission: true,
      requiredPermission: 'alerts:read',
    },
    statsBandwidth: {
      ok: true,
      limitedByPermission: true,
      requiredPermission: 'monitoring:read',
    },
    statsInspections: {
      ok: true,
      limitedByPermission: true,
      requiredPermission: 'inspections:read',
    },
    recentAlerts: {
      ok: false,
      message: '最近告警加载失败',
    },
    networkOverview: {
      ok: false,
      message: '网络概览加载失败',
    },
  },
}

const fullAccessProfile = {
  id: 'e2e-admin-user',
  username: 'dashboard_admin',
  email: 'dashboard-admin@example.com',
  full_name: '总览管理员',
  role: 'admin',
  permissions: [
    'devices:read',
    'alerts:read',
    'monitoring:read',
    'reports:read',
    'inspections:read',
    'system:config',
  ],
  is_active: true,
  created_at: '2026-04-04T00:00:00.000Z',
  updated_at: '2026-04-04T00:00:00.000Z',
}

const fullAccessOverviewPayload = {
  stats: [
    {
      title: '在线设备',
      value: '18',
      change: '共 19 台',
      iconName: 'Monitor',
      iconColor: 'text-green-500',
      color: 'green',
    },
    {
      title: '活跃告警',
      value: '2',
      change: '待处理',
      iconName: 'AlertTriangle',
      iconColor: 'text-red-500',
      color: 'red',
    },
    {
      title: '上行流量',
      value: '86000000',
      change: '24小时峰值',
      iconName: 'Upload',
      iconColor: 'text-blue-500',
      color: 'blue',
      unit: 'bps',
    },
    {
      title: '下行流量',
      value: '125000000',
      change: '24小时峰值',
      iconName: 'Download',
      iconColor: 'text-cyan-500',
      color: 'cyan',
      unit: 'bps',
    },
    {
      title: '巡检成功率',
      value: '87.5%',
      change: '近24小时',
      iconName: 'ClipboardCheck',
      iconColor: 'text-purple-500',
      color: 'purple',
    },
  ],
  recent_alerts: [
    {
      id: 101,
      device: 'core-sw-01',
      message: '核心交换机温度过高',
      severity: 'critical',
      time: '2026-04-04T00:00:00.000Z',
      category: 'temperature',
    },
  ],
  network_overview: [
    {
      name: '核心交换机',
      devices: 8,
      status: 'critical',
    },
  ],
  last_updated: '2026-04-04T00:00:00.000Z',
  permissions: {
    devices: true,
    alerts: true,
    monitoring: true,
    inspections: true,
  },
  sections: {
    stats: { ok: true },
    statsDevices: { ok: true },
    statsAlerts: { ok: true },
    statsBandwidth: { ok: true },
    statsInspections: { ok: true },
    recentAlerts: { ok: true },
    networkOverview: { ok: true },
  },
}

test.describe('Dashboard 总览浏览器回归', () => {
  test('有限权限用户应看到收口后的快捷入口、分区失败提示与通知失败态', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (error) => pageErrors.push(error))

    await page.route('**/api/v1/auth/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(reportsOnlyProfile),
      })
    })

    await page.route('**/api/v1/dashboard/overview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(dashboardOverviewPayload),
      })
    })

    await page.route('**/api/v1/dashboard/notifications?limit=20', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            type: 'server_error',
            message: 'mock notifications failed',
          },
        }),
      })
    })

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: '控制台总览' })).toBeVisible()
    await expect(page.getByText('数据访问受限')).toBeVisible()
    await expect(page.getByText('部分分区暂时不可用')).toBeVisible()
    await expect(page.getByText('最近告警加载失败')).toBeVisible()
    await expect(page.getByText('网络概览加载失败')).toBeVisible()

    await expect(page.getByRole('button', { name: '生成报表' })).toBeVisible()
    await expect(page.getByRole('button', { name: '设备扫描' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '手动巡检' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '系统配置' })).toHaveCount(0)

    await page.locator('button:has(svg.lucide-bell)').click()

    await expect(page.getByText('通知加载失败')).toBeVisible()
    await expect(page.getByText('当前无法获取最新通知，请检查网络或稍后重试。')).toBeVisible()
    await expect(page.getByText('mock notifications failed')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试加载通知' })).toBeVisible()

    expect(
      pageErrors,
      `存在未捕获页面异常：${pageErrors.map((item) => item.message).join('; ')}`
    ).toHaveLength(0)
  })

  test('全权限用户应完成通知批量已读与清空链路，并保持 happy path 视图', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (error) => pageErrors.push(error))

    let notificationsState = [
      {
        id: 'alert-101',
        type: 'alert',
        title: '告警：core-sw-01',
        content: '核心交换机温度过高',
        timestamp: '2026-04-04T00:00:00.000Z',
        read: false,
        severity: 'critical',
        link: '/alerts?id=101',
        device: 'core-sw-01',
      },
      {
        id: 'report-9',
        type: 'system',
        title: '巡检周报已生成',
        content: '周报已生成，可前往报表中心查看',
        timestamp: '2026-04-04T00:05:00.000Z',
        read: false,
        severity: 'success',
        link: '/reports?id=9',
      },
    ]

    const readPayloads: Array<Record<string, unknown>> = []
    const dismissPayloads: Array<Record<string, unknown>> = []

    await page.route('**/api/v1/auth/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fullAccessProfile),
      })
    })

    await page.route('**/api/v1/dashboard/overview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fullAccessOverviewPayload),
      })
    })

    await page.route('**/api/v1/dashboard/notifications?limit=20', async (route) => {
      const unreadCount = notificationsState.filter((item) => !item.read).length
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: notificationsState,
          unread_count: unreadCount,
          last_updated: '2026-04-04T00:10:00.000Z',
        }),
      })
    })

    await page.route('**/api/v1/dashboard/notifications/read', async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      readPayloads.push(payload)
      if (payload.all === true) {
        notificationsState = notificationsState.map((item) => ({ ...item, read: true }))
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated: notificationsState.length }),
      })
    })

    await page.route('**/api/v1/dashboard/notifications/dismiss', async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      dismissPayloads.push(payload)
      if (payload.all === true) {
        notificationsState = []
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated: 2 }),
      })
    })

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: '控制台总览' })).toBeVisible()
    await expect(page.getByText('数据访问受限')).toHaveCount(0)
    await expect(page.getByText('部分分区暂时不可用')).toHaveCount(0)

    // 统计行应为 5 卡新结构：峰值流量拆分上/下行，巡检成功率替代系统负载/CPU
    await expect(page.getByText('上行流量')).toBeVisible()
    await expect(page.getByText('下行流量')).toBeVisible()
    await expect(page.getByText('巡检成功率')).toBeVisible()
    await expect(page.getByText('86.0 Mbps')).toBeVisible()
    await expect(page.getByText('125.0 Mbps')).toBeVisible()
    await expect(page.getByText('87.5%')).toBeVisible()
    await expect(page.getByText('峰值流量')).toHaveCount(0)
    await expect(page.getByText('系统负载')).toHaveCount(0)
    await expect(page.getByText('CPU使用率')).toHaveCount(0)

    await expect(page.getByRole('button', { name: '设备扫描' })).toBeVisible()
    await expect(page.getByRole('button', { name: '手动巡检' })).toBeVisible()
    await expect(page.getByRole('button', { name: '生成报表' })).toBeVisible()
    await expect(page.getByRole('button', { name: '系统配置' })).toBeVisible()

    const bellButton = page.locator('button:has(svg.lucide-bell)')
    await expect(bellButton.locator('span').first()).toHaveText('2')

    await bellButton.click()
    await expect(page.getByText('告警：core-sw-01')).toBeVisible()
    await expect(page.getByText('巡检周报已生成')).toBeVisible()

    await page.getByRole('button', { name: '全部已读' }).click()
    await expect.poll(() => readPayloads.length).toBe(1)
    expect(readPayloads[0]).toMatchObject({ all: true, window_limit: 200 })
    await expect(bellButton.locator('span')).toHaveCount(0)

    await page.getByRole('button', { name: '清空' }).click()
    await expect.poll(() => dismissPayloads.length).toBe(1)
    expect(dismissPayloads[0]).toMatchObject({ all: true, window_limit: 200 })
    await expect(page.getByText('暂无最近通知')).toBeVisible()

    expect(
      pageErrors,
      `存在未捕获页面异常：${pageErrors.map((item) => item.message).join('; ')}`
    ).toHaveLength(0)
  })
})
