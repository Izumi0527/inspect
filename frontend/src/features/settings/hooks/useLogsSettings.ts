'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { logsSettingsApi } from '../api/logs.api'
import type { SyslogProtocol, SyslogSettings } from '../api/logs.api'

export function useLogsSettings() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['logsSettings'],
    queryFn: logsSettingsApi.getLogsSettings,
    staleTime: 5 * 60 * 1000,
  })

  const [retentionDays, setRetentionDays] = useState<number>(90)
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState<boolean>(true)
  const [syslogEnabled, setSyslogEnabled] = useState<boolean>(false)
  const [syslogProtocol, setSyslogProtocol] = useState<SyslogProtocol>('both')
  const [syslogHost, setSyslogHost] = useState<string>('0.0.0.0')
  const [syslogPort, setSyslogPort] = useState<number>(5514)
  const [syslogMaxMessageBytes, setSyslogMaxMessageBytes] = useState<number>(8192)
  const [syslogAlertsEnabled, setSyslogAlertsEnabled] = useState<boolean>(true)
  const [syslogAlertsMaxNewPerMinute, setSyslogAlertsMaxNewPerMinute] = useState<number>(30)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!data) return
    setRetentionDays(data.retentionDays)
    setAutoCleanupEnabled(data.autoCleanupEnabled)
    setSyslogEnabled(data.syslog.enabled)
    setSyslogProtocol(data.syslog.protocol)
    setSyslogHost(data.syslog.host)
    setSyslogPort(data.syslog.port)
    setSyslogMaxMessageBytes(data.syslog.maxMessageBytes)
    setSyslogAlertsEnabled(data.syslog.alertsEnabled)
    setSyslogAlertsMaxNewPerMinute(data.syslog.alertsMaxNewPerMinute)
    setIsDirty(false)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: logsSettingsApi.saveLogsSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logsSettings'] })
      setIsDirty(false)
    },
  })

  const updateRetentionDays = useCallback((value: number) => {
    setRetentionDays(value)
    setIsDirty(true)
  }, [])

  const updateAutoCleanupEnabled = useCallback((value: boolean) => {
    setAutoCleanupEnabled(value)
    setIsDirty(true)
  }, [])

  const updateSyslogEnabled = useCallback((value: boolean) => {
    setSyslogEnabled(value)
    setIsDirty(true)
  }, [])

  const updateSyslogProtocol = useCallback((value: SyslogProtocol) => {
    setSyslogProtocol(value)
    setIsDirty(true)
  }, [])

  const updateSyslogHost = useCallback((value: string) => {
    setSyslogHost(value)
    setIsDirty(true)
  }, [])

  const updateSyslogPort = useCallback((value: number) => {
    setSyslogPort(value)
    setIsDirty(true)
  }, [])

  const updateSyslogMaxMessageBytes = useCallback((value: number) => {
    setSyslogMaxMessageBytes(value)
    setIsDirty(true)
  }, [])

  const updateSyslogAlertsEnabled = useCallback((value: boolean) => {
    setSyslogAlertsEnabled(value)
    setIsDirty(true)
  }, [])

  const updateSyslogAlertsMaxNewPerMinute = useCallback((value: number) => {
    setSyslogAlertsMaxNewPerMinute(value)
    setIsDirty(true)
  }, [])

  const saveAll = useCallback(
    async (
      overrides?: Partial<{
        retentionDays: number
        autoCleanupEnabled: boolean
        syslog: Partial<SyslogSettings>
      }>
    ) => {
      const syslog: SyslogSettings = {
        enabled: overrides?.syslog?.enabled ?? syslogEnabled,
        protocol: overrides?.syslog?.protocol ?? syslogProtocol,
        host: overrides?.syslog?.host ?? syslogHost,
        port: overrides?.syslog?.port ?? syslogPort,
        maxMessageBytes: overrides?.syslog?.maxMessageBytes ?? syslogMaxMessageBytes,
        alertsEnabled: overrides?.syslog?.alertsEnabled ?? syslogAlertsEnabled,
        alertsMaxNewPerMinute: overrides?.syslog?.alertsMaxNewPerMinute ?? syslogAlertsMaxNewPerMinute,
      }
      await saveMutation.mutateAsync({
        retentionDays: overrides?.retentionDays ?? retentionDays,
        autoCleanupEnabled: overrides?.autoCleanupEnabled ?? autoCleanupEnabled,
        syslog,
      })
    },
    [
      saveMutation,
      retentionDays,
      autoCleanupEnabled,
      syslogEnabled,
      syslogProtocol,
      syslogHost,
      syslogPort,
      syslogMaxMessageBytes,
      syslogAlertsEnabled,
      syslogAlertsMaxNewPerMinute,
    ]
  )

  const resetAll = useCallback(() => {
    if (!data) return
    setRetentionDays(data.retentionDays)
    setAutoCleanupEnabled(data.autoCleanupEnabled)
    setSyslogEnabled(data.syslog.enabled)
    setSyslogProtocol(data.syslog.protocol)
    setSyslogHost(data.syslog.host)
    setSyslogPort(data.syslog.port)
    setSyslogMaxMessageBytes(data.syslog.maxMessageBytes)
    setSyslogAlertsEnabled(data.syslog.alertsEnabled)
    setSyslogAlertsMaxNewPerMinute(data.syslog.alertsMaxNewPerMinute)
    setIsDirty(false)
  }, [data])

  return {
    retentionDays,
    autoCleanupEnabled,
    syslogEnabled,
    syslogProtocol,
    syslogHost,
    syslogPort,
    syslogMaxMessageBytes,
    syslogAlertsEnabled,
    syslogAlertsMaxNewPerMinute,
    isLoading,
    error,
    isDirty,
    isSaving: saveMutation.isPending,
    updateRetentionDays,
    updateAutoCleanupEnabled,
    updateSyslogEnabled,
    updateSyslogProtocol,
    updateSyslogHost,
    updateSyslogPort,
    updateSyslogMaxMessageBytes,
    updateSyslogAlertsEnabled,
    updateSyslogAlertsMaxNewPerMinute,
    saveAll,
    resetAll,
  }
}
