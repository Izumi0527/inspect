'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getAdhocGraphs, getLatestData } from '../api/monitoring-hosts.api'
import { useMonitoringDevices } from './useMonitoringDevices'
import type {
  AdhocGraphResponse,
  AdhocSeriesSpec,
  LatestDataItem,
  LatestDataPageResponse,
} from '../types/zabbix-monitoring.types'

export const MAX_COMPARISON_SERIES = 6

export interface SelectedMetricSeries extends AdhocSeriesSpec {
  id: string
  label: string
}

export function buildMetricSelectionId(
  deviceId: number,
  metricName: string,
  interfaceName?: string
): string {
  return `${deviceId}:${metricName}:${interfaceName ?? ''}`
}

export interface UseLatestDataOptions {
  activeGroupId: number | null
  selectedDeviceIds: number[]
}

export function useLatestData({
  activeGroupId,
  selectedDeviceIds,
}: UseLatestDataOptions) {
  const [deviceFilterId, setDeviceFilterId] = useState<number | null>(null)
  const [applicationTag, setApplicationTag] = useState('')
  const [search, setSearch] = useState('')
  const [onlyAbnormalOrChanged, setOnlyAbnormalOrChanged] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [timeRange, setTimeRange] = useState('1h')
  const [selectedSeries, setSelectedSeries] = useState<SelectedMetricSeries[]>([])
  const selectedSeriesRef = useRef<SelectedMetricSeries[]>([])
  const [limitNotice, setLimitNotice] = useState('')

  useEffect(() => {
    setPage(1)
  }, [activeGroupId, selectedDeviceIds])

  const devicesQuery = useMonitoringDevices()
  const effectiveDeviceIds = useMemo(() => {
    if (deviceFilterId !== null && deviceFilterId > 0) return [deviceFilterId]
    return selectedDeviceIds
  }, [deviceFilterId, selectedDeviceIds])

  const latestQuery = useQuery<LatestDataPageResponse, Error>({
    queryKey: [
      'monitoring-latest-data',
      {
        deviceIds: effectiveDeviceIds,
        groupId: activeGroupId,
        applicationTag,
        search: search.trim(),
        onlyAbnormalOrChanged,
        page,
        pageSize,
      },
    ],
    queryFn: () =>
      getLatestData({
        device_ids: effectiveDeviceIds.length > 0 ? effectiveDeviceIds : undefined,
        group_id: activeGroupId && activeGroupId > 0 ? activeGroupId : undefined,
        application_tag: applicationTag || undefined,
        search: search.trim() || undefined,
        abnormal_only: onlyAbnormalOrChanged || undefined,
        changed_only: onlyAbnormalOrChanged || undefined,
        page,
        page_size: pageSize,
      }),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    retry: 1,
  })

  const adhocQuery = useQuery<AdhocGraphResponse, Error>({
    queryKey: [
      'monitoring-adhoc-graph',
      timeRange,
      selectedSeries.map((s) => s.id),
    ],
    queryFn: () =>
      getAdhocGraphs({
        series: selectedSeries.map(({ device_id, metric_name, interface_name }) => ({
          device_id,
          metric_name,
          interface_name: interface_name || undefined,
        })),
        time_range: timeRange,
      }),
    enabled: selectedSeries.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
  })

  const toggleSeries = useCallback((item: LatestDataItem) => {
    const id = buildMetricSelectionId(
      item.device_id,
      item.metric_name,
      item.interface_name
    )
    const current = selectedSeriesRef.current
    if (current.some((s) => s.id === id)) {
      const next = current.filter((s) => s.id !== id)
      selectedSeriesRef.current = next
      setSelectedSeries(next)
      setLimitNotice('')
      return
    }
    if (current.length >= MAX_COMPARISON_SERIES) {
      const msg = `最多支持同时对比 ${MAX_COMPARISON_SERIES} 条指标序列，请先取消已选指标`
      setLimitNotice(msg)
      toast.error(msg)
      return
    }
    const ifacePart = item.interface_name ? ` (${item.interface_name})` : ''
    const next: SelectedMetricSeries[] = [
      ...current,
      {
        id,
        device_id: item.device_id,
        metric_name: item.metric_name,
        interface_name: item.interface_name || undefined,
        label: `${item.device_name} · ${item.metric_label}${ifacePart}`,
      },
    ]
    selectedSeriesRef.current = next
    setSelectedSeries(next)
    setLimitNotice('')
  }, [])

  const removeSeries = useCallback((id: string) => {
    const next = selectedSeriesRef.current.filter((s) => s.id !== id)
    selectedSeriesRef.current = next
    setSelectedSeries(next)
    setLimitNotice('')
  }, [])

  const clearSeries = useCallback(() => {
    selectedSeriesRef.current = []
    setSelectedSeries([])
    setLimitNotice('')
  }, [])

  const hasNarrowingFilter =
    effectiveDeviceIds.length > 0 ||
    (activeGroupId !== null && activeGroupId > 0) ||
    search.trim().length > 0 ||
    applicationTag !== ''

  return {
    devices: devicesQuery.data ?? [],
    latestQuery,
    adhocQuery,
    deviceFilterId,
    setDeviceFilterId: (id: number | null) => {
      setDeviceFilterId(id)
      setPage(1)
    },
    applicationTag,
    setApplicationTag: (tag: string) => {
      setApplicationTag(tag)
      setPage(1)
    },
    search,
    setSearch: (q: string) => {
      setSearch(q)
      setPage(1)
    },
    onlyAbnormalOrChanged,
    setOnlyAbnormalOrChanged: (val: boolean) => {
      setOnlyAbnormalOrChanged(val)
      setPage(1)
    },
    page,
    setPage,
    pageSize,
    setPageSize: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
    timeRange,
    setTimeRange,
    selectedSeries,
    toggleSeries,
    removeSeries,
    clearSeries,
    limitNotice,
    hasNarrowingFilter,
  }
}
