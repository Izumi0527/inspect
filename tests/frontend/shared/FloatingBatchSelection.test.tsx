import React from 'react'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { useBatchSelection } from '@/hooks/useBatchSelection'
import { FloatingBatchActionBar } from '@/components/shared/FloatingBatchActionBar'
import { BatchDeleteConfirmModal } from '@/components/shared/BatchDeleteConfirmModal'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

describe('useBatchSelection Hook', () => {
  interface TestItem {
    id: string
    name: string
    status: 'running' | 'completed'
  }

  const mockItems: TestItem[] = [
    { id: '1', name: 'Item 1', status: 'completed' },
    { id: '2', name: 'Item 2', status: 'completed' },
    { id: '3', name: 'Item 3', status: 'running' },
  ]

  it('初始状态应为空选择', () => {
    const { result } = renderHook(() =>
      useBatchSelection({
        items: mockItems,
        getId: (item) => item.id,
        isSelectable: (item) => item.status !== 'running',
      })
    )

    expect(result.current.selectedIds).toEqual([])
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.selectionMode).toBe('explicit')
    expect(result.current.isAllCurrentPageSelected).toBe(false)
  })

  it('单项选中与反选 toggleSelect', () => {
    const { result } = renderHook(() =>
      useBatchSelection({
        items: mockItems,
        getId: (item) => item.id,
        isSelectable: (item) => item.status !== 'running',
      })
    )

    act(() => {
      result.current.toggleSelect('1')
    })
    expect(result.current.selectedIds).toEqual(['1'])
    expect(result.current.selectedCount).toBe(1)

    act(() => {
      result.current.toggleSelect('1')
    })
    expect(result.current.selectedIds).toEqual([])
    expect(result.current.selectedCount).toBe(0)
  })

  it('全选当前页 selectCurrentPage 仅选中可选记录', () => {
    const { result } = renderHook(() =>
      useBatchSelection({
        items: mockItems,
        getId: (item) => item.id,
        isSelectable: (item) => item.status !== 'running',
      })
    )

    act(() => {
      result.current.selectCurrentPage()
    })

    // Item 3 is running (not selectable), so only 1 and 2 are selected
    expect(result.current.selectedIds).toEqual(['1', '2'])
    expect(result.current.selectedCount).toBe(2)
    expect(result.current.isAllCurrentPageSelected).toBe(true)
  })

  it('全选筛选结果 selectAllFiltered 激活跨页全选模式', () => {
    const { result } = renderHook(() =>
      useBatchSelection({
        items: mockItems,
        totalCount: 50,
        getId: (item) => item.id,
        isSelectable: (item) => item.status !== 'running',
      })
    )

    act(() => {
      result.current.selectAllFiltered()
    })

    expect(result.current.selectionMode).toBe('all_filtered')
    // 总计 50 项，当前页有 1 项 running 不可选，已选应为 49 项
    expect(result.current.selectedCount).toBe(49)
    expect(result.current.isAllCurrentPageSelected).toBe(true)

    // 在 all_filtered 模式下手选取消第 1 项
    act(() => {
      result.current.toggleSelect('1')
    })
    expect(result.current.excludedIds).toEqual(['1'])
    expect(result.current.selectedCount).toBe(48)
    expect(result.current.isAllCurrentPageSelected).toBe(false)

    // 再次点击恢复第 1 项
    act(() => {
      result.current.toggleSelect('1')
    })
    expect(result.current.excludedIds).toEqual([])
    expect(result.current.selectedCount).toBe(49)
    expect(result.current.isAllCurrentPageSelected).toBe(true)
  })

  it('反选当前页 invertCurrentPage（显式模式）', () => {
    const { result } = renderHook(() =>
      useBatchSelection({
        items: mockItems,
        getId: (item) => item.id,
        isSelectable: (item) => item.status !== 'running',
      })
    )

    // 先选中第 1 项
    act(() => {
      result.current.toggleSelect('1')
    })
    expect(result.current.selectedIds).toEqual(['1'])

    // 反选当前页：原本选中 1，现在应该只选中 2（3 为 running 不可选）
    act(() => {
      result.current.invertCurrentPage()
    })
    expect(result.current.selectedIds).toEqual(['2'])
  })

  it('取消选择 clearSelection 清空所有状态', () => {
    const { result } = renderHook(() =>
      useBatchSelection({
        items: mockItems,
        getId: (item) => item.id,
        isSelectable: (item) => item.status !== 'running',
      })
    )

    act(() => {
      result.current.selectCurrentPage()
    })
    expect(result.current.selectedCount).toBe(2)

    act(() => {
      result.current.clearSelection()
    })
    expect(result.current.selectedIds).toEqual([])
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.selectionMode).toBe('explicit')
  })

  it('筛选依赖 filterDeps 改变时自动清空已选', () => {
    let filter = 'all'
    const { result, rerender } = renderHook(
      ({ statusFilter }) =>
        useBatchSelection({
          items: mockItems,
          getId: (item) => item.id,
          filterDeps: [statusFilter],
        }),
      { initialProps: { statusFilter: filter } }
    )

    act(() => {
      result.current.selectCurrentPage()
    })
    expect(result.current.selectedCount).toBe(3)

    // 改变筛选条件
    filter = 'completed'
    rerender({ statusFilter: filter })

    expect(result.current.selectedCount).toBe(0)
    expect(result.current.selectedIds).toEqual([])
  })
})

