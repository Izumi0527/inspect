import { api, ApiClientError } from '@/lib/api-client'
import type {
  AdhocGraphRequest,
  AdhocGraphResponse,
  CollectDeviceMetricsResult,
  EngineHealthSnapshot,
  HostDetailResponse,
  HostsMatrixQueryParams,
  HostsMatrixResponse,
  LatestDataPageResponse,
  LatestDataQueryParams,
  PinnedDevicesResponse,
  TopNMetric,
  TopNResponse,
} from '../types/zabbix-monitoring.types'

export interface PinActionResponse {
  success: boolean
  device_id: number
  pinned: boolean
}

export interface BatchPinActionResponse {
  success: boolean
  affected: number
}

export class CollectCooldownError extends ApiClientError {
  public readonly retryAfterSeconds: number

  constructor(message: string, retryAfterSeconds: number, detail?: unknown) {
    super({
      message,
      type: 'cooldown_active',
      status: 429,
      detail,
    })
    this.name = 'CollectCooldownError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function unwrapData<T>(payload: unknown): T {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    (payload as { success?: unknown }).success === true &&
    'data' in payload
  ) {
    return (payload as { data: T }).data
  }
  return payload as T
}

function extractRetryAfterSeconds(error: ApiClientError): number {
  if (
    typeof error.detail === 'object' &&
    error.detail !== null &&
    'retry_after_seconds' in error.detail
  ) {
    const raw = Number((error.detail as { retry_after_seconds?: unknown }).retry_after_seconds)
    if (Number.isFinite(raw) && raw > 0) return Math.ceil(raw)
  }
  const match = /(\d+)\s*秒/.exec(error.message)
  if (match) {
    const parsed = Number.parseInt(match[1], 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 10
}

export async function getEngineHealth(): Promise<EngineHealthSnapshot> {
  const payload = await api.get<unknown>('/monitoring/engine-health')
  return unwrapData<EngineHealthSnapshot>(payload)
}

export async function getMonitoringHosts(
  params: HostsMatrixQueryParams = {}
): Promise<HostsMatrixResponse> {
  const query: Record<string, string | number | boolean | undefined> = {
    status: params.status || undefined,
    group_id: params.group_id,
    pinned_only: params.pinned_only ? true : undefined,
    problem_only: params.problem_only ? true : undefined,
    protocol: params.protocol || undefined,
    search: params.search?.trim() || undefined,
    sort_by: params.sort_by || undefined,
    sort_order: params.sort_order || undefined,
    page: params.page,
    page_size: params.page_size,
  }
  const payload = await api.get<unknown>('/monitoring/hosts', { params: query })
  return unwrapData<HostsMatrixResponse>(payload)
}

export async function getMonitoringHostDetail(deviceId: number): Promise<HostDetailResponse> {
  const payload = await api.get<unknown>(`/monitoring/hosts/${deviceId}/detail`)
  return unwrapData<HostDetailResponse>(payload)
}

export async function getMonitoringPins(): Promise<PinnedDevicesResponse> {
  const payload = await api.get<unknown>('/monitoring/pins')
  return unwrapData<PinnedDevicesResponse>(payload)
}

export async function pinMonitoringDevice(deviceId: number): Promise<PinActionResponse> {
  const payload = await api.post<unknown>(`/monitoring/pins/${deviceId}`)
  return unwrapData<PinActionResponse>(payload)
}

export async function unpinMonitoringDevice(deviceId: number): Promise<PinActionResponse> {
  const payload = await api.delete<unknown>(`/monitoring/pins/${deviceId}`)
  return unwrapData<PinActionResponse>(payload)
}

export async function batchPinMonitoringDevices(
  action: 'pin' | 'unpin',
  deviceIds: number[]
): Promise<BatchPinActionResponse> {
  const payload = await api.post<unknown>('/monitoring/pins/batch', {
    action,
    device_ids: deviceIds,
  })
  return unwrapData<BatchPinActionResponse>(payload)
}

export const MONITORING_TOPN_QUERY_KEY = 'monitoring-topn'

export async function getMonitoringTopN(
  metric: TopNMetric,
  limit = 5,
  groupId?: number | null,
  deviceIds?: number[]
): Promise<TopNResponse> {
  const params: Record<string, string | number | undefined> = {
    metric,
    limit,
    group_id: groupId && groupId > 0 ? groupId : undefined,
    device_ids: deviceIds && deviceIds.length > 0 ? deviceIds.join(',') : undefined,
  }
  const payload = await api.get<unknown>('/monitoring/topn', { params })
  return unwrapData<TopNResponse>(payload)
}

export async function getLatestData(
  params: LatestDataQueryParams = {}
): Promise<LatestDataPageResponse> {
  const query: Record<string, string | number | boolean | undefined> = {
    device_ids:
      params.device_ids && params.device_ids.length > 0
        ? params.device_ids.join(',')
        : undefined,
    group_id: params.group_id && params.group_id > 0 ? params.group_id : undefined,
    application_tag: params.application_tag?.trim() || undefined,
    search: params.search?.trim() || undefined,
    changed_only: params.changed_only ? true : undefined,
    abnormal_only: params.abnormal_only ? true : undefined,
    page: params.page,
    page_size: params.page_size,
  }
  const payload = await api.get<unknown>('/monitoring/latest-data', { params: query })
  return unwrapData<LatestDataPageResponse>(payload)
}

export async function getAdhocGraphs(req: AdhocGraphRequest): Promise<AdhocGraphResponse> {
  const payload = await api.post<unknown>('/monitoring/graphs/adhoc', req)
  return unwrapData<AdhocGraphResponse>(payload)
}

export const DEVICE_COLLECT_NOW_TIMEOUT_MS = 60_000

export async function triggerDeviceCollectNow(
  deviceId: number
): Promise<CollectDeviceMetricsResult> {
  try {
    const payload = await api.post<unknown>(`/devices/${deviceId}/collect-metrics`, undefined, {
      timeout: DEVICE_COLLECT_NOW_TIMEOUT_MS,
    })
    return unwrapData<CollectDeviceMetricsResult>(payload)
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 429) {
      const retryAfterSeconds = extractRetryAfterSeconds(error)
      throw new CollectCooldownError(
        error.message || `采集冷却中，请 ${retryAfterSeconds} 秒后再试`,
        retryAfterSeconds,
        error.detail
      )
    }
    throw error
  }
}
