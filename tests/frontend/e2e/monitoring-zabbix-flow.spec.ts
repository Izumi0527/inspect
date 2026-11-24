import { expect, test } from '@playwright/test'

const adminProfile = {
  id: 'e2e-mon-admin',
  username: 'mon_admin',
  email: 'mon-admin@example.com',
  full_name: '监控管理员',
  role: 'admin',
  permissions: [
    'monitoring:read',
    'monitoring:control',
    'monitoring:export',
    'devices:read',
    'devices:create',
    'devices:update',
    'devices:delete',
    'alerts:read',
    'alerts:create',
    'alerts:update',
    'alerts:delete',
    'inspections:read',
    'system:logs',
  ],
  is_active: true,
  created_at: '2026-11-20T00:00:00.000Z',
  updated_at: '2026-11-20T00:00:00.000Z',
}

const dashboardV2Payload = {
  data: {
    statsV2: [
      { id: 'total_devices', title: '总设备', value: '12' },
      { id: 'active_alerts', title: '活跃告警', value: '1' },
    ],
    systemPerformance: [
      {
        timestamp: '2026-11-20T12:00:00Z',
        devices: { 'Core-SW-01': { cpu: 45, memory: 60 } },
      },
    ],
    temperatureHistory: [
      { timestamp: '2026-11-20T12:00:00Z', devices: { 'Core-SW-01': 49 } },
    ],
    networkTrafficHistory: [
      { timestamp: '2026-11-20T12:00:00Z', inbound: 120, outbound: 80 },
    ],
    thresholds: {
      cpu: { warn: 80, crit: 90 },
      memory: { warn: 80, crit: 90 },
      temperature: { warn: 70, crit: 85 },
    },
    healthDistribution: {
      normal: 9,
      elevated: 2,
      overloaded: 1,
      offline: 0,
      maintenance: 0,
    },
    groupSummaries: [
      {
        group_id: 1,
        group_name: '核心机房',
        total_devices: 12,
        online_devices: 12,
        offline_devices: 0,
        warning_devices: 1,
        max_cpu: 72,
        max_memory: 64,
      },
    ],
    notificationChannelSummary: [
      { channel: 'email', enabled: true, configured: true },
      { channel: 'webhook', enabled: false, configured: false },
    ],
    activeProblems: [],
    lastUpdate: '2026-11-20T12:00:00Z',
  },
  sections: {
    stats: { ok: true },
    systemPerformance: { ok: true },
    temperature: { ok: true },
    networkTraffic: { ok: true },
  },
  hasPartialFailure: false,
  failedSections: [],
  lastUpdate: '2026-11-20T12:00:00Z',
}

