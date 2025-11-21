/**
 * 通知中心相关类型定义
 */

/**
 * 通知类型
 */
export type NotificationType = 'alert' | 'system'

/**
 * 通知严重级别
 */
export type NotificationSeverity = 'critical' | 'warning' | 'info' | 'success'

/**
 * 通知分类标签
 */
export type NotificationCategoryKey = 'all' | 'alerts' | 'system'

/**
 * 通知项接口
 */
export interface Notification {
  /** 通知唯一标识 */
  id: string
  /** 通知类型 */
  type: NotificationType
  /** 通知标题 */
  title: string
  /** 通知内容 */
  content: string
  /** 通知时间（ISO格式） */
  timestamp: string
  /** 是否已读 */
  read: boolean
  /** 严重级别（告警类型专用） */
  severity?: NotificationSeverity
  /** 关联链接 */
  link?: string
  /** 关联设备名称 */
  device?: string
}

/**
 * 通知分类配置
 */
export interface NotificationCategory {
  /** 分类键名 */
  key: NotificationCategoryKey
  /** 分类显示标签 */
  label: string
  /** 该分类下的通知数量 */
  count: number
}

/**
 * 通知中心状态
 */
export interface NotificationState {
  /** 通知列表 */
  notifications: Notification[]
  /** 未读数量 */
  unreadCount: number
  /** 是否正在加载 */
  isLoading: boolean
  /** 当前选中的分类 */
  activeCategory: NotificationCategoryKey
}

/**
 * 通知严重级别对应的颜色配置
 */
export const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  critical: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
  success: 'bg-green-500',
}

/**
 * 通知分类配置常量
 */
export const NOTIFICATION_CATEGORIES: Array<{ key: NotificationCategoryKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'alerts', label: '告警' },
  { key: 'system', label: '消息' },
]
