'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  DEVICE_GROUPS_QUERY_KEY,
  bulkDeviceAction,
  getDeviceGroups,
} from '@/features/devices/api/devices.api'
import {
  batchPinMonitoringDevices,
  getMonitoringHosts,
  pinMonitoringDevice,
  unpinMonitoringDevice,
} from '../api/monitoring-hosts.api'
import { createMonitoringMaintenance } from '../api/monitoring-config.api'
import type {
  HostsMatrixQueryParams,
  HostsMatrixResponse,
  MaintenanceMode,
} from '../types/zabbix-monitoring.types'

export const MONITORING_HOSTS_QUERY_KEY = 'monitoring-hosts'

export interface UseMonitoringHostsOptions {
  activeGroupId: number | null
  initialStatusFilter: string | null
}

export function useMonitoringHosts({
  activeGroupId,
  initialStatusFilter,
}: UseMonitoringHostsOptions) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string>(initialStatusFilter ?? '')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [problemOnly, setProblemOnly] = useState(false)
  const [protocol, setProtocol] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setStatus(initialStatusFilter ?? '')
    setPage(1)
  }, [initialStatusFilter])

  useEffect(() => {
    setPage(1)
  }, [activeGroupId])

  const queryParams: HostsMatrixQueryParams = {
    status: status || undefined,
    group_id: activeGroupId && activeGroupId > 0 ? activeGroupId : undefined,
    pinned_only: pinnedOnly || undefined,
    problem_only: problemOnly || undefined,
    protocol: protocol || undefined,
    search: search.trim() || undefined,
    sort_by: sortBy || undefined,
    sort_order: sortBy ? sortOrder : undefined,
    page,
    page_size: pageSize,
  }

  const hostsQuery = useQuery<HostsMatrixResponse, Error>({
    queryKey: [MONITORING_HOSTS_QUERY_KEY, queryParams],
    queryFn: () => getMonitoringHosts(queryParams),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
  })

  const groupsQuery = useQuery({
    queryKey: DEVICE_GROUPS_QUERY_KEY,
    queryFn: getDeviceGroups,
    staleTime: 60_000,
    retry: 1,
  })

  const invalidateHosts = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [MONITORING_HOSTS_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: ['monitoring-pins'] })
  }, [queryClient])

  const togglePinMutation = useMutation({
    mutationFn: async (args: { deviceId: number; pinned: boolean }) =>
      args.pinned
        ? unpinMonitoringDevice(args.deviceId)
        : pinMonitoringDevice(args.deviceId),
    onSuccess: (res) => {
      toast.success(res.pinned ? '已加入关注清单' : '已取消关注')
      invalidateHosts()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '关注状态更新失败')
    },
  })

  const batchPinMutation = useMutation({
    mutationFn: async (args: { action: 'pin' | 'unpin'; deviceIds: number[] }) =>
      batchPinMonitoringDevices(args.action, args.deviceIds),
    onSuccess: (res, vars) => {
      toast.success(
        vars.action === 'pin'
          ? `已批量关注 ${res.affected} 台设备`
          : `已取消关注 ${res.affected} 台设备`
      )
      invalidateHosts()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '批量关注操作失败')
    },
  })

  const batchGroupMutation = useMutation({
    mutationFn: async (args: { deviceIds: number[]; groupId: number }) =>
      bulkDeviceAction('batch_add_group', {
        device_ids: args.deviceIds,
        group_id: args.groupId,
      }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`已将 ${res.processed_count} 台设备移入分组`)
      } else {
        toast.error(res.message || '批量移入分组失败')
      }
      invalidateHosts()
      void queryClient.invalidateQueries({ queryKey: DEVICE_GROUPS_QUERY_KEY })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '批量移入分组失败')
    },
  })

  const batchMaintMutation = useMutation({
    mutationFn: async (args: {
      name: string
      mode: MaintenanceMode
      durationHours: number
      deviceIds: number[]
    }) => {
      const start = new Date()
      const end = new Date(start.getTime() + args.durationHours * 3_600_000)
      return createMonitoringMaintenance({
        name: args.name,
        mode: args.mode,
        schedule_type: 'once',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        enabled: true,
        device_ids: args.deviceIds,
      })
    },
    onSuccess: () => {
      toast.success('已为所选设备创建计划维护窗口')
      invalidateHosts()
      void queryClient.invalidateQueries({ queryKey: ['monitoring-maintenances'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '创建计划维护失败')
    },
  })

  const handleStatusChange = useCallback((nextStatus: string) => {
    setStatus(nextStatus)
    setPage(1)
  }, [])

  const handleSortChange = useCallback(
    (field: string) => {
      if (!field) {
        setSortBy('')
        setPage(1)
        return
      }
      if (sortBy === field) {
        setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
      } else {
        setSortBy(field)
        setSortOrder(field === 'name' || field === 'ip_address' ? 'asc' : 'desc')
      }
      setPage(1)
    },
    [sortBy]
  )

  return {
    hostsQuery,
    groups: groupsQuery.data ?? [],
    groupsLoading: groupsQuery.isLoading,
    status,
    setStatus: handleStatusChange,
    pinnedOnly,
    setPinnedOnly: (val: boolean) => {
      setPinnedOnly(val)
      setPage(1)
    },
    problemOnly,
    setProblemOnly: (val: boolean) => {
      setProblemOnly(val)
      setPage(1)
    },
    protocol,
    setProtocol: (val: string) => {
      setProtocol(val)
      setPage(1)
    },
    search,
    setSearch: (val: string) => {
      setSearch(val)
      setPage(1)
    },
    sortBy,
    sortOrder,
    setSortBy: handleSortChange,
    setSortOrder,
    page,
    setPage,
    pageSize,
    setPageSize: (nextSize: number) => {
      setPageSize(nextSize)
      setPage(1)
    },
    invalidateHosts,
    togglePin: togglePinMutation.mutate,
    batchPin: batchPinMutation.mutateAsync,
    batchMoveToGroup: batchGroupMutation.mutateAsync,
    batchAddMaintenance: batchMaintMutation.mutateAsync,
    isMutating:
      togglePinMutation.isPending ||
      batchPinMutation.isPending ||
      batchGroupMutation.isPending ||
      batchMaintMutation.isPending,
  }
}
