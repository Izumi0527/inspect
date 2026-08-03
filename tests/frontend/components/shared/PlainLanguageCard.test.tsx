/**
 * 人话解读卡片测试
 *
 * 重点验证「告警标识」区块的渲染条件与内容取舍。
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { PlainLanguageCard } from '@/components/shared'
import type { PlainLanguageResult } from '@/lib/plain-language'

const baseResult: PlainLanguageResult = {
  title: '单板故障',
  summary: '核心交换机 的业务单板离线或功能异常，该单板承载的所有端口与业务将中断。',
  suggestion: '确认单板在位且插接到位；若无硬件操作记录，收集单板日志并联系厂商定位。',
  tone: 'critical',
  matched: true,
  ruleId: 'board-fault',
}

describe('PlainLanguageCard 告警标识区块', () => {
  it('识别出 Trap OID 时应展示节点名与完整 OID', () => {
    const result: PlainLanguageResult = {
      ...baseResult,
      trap: {
        oid: '1.3.6.1.4.1.2011.5.25.219.2.2.3',
        name: 'hwBoardFail',
        label: '单板局部功能失效',
      },
    }

    const { container } = render(<PlainLanguageCard result={result} />)

    expect(screen.getByText('告警标识')).toBeInTheDocument()
    expect(container.textContent).toContain('hwBoardFail')
    expect(container.textContent).toContain('1.3.6.1.4.1.2011.5.25.219.2.2.3')
    expect(container.textContent).toContain('单板局部功能失效')
  })

  it('未识别出 OID 时不应出现告警标识区块', () => {
    render(<PlainLanguageCard result={baseResult} />)

    expect(screen.queryByText('告警标识')).not.toBeInTheDocument()
  })

  it('label 为截断版时，厂商说明应展示完整的 detail', () => {
    const result: PlainLanguageResult = {
      ...baseResult,
      trap: {
        oid: '1.3.6.1.6.3.1.1.5.3',
        name: 'linkDown',
        label: '链路断开',
        detail: '作为代理的SNMP实体已经检测到由于ifOperStatus节点中的其中一条通信链路已经进入Down状态。',
      },
    }

    const { container } = render(<PlainLanguageCard result={result} />)

    expect(container.textContent).toContain('ifOperStatus')
  })

  it('标题与摘要按传入结果渲染，不被 trap 释义顶替', () => {
    const result: PlainLanguageResult = {
      ...baseResult,
      trap: {
        oid: '1.3.6.1.6.3.1.1.5.3',
        name: 'linkDown',
        label: '链路断开',
        detail: '作为代理的SNMP实体已经检测到由于ifOperStatus节点……',
      },
    }

    render(<PlainLanguageCard result={result} />)

    // 卡片只负责渲染，标题/摘要的取舍由 translate 决定
    expect(screen.getByText('单板故障')).toBeInTheDocument()
    expect(
      screen.getByText('核心交换机 的业务单板离线或功能异常，该单板承载的所有端口与业务将中断。'),
    ).toBeInTheDocument()
  })
})
