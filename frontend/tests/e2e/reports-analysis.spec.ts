import { expect, test, type Page } from '@playwright/test'

const waitForApiOk = (page: Page, method: string, urlPart: string) =>
  page.waitForResponse((resp) => {
    if (resp.request().method() !== method) return false
    if (!resp.url().includes(urlPart)) return false
    return resp.status() >= 200 && resp.status() < 300
  })

/**
 * Radix Dialog（Modal）会将 Overlay 与 Content 作为 Portal 下的兄弟节点渲染，
 * 因此不能再用 overlay 的 DOM 作为“弹窗根节点”来查找内部元素。
 *
 * 这里统一用 role=dialog 定位当前最上层弹窗内容。
 */
const topDialog = (page: Page) => page.getByRole('dialog').last()
const closeDialogByX = async (dialog: ReturnType<typeof topDialog>) => {
  await dialog.locator('button.absolute.right-4.top-4').click()
}

test.describe('报表分析（/reports）按钮覆盖', () => {
  test('巡检报告：筛选/快捷操作/生成/预览/编辑/删除', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/reports?tab=inspection', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '巡检报告', exact: true })).toBeVisible()
    await expect(page.getByText('巡检报告管理')).toBeVisible()

    // 验收口径：默认不应处于 Mock 回退模式
    await expect(page.getByText('Mock 回退模式')).toHaveCount(0)

    // 状态筛选（触发后端列表查询）
    await page.getByRole('combobox').filter({ hasText: '全部状态' }).click()
    await Promise.all([
      waitForApiOk(page, 'GET', '/api/v1/reports?'),
      page.getByRole('option', { name: '已完成' }).click(),
    ])

    // 恢复全部状态
    await page.getByRole('combobox').filter({ hasText: '已完成' }).click()
    await page.getByRole('option', { name: '全部状态' }).click()

    // 格式筛选（当前为前端本页过滤，不要求触发后端请求）
    await page.getByRole('combobox').filter({ hasText: '全部格式' }).click()
    await page.getByRole('option', { name: 'PDF' }).click()

    // 快捷卡片：快速日报（触发生成 + 下载）
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/inspection/generate'),
      page.getByText('快速日报').click(),
    ])

    // 快捷卡片：设备对比
    await page.getByText('设备对比').click()
    const compareDialog = topDialog(page)
    await expect(compareDialog.getByRole('heading', { name: '设备对比' })).toBeVisible()
    await compareDialog.getByPlaceholder('例如：1,2,3').fill('1,2')
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/inspection/compare'),
      compareDialog.getByRole('button', { name: '开始对比' }).click(),
    ])
    await closeDialogByX(compareDialog)

    // 快捷卡片：问题分析
    await page.getByText('问题分析').click()
    const analysisDialog = topDialog(page)
    await expect(analysisDialog.getByRole('heading', { name: '问题分析' })).toBeVisible()
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/inspection/data'),
      analysisDialog.getByRole('button', { name: '刷新数据' }).click(),
    ])
    await closeDialogByX(analysisDialog)

    // 生成报告（打开弹窗 -> 填必填项 -> 提交）
    const inspectionReportTitle = `E2E_巡检报告_${Date.now()}`
    await page.getByRole('button', { name: '生成报告' }).first().click()
    const generateDialog = topDialog(page)
    await expect(generateDialog.getByText('生成巡检报告')).toBeVisible()
    await generateDialog.getByPlaceholder('请输入报告标题').fill(inspectionReportTitle)
    await generateDialog.getByRole('button', { name: '最近7天' }).click()

    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/inspection/generate'),
      generateDialog.getByRole('button', { name: '生成报告' }).click(),
    ])

    // 等待表格出现（有数据时才会渲染 Table + 分页按钮）
    await expect(page.getByRole('button', { name: '上一页' })).toBeVisible()
    await expect(page.getByRole('button', { name: '下一页' })).toBeVisible()

    // 定位到本次用例生成的那一行，避免受“快速日报”等并发数据影响
    await expect(page.getByText(inspectionReportTitle)).toBeVisible()
    const reportRow = page.locator('tbody tr').filter({ hasText: inspectionReportTitle })

    // 行操作：预览
    await reportRow.locator('button[title="预览报表"]').click()
    const previewDialog = topDialog(page)
    await expect(previewDialog.getByRole('button', { name: '下载' })).toBeVisible()
    await previewDialog.getByRole('button', { name: '下载' }).click()
    await closeDialogByX(previewDialog)

    // 行操作：编辑
    await reportRow.locator('button[title="编辑"]').click()
    const editDialog = topDialog(page)
    await expect(editDialog.getByText('编辑巡检报表')).toBeVisible()
    await editDialog.getByPlaceholder('请输入报表描述（可选）').fill(`E2E_描述_${Date.now()}`)
    await Promise.all([
      waitForApiOk(page, 'PUT', '/api/v1/reports/'),
      editDialog.getByRole('button', { name: '保存' }).click(),
    ])

    // 行操作：删除（先取消一次，再确认删除）
    await reportRow.locator('button[title="删除"]').click()
    const deleteDialog1 = topDialog(page)
    await expect(deleteDialog1.getByText('删除报告')).toBeVisible()
    await deleteDialog1.getByRole('button', { name: '取消' }).click()

    await reportRow.locator('button[title="删除"]').click()
    const deleteDialog2 = topDialog(page)
    await Promise.all([
      waitForApiOk(page, 'DELETE', '/api/v1/reports/'),
      deleteDialog2.getByRole('button', { name: '删除' }).click(),
    ])

    // 快捷卡片：自定义配置（跳转到自定义 Tab）
    await page.getByText('自定义配置').click()
    await expect(page).toHaveURL(/\/reports\?tab=custom/)
    await expect(page.getByRole('button', { name: '自定义报表', exact: true })).toBeVisible()

    expect(pageErrors, `存在未捕获页面异常：${pageErrors.map((e) => e.message).join('; ')}`).toHaveLength(0)
  })

  test('趋势分析：时间范围/指标切换/生成趋势报告', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/reports?tab=trends', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '趋势分析', exact: true })).toBeVisible()
    await expect(page.getByText('设备性能趋势分析')).toBeVisible()

    // 时间范围切换（触发趋势分析请求）
    await page.getByRole('combobox').filter({ hasText: '最近7天' }).click()
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/trends/analysis'),
      page.getByRole('option', { name: '最近30天' }).click(),
    ])

    await page.getByRole('combobox').filter({ hasText: '最近30天' }).click()
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/trends/analysis'),
      page.getByRole('option', { name: '最近90天' }).click(),
    ])

    // 指标切换（会触发趋势分析请求，确保前后端真实联动）
    await page.getByRole('combobox').filter({ hasText: '可用性' }).click()
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/trends/analysis'),
      page.getByRole('option', { name: '性能' }).click(),
    ])

    await page.getByRole('combobox').filter({ hasText: '性能' }).click()
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/trends/analysis'),
      page.getByRole('option', { name: '错误数' }).click(),
    ])

    // 生成趋势报告
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/trends/generate'),
      page.getByRole('button', { name: '生成趋势报告' }).click(),
    ])

    expect(pageErrors, `存在未捕获页面异常：${pageErrors.map((e) => e.message).join('; ')}`).toHaveLength(0)
  })

  test('统计报表：筛选展开/快捷日期/重置/刷新/生成/导出', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/reports?tab=statistics', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '统计报表', exact: true })).toBeVisible()
    await expect(page.getByText('数据筛选')).toBeVisible()

    // 展开筛选面板
    await page.getByRole('button', { name: '展开' }).click()

    // 快捷日期（触发统计接口请求；至少断言 data 2xx）
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/statistics/data'),
      page.getByRole('button', { name: '最近7天' }).click(),
    ])

    // 重置筛选：可能命中 react-query staleTime 缓存，因此不强制等待网络请求
    await page.getByRole('button', { name: '重置筛选' }).click()

    // 刷新数据
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/statistics/data'),
      page.getByRole('button', { name: '刷新数据' }).click(),
    ])

    // 收起
    await page.getByRole('button', { name: '收起' }).click()

    // 生成统计报表
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/statistics/generate'),
      page.getByRole('button', { name: '生成统计报表' }).click(),
    ])

    // 导出数据
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/export/excel'),
      page.getByRole('button', { name: '导出数据' }).click(),
    ])

    expect(pageErrors, `存在未捕获页面异常：${pageErrors.map((e) => e.message).join('; ')}`).toHaveLength(0)
  })

  test('自定义报表：创建/预览/生成/编辑/复制/删除/导入弹窗', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/reports?tab=custom', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '自定义报表', exact: true })).toBeVisible()

    // 先创建一个配置（空态下按钮也存在）
    const configName = `E2E_自定义配置_${Date.now()}`

    await page.getByRole('button', { name: '创建自定义报表' }).first().click()
    const createDialog = topDialog(page)
    await expect(createDialog.getByText('创建自定义报表配置')).toBeVisible()
    await createDialog.getByPlaceholder('例如：月度运营摘要').fill(configName)
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/custom/configs'),
      createDialog.getByRole('button', { name: '保存' }).click(),
    ])
    await expect(page.getByText(configName)).toBeVisible()

    // 配置卡片操作：预览
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST' &&
          resp.url().includes('/api/v1/reports/custom/configs/') &&
          resp.url().includes('/preview') &&
          resp.status() >= 200 &&
          resp.status() < 300
      ),
      page.locator('button[title="预览报表数据"]').first().click(),
    ])
    await expect(page.getByText('配置预览')).toBeVisible()

    // 生成完整报表（在预览弹窗内）
    const configPreviewDialog = topDialog(page)
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST' &&
          resp.url().includes('/api/v1/reports/custom/configs/') &&
          resp.url().includes('/generate') &&
          resp.status() >= 200 &&
          resp.status() < 300
      ),
      configPreviewDialog.getByRole('button', { name: '生成完整报表' }).click(),
    ])

    // 卡片操作：生成报表
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST' &&
          resp.url().includes('/api/v1/reports/custom/configs/') &&
          resp.url().includes('/generate') &&
          resp.status() >= 200 &&
          resp.status() < 300
      ),
      page.getByRole('button', { name: '生成报表' }).first().click(),
    ])

    // 卡片操作：编辑
    await page.locator('button[title="编辑配置"]').first().click()
    const updateDialog = topDialog(page)
    await expect(updateDialog.getByText('编辑自定义报表配置')).toBeVisible()
    await updateDialog.getByPlaceholder('可选：用于说明该配置的用途').fill(`E2E_描述_${Date.now()}`)
    await Promise.all([
      page.waitForResponse((resp) => resp.request().method() === 'PUT' && resp.url().includes('/api/v1/reports/custom/configs/') && resp.status() >= 200 && resp.status() < 300),
      updateDialog.getByRole('button', { name: '保存' }).click(),
    ])

    // 卡片操作：复制
    await page.locator('button[title="复制配置"]').first().click()
    const copyDialog = topDialog(page)
    await expect(copyDialog.getByText('复制自定义报表配置')).toBeVisible()
    await Promise.all([
      waitForApiOk(page, 'POST', '/api/v1/reports/custom/configs'),
      copyDialog.getByRole('button', { name: '保存' }).click(),
    ])

    // 导入模板弹窗（仅验证可打开/可取消）
    await page.getByRole('button', { name: '导入模板' }).first().click()
    const importDialog = topDialog(page)
    await expect(importDialog.getByText('导入自定义报表配置')).toBeVisible()
    await importDialog.getByRole('button', { name: '取消' }).click()

    // 删除配置（删除两次，尽量清理刚创建/复制的配置）
    const deleteButtons = page.locator('button[title="删除配置"]')
    const deleteCount = await deleteButtons.count()
    for (let i = 0; i < Math.min(2, deleteCount); i++) {
      await deleteButtons.nth(0).click()
      const deleteConfigDialog = topDialog(page)
      await Promise.all([
        page.waitForResponse((resp) => resp.request().method() === 'DELETE' && resp.url().includes('/api/v1/reports/custom/configs/') && resp.status() >= 200 && resp.status() < 300),
        deleteConfigDialog.getByRole('button', { name: '删除' }).click(),
      ])
    }

    expect(pageErrors, `存在未捕获页面异常：${pageErrors.map((e) => e.message).join('; ')}`).toHaveLength(0)
  })
})