test.describe('监控中心 Zabbix 级工作台浏览器回归 (/monitoring)', () => {
  test('完整覆盖 6 大 Tab 导航、分组弹窗、总览投屏、主机下钻抽屉、实时对比与配置工作台', async ({
    page,
  }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.route('**/api/v1/auth/profile', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminProfile),
      })
    )
    await page.route('**/api/v1/monitoring/dashboard/v2', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(dashboardV2Payload),
      })
    )
    await page.route('**/api/v1/monitoring/devices', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 11,
            name: 'Core-SW-01',
            ip_address: '10.10.0.1',
            status: 'online',
            is_monitored: true,
          },
        ]),
      })
    )
    await page.route('**/api/v1/devices/groups', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              name: '核心机房',
              parent_id: null,
              device_count: 12,
              online_count: 12,
              alert_count: 1,
              alerts_limited_by_permission: false,
            },
          ],
        }),
      })
    )
    await page.route('**/api/v1/monitoring/engine-health', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            duration_ms: 350,
            total_devices: 12,
            success_devices: 12,
            failed_devices: 0,
            backoff_devices: 0,
            pending_write_queue: 0,
            backoff_device_list: [],
          },
        }),
      })
    )
    await page.route('**/api/v1/monitoring/topn*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { metric: 'cpu', unit: '%', items: [] },
        }),
      })
    )
    await page.route('**/api/v1/monitoring/hosts?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: 11,
                name: 'Core-SW-01',
                ip_address: '10.10.0.1',
                device_type: 'switch',
                vendor: 'huawei',
                group_id: 1,
                group_name: '核心机房',
                status: 'online',
                is_monitored: true,
                is_pinned: false,
                in_maintenance: false,
                cpu_usage: 45,
                memory_usage: 60,
                temperature: 49,
                response_time: 1.5,
                protocols: {
                  icmp_status: 'online',
                  snmp_status: 'success',
                  cli_protocol: 'ssh',
                  icmp_healthy: true,
                  snmp_healthy: true,
                  cli_configured: true,
                },
                collection_state: {
                  last_error_code: '',
                  last_error_message: '',
                  consecutive_failures: 0,
                  in_backoff: false,
                  last_duration_ms: 80,
                },
                interfaces_up: 10,
                interfaces_total: 12,
                hardware_fault_count: 0,
                latest_inspection_score: 95,
                error_log_count_24h: 0,
                trap_log_count_24h: 0,
                sparkline: [],
              },
            ],
            total: 1,
            page: 1,
            page_size: 20,
            total_pages: 1,
            limitedByPermission: false,
            permissions: {
              alerts: { allowed: true },
              inspections: { allowed: true },
              logs: { allowed: true },
            },
          },
        }),
      })
    )
    await page.route('**/api/v1/monitoring/hosts/11/detail', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            device: {
              id: 11,
              name: 'Core-SW-01',
              ip_address: '10.10.0.1',
              device_type: 'switch',
              vendor: 'huawei',
              status: 'online',
              is_monitored: true,
              is_pinned: false,
              in_maintenance: false,
              protocols: {
                icmp_status: 'online',
                snmp_status: 'success',
                cli_protocol: 'ssh',
                icmp_healthy: true,
                snmp_healthy: true,
                cli_configured: true,
              },
              collection_state: {
                last_error_code: '',
                last_error_message: '',
                consecutive_failures: 0,
                in_backoff: false,
                last_duration_ms: 80,
              },
              interfaces_up: 10,
              interfaces_total: 12,
              hardware_fault_count: 0,
              sparkline: [],
            },
            topology_role: 'core',
            interfaces: [],
            snmp_extensions: {
              device_id: 11,
              bgp_peers: [],
              optical_transceivers: [],
              components: [],
              disks: [],
            },
            neighbors: [],
            recent_logs: [],
            active_alerts: [],
            thresholds: {
              cpu: { warn: 80, crit: 90 },
              memory: { warn: 80, crit: 90 },
              temperature: { warn: 70, crit: 85 },
            },
            limitedByPermission: false,
            permissions: {
              alerts: { allowed: true },
              inspections: { allowed: true },
              logs: { allowed: true },
            },
          },
        }),
      })
    )
    await page.route('**/api/v1/monitoring/latest-data*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [
              {
                device_id: 11,
                device_name: 'Core-SW-01',
                ip_address: '10.10.0.1',
                metric_name: 'cpu_usage',
                metric_label: 'CPU 使用率',
                interface_name: '',
                item_key: 'cpu.usage',
                application_tag: 'system',
                metric_value: 45,
                prev_value: 40,
                delta: 5,
                display_value: '45.00 %',
                metric_unit: '%',
                is_abnormal: false,
                collected_at: '2026-11-20T12:00:00Z',
              },
            ],
            total: 1,
            page: 1,
            page_size: 50,
            total_pages: 1,
          },
        }),
      })
    )
    await page.route('**/api/v1/monitoring/graphs/adhoc', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            timestamps: ['2026-11-20T12:00:00Z'],
            start_time: '2026-11-20T11:00:00Z',
            end_time: '2026-11-20T12:00:00Z',
            series: [
              {
                key: '11:cpu_usage:',
                device_id: 11,
                device_name: 'Core-SW-01',
                metric_name: 'cpu_usage',
                metric_label: 'CPU 使用率',
                unit: '%',
                values: [45],
              },
            ],
          },
        }),
      })
    )
    await page.route('**/api/v1/monitoring/templates', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      })
    )
    await page.route('**/api/v1/monitoring/triggers*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      })
    )
    await page.route('**/api/v1/monitoring/maintenances', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      })
    )

    await page.goto('/monitoring', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('全网健康与负载分布')).toBeVisible()

    // 投屏模式切换与 Esc 退出
    await page.getByRole('button', { name: '值班投屏' }).click()
    await expect(page.getByTestId('monitoring-kiosk-view')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('monitoring-kiosk-view')).toHaveCount(0)

    // 设备监控 -> 左侧栏 GroupTreeSidebar 新建分组弹窗 & 点击主机打开 6 视角抽屉
    await page.getByRole('tab', { name: '设备监控' }).click()
    await page.getByLabel('设备分组树导航').getByRole('button', { name: /\+ 新建分组/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page.getByText('Core-SW-01')).toBeVisible()
    await page.getByText('Core-SW-01').click()
    await expect(page.getByRole('dialog', { name: '设备监控详情抽屉' })).toBeVisible()
    await page.keyboard.press('Escape')

    // 实时指标明细 -> 勾选对比
    await page.getByRole('tab', { name: '实时指标明细' }).click()
    await expect(page.getByText('CPU 使用率')).toBeVisible()
    await page.getByRole('checkbox', { name: /选择对比 Core-SW-01/ }).click()
    await expect(page.getByLabel('多指标同图对比曲线图')).toBeVisible()

    // 三大去黑话配置工作台 Tab
    await page.getByRole('tab', { name: '监控方案' }).click()
    await page.getByRole('tab', { name: '告警规则' }).click()
    await page.getByRole('tab', { name: '计划维护' }).click()

    expect(pageErrors).toHaveLength(0)
  })
})