describe('FloatingBatchActionBar 组件', () => {
  it('selectedCount 为 0 时不渲染内容', () => {
    const { container } = render(
      <FloatingBatchActionBar
        selectedCount={0}
        onSelectCurrentPage={jest.fn()}
        onInvertCurrentPage={jest.fn()}
        onClearSelection={jest.fn()}
        onDelete={jest.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('显式选择模式下展示计数与操作按钮', () => {
    const onSelectCurrentPage = jest.fn()
    const onSelectAllFiltered = jest.fn()
    const onInvertCurrentPage = jest.fn()
    const onClearSelection = jest.fn()
    const onDelete = jest.fn()

    render(
      <FloatingBatchActionBar
        selectedCount={5}
        selectionMode="explicit"
        onSelectCurrentPage={onSelectCurrentPage}
        onSelectAllFiltered={onSelectAllFiltered}
        onInvertCurrentPage={onInvertCurrentPage}
        onClearSelection={onClearSelection}
        onDelete={onDelete}
      />
    )

    // 验证 aria-label 与已选文案
    const region = screen.getByRole('region', { name: '批量操作栏' })
    expect(region).toBeInTheDocument()
    expect(screen.getByText('已选择 5 项')).toBeInTheDocument()

    // 验证按钮点击交互
    fireEvent.click(screen.getByRole('button', { name: '全选当前页' }))
    expect(onSelectCurrentPage).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '全选筛选结果' }))
    expect(onSelectAllFiltered).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '反选当前页' }))
    expect(onInvertCurrentPage).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '取消选择' }))
    expect(onClearSelection).toHaveBeenCalledTimes(1)

    // 验证醒目的红色删除字样按钮
    const deleteBtn = screen.getByRole('button', { name: '删除' })
    expect(deleteBtn).toBeInTheDocument()
    expect(deleteBtn.className).toContain('text-red-600')
    expect(deleteBtn.className).toContain('h-7')
    fireEvent.click(deleteBtn)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('使用外层 Flex 居中轨道定位且内层不含 -translate-x-1/2，采用紧凑尺寸', () => {
    const { container } = render(
      <FloatingBatchActionBar
        selectedCount={3}
        onSelectCurrentPage={jest.fn()}
        onSelectAllFiltered={jest.fn()}
        onInvertCurrentPage={jest.fn()}
        onClearSelection={jest.fn()}
        onDelete={jest.fn()}
      />
    )

    // 外层定位轨道 flex 水平居中
    const outerTrack = container.querySelector('[data-slot="floating-batch-bar"]')
    expect(outerTrack).toBeInTheDocument()
    expect(outerTrack?.className).toContain('flex')
    expect(outerTrack?.className).toContain('justify-center')
    expect(outerTrack?.className).toContain('fixed')
    expect(outerTrack?.className).toContain('bottom-4')
    expect(outerTrack?.className).toContain('inset-x-0')

    // 内层面板 region 不含 -translate-x-1/2 避免与 Framer Motion 叠加
    const region = screen.getByRole('region', { name: '批量操作栏' })
    expect(region).toBeInTheDocument()
    expect(region.className).not.toContain('-translate-x-1/2')
    expect(region.className).not.toContain('left-1/2')

    // 验证紧凑化尺寸类名（适配 14 寸 1080P/2K 屏幕）
    expect(region.className).toContain('px-3')
    expect(region.className).toContain('py-1.5')
    expect(region.className).toContain('rounded-xl')
    expect(region.className).toContain('text-xs')

    // 验证操作按钮与删除按钮均使用紧凑高度 h-7
    const selectCurrentBtn = screen.getByRole('button', { name: '全选当前页' })
    expect(selectCurrentBtn.className).toContain('h-7')
    const deleteBtn = screen.getByRole('button', { name: '删除' })
    expect(deleteBtn.className).toContain('h-7')
  })

  it('全选筛选结果模式下文案展示', () => {
    render(
      <FloatingBatchActionBar
        selectedCount={120}
        selectionMode="all_filtered"
        onSelectCurrentPage={jest.fn()}
        onInvertCurrentPage={jest.fn()}
        onClearSelection={jest.fn()}
        onDelete={jest.fn()}
      />
    )

    expect(screen.getByText('已全选筛选结果 (120 项)')).toBeInTheDocument()
  })

  it('支持渲染 extraActions 自定义动作并能触发点击', () => {
    const onAck = jest.fn()
    const onResolve = jest.fn()

    render(
      <FloatingBatchActionBar
        selectedCount={3}
        onSelectCurrentPage={jest.fn()}
        onInvertCurrentPage={jest.fn()}
        onClearSelection={jest.fn()}
        extraActions={[
          { key: 'ack', label: '批量确认', onClick: onAck },
          { key: 'resolve', label: '批量解决', onClick: onResolve, disabled: true },
        ]}
      />
    )

    const ackBtn = screen.getByRole('button', { name: '批量确认' })
    const resolveBtn = screen.getByRole('button', { name: '批量解决' })

    expect(ackBtn).toBeInTheDocument()
    expect(resolveBtn).toBeDisabled()

    fireEvent.click(ackBtn)
    expect(onAck).toHaveBeenCalledTimes(1)
  })

  it('showDelete 为 false 时不渲染删除按钮', () => {
    render(
      <FloatingBatchActionBar
        selectedCount={3}
        showDelete={false}
        onSelectCurrentPage={jest.fn()}
        onInvertCurrentPage={jest.fn()}
        onClearSelection={jest.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
  })
})

describe('BatchDeleteConfirmModal 二次确认弹窗', () => {
  it('正确渲染选中文案并在确认时触发回调', () => {
    const onConfirm = jest.fn()
    const onClose = jest.fn()

    render(
      <BatchDeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        count={5}
        isAllFiltered={false}
      />
    )

    expect(screen.getByRole('heading', { level: 3, name: '批量删除确认' })).toBeInTheDocument()
    expect(screen.getByText('您确定要批量删除选中的 5 项记录吗？')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('全选筛选结果模式展示对应的文案', () => {
    render(
      <BatchDeleteConfirmModal
        isOpen={true}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        count={88}
        isAllFiltered={true}
      />
    )

    expect(screen.getByText('您确定要删除当前筛选结果中的全部 88 项记录吗？')).toBeInTheDocument()
  })
})
