import type { AuditAction } from '../../types/audit.types'

export const actionLabels: Record<AuditAction, string> = {
  login: '登录',
  logout: '登出',
  create: '创建',
  update: '更新',
  delete: '删除',
  export: '导出',
  import: '导入',
  config_change: '配置变更',
}
