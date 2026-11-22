import { buildSanitizedDiagnosticSummary } from '@/features/monitoring/components/hosts/hostDisplayHelpers'
import type { HostDetailResponse } from '@/features/monitoring/types/zabbix-monitoring.types'

describe('buildSanitizedDiagnosticSummary SNMP 候选与 56813 映射摘要', () => {
  it('输出脱敏的 SNMP 识别、56813 企业前缀重映射与异常/慢候选耗时', () => {
    const detail: HostDetailResponse = {
      device: {
        id: 5736,
        name: 'FM-S5736-Core',
        ip_address: '10.10.10.2',
        device_type: 'switch',
        vendor: 'huawei',
        model: 'S5736-S24T4XC',
        status: 'online',
        is_monitored: true,
        is_pinned: false,
        in_maintenance: false,
        cpu_usage: 12.5,
        memory_usage: 41.0,
        temperature: 39.0,
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
          last_duration_ms: 420,
        },
        interfaces_up: 20,
        interfaces_total: 28,
        hardware_fault_count: 0,
        sparkline: [],
      },
      topology_role: 'access',
      interfaces: [],
      snmp_extensions: {
        device_id: 5736,
        bgp_peers: [],
        optical_transceivers: [],
        components: [],
        disks: [],
        diagnostics: {
          input_vendor: 'other',
          effective_vendor: 'huawei',
          sys_object_id: '1.3.6.1.4.1.56813.2.23.811',
          canonical_prefix: '1.3.6.1.4.1.2011',
          active_prefix: '1.3.6.1.4.1.56813',
          enterprise_mapped: true,
          total_elapsed_ms: 420,
          candidates: [
            {
              category: 'cpu',
              candidate_id: 'huawei_entity_cpu',
              method: 'bulkwalk',
              oid: '1.3.6.1.4.1.56813.5.25.31.1.1.1.1.5',
              status: 'hit',
              rows: 1,
              elapsed_ms: 45,
            },
            {
              category: 'components',
              candidate_id: 'hw_entity_power_state',
              method: 'bulkwalk',
              oid: '1.3.6.1.4.1.56813.5.25.31.1.1.18.1.6',
              status: 'empty',
              rows: 0,
              elapsed_ms: 610,
            },
          ],
        },
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
    }

    const summary = buildSanitizedDiagnosticSummary(detail)
    expect(summary).toContain('SNMP 识别：厂商=huawei | sysObjectID=1.3.6.1.4.1.56813.2.23.811 | 企业前缀重映射=1.3.6.1.4.1.2011->1.3.6.1.4.1.56813 | 耗时=420ms')
    expect(summary).toContain('[components] hw_entity_power_state (1.3.6.1.4.1.56813.5.25.31.1.1.18.1.6): empty, rows=0, 610ms')
    expect(summary).not.toContain('community')
  })
})
