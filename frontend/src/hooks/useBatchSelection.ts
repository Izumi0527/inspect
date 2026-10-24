import { useState, useCallback, useMemo, useEffect, useRef } from 'react'

export type BatchSelectionMode = 'explicit' | 'all_filtered'

export interface UseBatchSelectionOptions<T, K extends string | number = string> {
  items: T[]
  totalCount?: number
  getId?: keyof T | ((item: T) => K)
  isSelectable?: (item: T) => boolean
  getDisabledReason?: (item: T) => string | undefined
  filterDeps?: ReadonlyArray<unknown>
  pageDeps?: ReadonlyArray<unknown>
}

export interface UseBatchSelectionReturn<T, K extends string | number = string> {
  selectionMode: BatchSelectionMode
  selectedIds: K[]
  excludedIds: K[]
  selectedCount: number
  isAllCurrentPageSelected: boolean
  toggleSelect: (id: K) => void
  selectCurrentPage: () => void
  selectAllFiltered: () => void
  invertCurrentPage: () => void
  clearSelection: () => void
  rowSelection: {
    selectedRowKeys: K[]
    onChange: (selectedRowKeys: (string | number)[], selectedRows: T[]) => void
    getCheckboxProps: (record: T) => { disabled: boolean; title?: string }
  }
}

