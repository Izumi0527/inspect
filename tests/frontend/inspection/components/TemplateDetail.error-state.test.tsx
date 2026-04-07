import React from 'react'
import { render, screen } from '@testing-library/react'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { TemplateDetail } from '@/features/inspection/components/TemplateDetail'

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionTemplate: jest.fn(),
}))

jest.mock('@/features/inspection/components/CheckItemGroup', () => ({
  CheckItemGroup: () => <div>CheckItemGroup</div>,
}))

describe('TemplateDetail 错误态', () => {
  it('模板详情加载失败时应展示错误态，而不是模板不存在', () => {
    ;(inspectionHooks.useInspectionTemplate as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('模板详情加载失败'),
    })

    render(<TemplateDetail templateId={1} />)

    expect(screen.getByText('错误: 模板详情加载失败')).toBeInTheDocument()
    expect(screen.queryByText('模板不存在')).not.toBeInTheDocument()
  })
})
