import * as React from 'react'
import { cn } from '@/utils/cn'

/**
 * 状态轨（Status Rail）与状态点 —— 本设计的唯一「大胆之处」。
 *
 * 形状优先编码状态，颜色只是第三通道（第二通道是图标/文字）：
 *   实线 3px  = danger   故障 / 严重 / 离线 / 失败
 *   虚线 3px  = warning  警告 / 待处理 / 需关注
 *   发丝 1px  = success  正常 / 在线 / 已完成
 *   发丝 1px  = info     信息 / 进行中（与 success 靠图标与文字区分）
 *   无轨      = unknown  未知 / 停用 / 未评估
 *
 * 四个场景贯穿：表格行缘、事件行缘、面板头、统计卡读数区。
 */
export type StatusTone = 'danger' | 'warning' | 'success' | 'info' | 'unknown'

const railClass: Record<StatusTone, string> = {
  danger: 'border-l-[3px] border-solid border-danger',
  warning: 'border-l-[3px] border-dashed border-warning',
  success: 'border-l border-solid border-success',
  info: 'border-l border-solid border-info',
  unknown: 'border-l border-transparent',
}

const dotClass: Record<StatusTone, string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
  info: 'bg-info',
  unknown: 'bg-unknown',
}

export interface StatusRailProps extends React.HTMLAttributes<HTMLDivElement> {
  tone: StatusTone
}

/** 行缘/区块缘的状态轨；高度随父容器（self-stretch）。仅装饰，语义靠图标与文字承担。 */
export const StatusRail: React.FC<StatusRailProps> = ({ tone, className, ...props }) => (
  <div
    aria-hidden="true"
    className={cn('shrink-0 self-stretch', railClass[tone], className)}
    {...props}
  />
)

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone
}

/** 内联状态点（8px）；必须与文字或图标同时出现，不得单独承载语义。 */
export const StatusDot: React.FC<StatusDotProps> = ({ tone, className, ...props }) => (
  <span
    aria-hidden="true"
    className={cn('inline-block h-2 w-2 shrink-0 rounded-full', dotClass[tone], className)}
    {...props}
  />
)
