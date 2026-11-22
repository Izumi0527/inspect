/**
 * 人话解读卡片测试
 *
 * 重点验证「告警标识」区块的渲染条件与内容取舍。
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { PlainLanguageCard } from '@/components/shared'
import type {
  HuaweiKnowledgeLookupResponse,
  PlainLanguageResult,
} from '@/lib/plain-language'

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

describe('PlainLanguageCard 华为官方文档参考区块', () => {
  it('未传 knowledge 或 matched=false 时保持向后兼容，不渲染参考区块', () => {
    render(<PlainLanguageCard result={baseResult} knowledge={{ matched: false, kind: '' }} />)
    expect(screen.queryByText('华为官方文档参考')).not.toBeInTheDocument()
  })

  it('kind=alarm 时渲染告警名称、官方解释、参数说明、影响、可能原因与处理建议', () => {
    const knowledge: HuaweiKnowledgeLookupResponse = {
      matched: true,
      kind: 'alarm',
      alarm: {
        oid: '1.3.6.1.4.1.2011.5.25.219.2.14.1',
        module: 'HUAWEI-ENTITY-TRAP-MIB',
        alarm_name: 'hwCPUUtilizationRisingAlarm',
        severity: '重要',
        meaning: '单板 CPU 利用率超过设定阈值。',
        parameters: [{ name: 'hwEntityCpuUsage', meaning: '当前 CPU 占用率' }],
        impact: '可能导致控制平面协议报文处理延迟。',
        causes: ['设备上存在大量协议报文上送 CPU'],
        procedures: ['执行 display cpu-usage 检查各进程占用情况'],
      },
    }

    render(<PlainLanguageCard result={baseResult} knowledge={knowledge} />)

    expect(screen.getByText('华为官方文档参考')).toBeInTheDocument()
    expect(
      screen.getByText(/hwCPUUtilizationRisingAlarm · HUAWEI-ENTITY-TRAP-MIB/)
    ).toBeInTheDocument()
    expect(screen.getByText('单板 CPU 利用率超过设定阈值。')).toBeInTheDocument()
    expect(screen.getByText('hwEntityCpuUsage:')).toBeInTheDocument()
    expect(screen.getByText('当前 CPU 占用率')).toBeInTheDocument()
    expect(screen.getByText(/可能导致控制平面协议报文处理延迟/)).toBeInTheDocument()
    expect(screen.getByText('设备上存在大量协议报文上送 CPU')).toBeInTheDocument()
    expect(screen.getByText('执行 display cpu-usage 检查各进程占用情况')).toBeInTheDocument()
  })

  it('kind=log 时渲染模块/级别/助记符、官方日志含义、参数与排障建议', () => {
    const knowledge: HuaweiKnowledgeLookupResponse = {
      matched: true,
      kind: 'log',
      log: {
        module: 'VOSCPU',
        severity: 4,
        mnemonic: 'CPU_USAGE_HIGH',
        meaning: '系统检测到 CPU 占用率持续高于告警阈值。',
        parameters: [{ name: 'Usage', meaning: '当前 CPU 利用率百分比' }],
        causes: ['存在环路或广播风暴冲击控制平面'],
        procedures: ['检查生成树状态与 CPU-Defend 统计'],
      },
    }

    render(<PlainLanguageCard result={baseResult} knowledge={knowledge} />)

    expect(screen.getByText('华为官方文档参考')).toBeInTheDocument()
    expect(screen.getByText('VOSCPU/4/CPU_USAGE_HIGH')).toBeInTheDocument()
    expect(screen.getByText('系统检测到 CPU 占用率持续高于告警阈值。')).toBeInTheDocument()
    expect(screen.getByText('Usage:')).toBeInTheDocument()
    expect(screen.getByText('存在环路或广播风暴冲击控制平面')).toBeInTheDocument()
    expect(screen.getByText('检查生成树状态与 CPU-Defend 统计')).toBeInTheDocument()
  })

  it('kind=mib 时渲染 MIB 模块、节点名、OID、数据类型、含义与实现规格', () => {
    const knowledge: HuaweiKnowledgeLookupResponse = {
      matched: true,
      kind: 'mib',
      mib: {
        oid: '1.3.6.1.4.1.2011.5.25.31.1.1.2.1.11',
        name: 'hwEntityBoardType',
        mib: 'HUAWEI-ENTITY-EXTENT-MIB',
        data_type: 'DisplayString',
        meaning: '实体单板类型字符串。',
        impl_spec: '电子标签 3.0 设备通过该节点返回设备/单板具体款型。',
      },
    }

    render(<PlainLanguageCard result={baseResult} knowledge={knowledge} />)

    expect(screen.getByText('华为官方文档参考')).toBeInTheDocument()
    expect(
      screen.getByText(
        'HUAWEI-ENTITY-EXTENT-MIB · hwEntityBoardType · 1.3.6.1.4.1.2011.5.25.31.1.1.2.1.11 · DisplayString'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('实体单板类型字符串。')).toBeInTheDocument()
    expect(
      screen.getByText(/电子标签 3.0 设备通过该节点返回设备\/单板具体款型/)
    ).toBeInTheDocument()
  })
})