export function useBatchSelection<T extends object, K extends string | number = string>({
  items,
  totalCount,
  getId,
  isSelectable,
  getDisabledReason,
  filterDeps,
  pageDeps,
}: UseBatchSelectionOptions<T, K>): UseBatchSelectionReturn<T, K> {
  const [selectionMode, setSelectionMode] = useState<BatchSelectionMode>('explicit')
  const [selectedIds, setSelectedIds] = useState<K[]>([])
  const [excludedIds, setExcludedIds] = useState<K[]>([])

  const getItemKey = useCallback((item: T, index: number): K => {
    if (!getId) {
      return ((item as { id?: K }).id ?? (index as unknown as K))
    }
    if (typeof getId === 'function') {
      return getId(item)
    }
    return (item as Record<keyof T, unknown>)[getId] as K
  }, [getId])

  const isItemSelectable = useCallback((item: T): boolean => {
    return isSelectable ? isSelectable(item) : true
  }, [isSelectable])

  const currentPageItemsWithKeys = useMemo(() => {
    return items.map((item, index) => ({
      item,
      key: getItemKey(item, index),
      selectable: isItemSelectable(item),
      disabledReason: getDisabledReason?.(item),
    }))
  }, [items, getItemKey, isItemSelectable, getDisabledReason])

  const selectablePageItems = useMemo(
    () => currentPageItemsWithKeys.filter(x => x.selectable),
    [currentPageItemsWithKeys]
  )

  const selectablePageKeys = useMemo(
    () => selectablePageItems.map(x => x.key),
    [selectablePageItems]
  )

  const clearSelection = useCallback(() => {
    setSelectionMode('explicit')
    setSelectedIds([])
    setExcludedIds([])
  }, [])

  const toggleSelect = useCallback((id: K) => {
    if (selectionMode === 'all_filtered') {
      setExcludedIds(prev => {
        const exists = prev.includes(id)
        return exists ? prev.filter(x => x !== id) : [...prev, id]
      })
    } else {
      setSelectedIds(prev => {
        const exists = prev.includes(id)
        return exists ? prev.filter(x => x !== id) : [...prev, id]
      })
    }
  }, [selectionMode])

  const selectCurrentPage = useCallback(() => {
    setSelectionMode('explicit')
    setExcludedIds([])
    setSelectedIds([...selectablePageKeys])
  }, [selectablePageKeys])

  const selectAllFiltered = useCallback(() => {
    setSelectionMode('all_filtered')
    setExcludedIds([])
    setSelectedIds([...selectablePageKeys])
  }, [selectablePageKeys])

  const invertCurrentPage = useCallback(() => {
    if (selectionMode === 'all_filtered') {
      const total = totalCount ?? items.length
      if (total <= items.length) {
        // 只有当前一页，退回 explicit 模式并反转当前页已选
        setSelectionMode('explicit')
        const newSelected = selectablePageKeys.filter(id => excludedIds.includes(id))
        setSelectedIds(newSelected)
        setExcludedIds([])
      } else {
        // 多页场景：在 all_filtered 模式下对当前页可选项反转 excludedIds 归属
        setExcludedIds(prev => {
          const prevSet = new Set(prev)
          const next = new Set(prev)
          for (const id of selectablePageKeys) {
            if (prevSet.has(id)) {
              next.delete(id)
            } else {
              next.add(id)
            }
          }
          return Array.from(next)
        })
      }
    } else {
      // explicit 模式
      setSelectedIds(prev => {
        const prevSet = new Set(prev)
        return selectablePageKeys.filter(id => !prevSet.has(id))
      })
    }
  }, [selectionMode, totalCount, items.length, selectablePageKeys, excludedIds])

  const selectedCount = useMemo(() => {
    if (selectionMode === 'explicit') {
      return selectedIds.length
    }
    const total = totalCount ?? items.length
    const nonSelectableCurrentPageCount = items.length - selectablePageKeys.length
    const count = total - nonSelectableCurrentPageCount - excludedIds.length
    return Math.max(0, count)
  }, [selectionMode, selectedIds.length, totalCount, items.length, selectablePageKeys.length, excludedIds.length])

  // 当 all_filtered 模式下选中的数量降为 0 时自动重置
  useEffect(() => {
    if (selectionMode === 'all_filtered' && selectedCount <= 0) {
      clearSelection()
    }
  }, [selectionMode, selectedCount, clearSelection])

  const isAllCurrentPageSelected = useMemo(() => {
    if (selectablePageKeys.length === 0) return false
    if (selectionMode === 'explicit') {
      const selectedSet = new Set(selectedIds)
      return selectablePageKeys.every(id => selectedSet.has(id))
    }
    const excludedSet = new Set(excludedIds)
    return selectablePageKeys.every(id => !excludedSet.has(id))
  }, [selectablePageKeys, selectionMode, selectedIds, excludedIds])

  const currentSelectedRowKeys = useMemo<K[]>(() => {
    if (selectionMode === 'explicit') {
      return selectedIds
    }
    const excludedSet = new Set(excludedIds)
    return selectablePageKeys.filter(id => !excludedSet.has(id))
  }, [selectionMode, selectedIds, excludedIds, selectablePageKeys])

  const onRowSelectionChange = useCallback((newSelectedRowKeys: (string | number)[]) => {
    const keySet = new Set(newSelectedRowKeys as K[])
    if (selectionMode === 'all_filtered') {
      setExcludedIds(prev => {
        const next = new Set(prev)
        for (const id of selectablePageKeys) {
          if (keySet.has(id)) {
            next.delete(id)
          } else {
            next.add(id)
          }
        }
        return Array.from(next)
      })
    } else {
      setSelectedIds(Array.from(keySet))
    }
  }, [selectionMode, selectablePageKeys])

  const getCheckboxProps = useCallback((record: T) => {
    const selectable = isItemSelectable(record)
    return {
      disabled: !selectable,
      title: !selectable ? getDisabledReason?.(record) : undefined,
    }
  }, [isItemSelectable, getDisabledReason])

  const rowSelection = useMemo(() => ({
    selectedRowKeys: currentSelectedRowKeys,
    onChange: onRowSelectionChange,
    getCheckboxProps,
  }), [currentSelectedRowKeys, onRowSelectionChange, getCheckboxProps])

  // 筛选依赖变化时清空选择
  const isFilterFirstRender = useRef(true)
  useEffect(() => {
    if (isFilterFirstRender.current) {
      isFilterFirstRender.current = false
      return
    }
    clearSelection()
  }, filterDeps ?? [])

  // 翻页依赖变化时
  const isPageFirstRender = useRef(true)
  useEffect(() => {
    if (isPageFirstRender.current) {
      isPageFirstRender.current = false
      return
    }
    if (selectionMode === 'explicit') {
      clearSelection()
    }
  }, pageDeps ?? [])

  return {
    selectionMode,
    selectedIds,
    excludedIds,
    selectedCount,
    isAllCurrentPageSelected,
    toggleSelect,
    selectCurrentPage,
    selectAllFiltered,
    invertCurrentPage,
    clearSelection,
    rowSelection,
  }
}
