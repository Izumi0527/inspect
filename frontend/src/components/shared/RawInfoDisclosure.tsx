/**
 * 原始信息折叠组件
 *
 * 用于在人话解读之下收纳设备原文。基于原生 `<details>/<summary>` 实现：
 * 天然支持键盘操作与屏幕阅读器，无需引入额外依赖，也无需自行管理展开状态。
 */
import React from 'react'
import { ChevronRight } from 'lucide-react'

export interface RawInfoDisclosureProps {
  /** 折叠区标题 */
  label?: string
  /**
   * 是否默认展开。
   *
   * 翻译未命中规则时应传 true —— 那种情况下兜底文案信息量很低，
   * 原文才是唯一有效信息，再把它藏起来等于什么都没告诉用户。
   */
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

export const RawInfoDisclosure: React.FC<RawInfoDisclosureProps> = ({
  label = '查看原始信息',
  defaultOpen = false,
  children,
  className = '',
}) => {
  return (
    <details className={`group ${className}`} open={defaultOpen}>
      <summary
        className="
          flex items-center gap-1 cursor-pointer select-none
          text-xs text-muted-foreground hover:text-foreground transition-colors
          list-none [&::-webkit-details-marker]:hidden
        "
      >
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}
