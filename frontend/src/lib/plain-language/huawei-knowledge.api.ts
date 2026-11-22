/**
 * 华为官方排障知识按需查询客户端（仅详情弹窗按需调用，内置有界缓存与静默降级）。
 */

import { api } from '@/lib/api-client'

export interface HuaweiKnowledgeParam {
  name: string
  meaning: string
}

export interface HuaweiAlarmKnowledge {
  oid: string
  module: string
  alarm_name: string
  sub_id?: string
  alarm_id?: string
  severity?: string
  alarm_type?: string
  trap_template?: string
  meaning: string
  parameters?: HuaweiKnowledgeParam[]
  impact?: string
  causes?: string[]
  procedures?: string[]
  reference?: string
  variant_count?: number
}

export interface HuaweiLogKnowledge {
  module: string
  severity: number
  mnemonic: string
  template?: string
  meaning: string
  parameters?: HuaweiKnowledgeParam[]
  causes?: string[]
  procedures?: string[]
}

export interface HuaweiMIBKnowledge {
  oid: string
  name: string
  mib: string
  data_type?: string
  access?: string
  meaning: string
  impl_spec?: string
  instance_suffix?: string
}

export interface HuaweiKnowledgeLookupResponse {
  matched: boolean
  kind: 'alarm' | 'log' | 'mib' | ''
  alarm?: HuaweiAlarmKnowledge
  log?: HuaweiLogKnowledge
  mib?: HuaweiMIBKnowledge
}

export interface HuaweiKnowledgeLookupParams {
  oid?: string
  module?: string
  mnemonic?: string
  message?: string
  eventId?: string
}

const MAX_CACHE_ENTRIES = 200
const MAX_LOOKUP_MESSAGE_BYTES = 2048
const SIGNAL_PREFIX_CONTEXT_CHARS = 128
const lookupCache = new Map<string, HuaweiKnowledgeLookupResponse>()

const OID_SIGNAL_PATTERN =
  /(?:^|[^\d.])\.?(?:1\.3\.6\.1\.4\.1\.2011\.|1\.0\.8802\.|1\.3\.6\.1\.)\d+(?:\.\d+)*/
const VRP_LOG_HEADER_PATTERN =
  /(?:%%\d{2}[A-Za-z0-9_-]{2,24}\/[0-7]\/[A-Z0-9_-]{2,64}|(?:^|[\s:;])[A-Za-z][A-Za-z0-9_-]{1,23}\/[0-7]\/[A-Z0-9_-]{2,64})/

function utf8CharBytes(codePoint: number): number {
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}

function sliceByUtf8Bytes(input: string, maxBytes: number): string {
  let bytes = 0
  let i = 0
  while (i < input.length) {
    const cp = input.codePointAt(i)
    if (cp === undefined) break
    const charBytes = utf8CharBytes(cp)
    if (bytes + charBytes > maxBytes) break
    bytes += charBytes
    i += cp > 0xffff ? 2 : 1
  }
  return input.slice(0, i).trim()
}

function truncateMessageForKnowledgeLookup(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return ''
  let totalBytes = 0
  for (let i = 0; i < trimmed.length; ) {
    const cp = trimmed.codePointAt(i)
    if (cp === undefined) break
    totalBytes += utf8CharBytes(cp)
    i += cp > 0xffff ? 2 : 1
  }
  if (totalBytes <= MAX_LOOKUP_MESSAGE_BYTES) {
    return trimmed
  }
  const oidMatch = OID_SIGNAL_PATTERN.exec(trimmed)
  const vrpMatch = VRP_LOG_HEADER_PATTERN.exec(trimmed)
  const signalIndex =
    oidMatch && vrpMatch
      ? Math.min(oidMatch.index, vrpMatch.index)
      : (oidMatch?.index ?? vrpMatch?.index ?? 0)
  const start = Math.max(0, signalIndex - SIGNAL_PREFIX_CONTEXT_CHARS)
  return sliceByUtf8Bytes(trimmed.slice(start), MAX_LOOKUP_MESSAGE_BYTES)
}

export function hasHuaweiKnowledgeSignal(text: string): boolean {
  const normalized = String(text ?? '').trim()
  if (!normalized) return false
  return OID_SIGNAL_PATTERN.test(normalized) || VRP_LOG_HEADER_PATTERN.test(normalized)
}

export function clearHuaweiKnowledgeCache(): void {
  lookupCache.clear()
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

function isValidLookupResponse(value: unknown): value is HuaweiKnowledgeLookupResponse {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.matched === 'boolean' && typeof record.kind === 'string'
}

function buildLookupQuery(
  params: HuaweiKnowledgeLookupParams
): Record<string, string> {
  const query: Record<string, string> = {}
  const oid = params.oid?.trim()
  const moduleName = params.module?.trim()
  const mnemonic = params.mnemonic?.trim()
  const message = params.message ? truncateMessageForKnowledgeLookup(params.message) : ''
  const eventId = params.eventId?.trim()

  if (oid) query.oid = oid
  if (moduleName) query.module = moduleName
  if (mnemonic) query.mnemonic = mnemonic
  if (message) query.message = message
  if (eventId) query.event_id = eventId
  return query
}

function setBoundedCache(key: string, value: HuaweiKnowledgeLookupResponse): void {
  if (!lookupCache.has(key) && lookupCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = lookupCache.keys().next().value
    if (oldestKey !== undefined) {
      lookupCache.delete(oldestKey)
    }
  }
  lookupCache.set(key, value)
}

export async function lookupHuaweiKnowledge(
  params: HuaweiKnowledgeLookupParams,
  signal?: AbortSignal
): Promise<HuaweiKnowledgeLookupResponse | null> {
  if (signal?.aborted) return null

  const query = buildLookupQuery(params)
  if (Object.keys(query).length === 0) return null

  const cacheKey = JSON.stringify(query)
  const cached = lookupCache.get(cacheKey)
  if (cached) return cached

  try {
    const raw = await api.get<unknown>('/knowledge/huawei/lookup', {
      params: query,
      signal,
      retry: 0,
    })
    if (signal?.aborted) return null

    const unwrapped = unwrapData<unknown>(raw)
    if (!isValidLookupResponse(unwrapped)) return null

    setBoundedCache(cacheKey, unwrapped)
    return unwrapped
  } catch {
    return null
  }
}
