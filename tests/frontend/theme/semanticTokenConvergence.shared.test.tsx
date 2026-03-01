import React from 'react'
import { render, screen } from '@testing-library/react'

import { Input, TextArea } from '@/components/atoms/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/atoms/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/atoms/tabs'
import { LoadingOverlay, PageLoading } from '@/components/atoms/loading'
import { Table } from '@/components/atoms/table'
import {
  LoadingSkeleton,
  CardSkeleton,
  TableSkeleton,
  ChartSkeleton,
} from '@/components/atoms/LoadingSkeleton'
import { Modal, ModalContent, ModalDescription, ModalTitle } from '@/components/atoms/modal'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

describe('共享组件语义化主题收敛', () => {
  it('Input 与 TextArea 应使用语义化颜色 token', () => {
    render(
      <div>
        <Input placeholder="输入关键字" />
        <TextArea placeholder="输入描述" />
      </div>
    )

    const input = screen.getByPlaceholderText('输入关键字')
    const textarea = screen.getByPlaceholderText('输入描述')

    expect(input.className).toContain('border-border/50')
    expect(input.className).toContain('bg-card/80')
    expect(input.className).toContain('text-foreground')
    expect(input.className).not.toContain('border-gray-200/50')
    expect(input.className).not.toContain('bg-white/80')

    expect(textarea.className).toContain('border-border/50')
    expect(textarea.className).toContain('bg-card/80')
    expect(textarea.className).toContain('text-foreground')
    expect(textarea.className).not.toContain('border-gray-200/50')
    expect(textarea.className).not.toContain('bg-white/80')
  })

  it('Select 与 Tabs 应使用语义化颜色 token', () => {
    render(
      <div>
        <Select defaultValue="a">
          <SelectTrigger>
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">选项A</SelectItem>
          </SelectContent>
        </Select>

        <Tabs defaultValue="tab-a">
          <TabsList>
            <TabsTrigger value="tab-a">标签A</TabsTrigger>
            <TabsTrigger value="tab-b">标签B</TabsTrigger>
          </TabsList>
          <TabsContent value="tab-a">内容A</TabsContent>
        </Tabs>
      </div>
    )

    const selectTrigger = screen.getByRole('combobox')
    expect(selectTrigger.className).toContain('border-border/50')
    expect(selectTrigger.className).toContain('bg-card/80')
    expect(selectTrigger.className).toContain('text-foreground')
    expect(selectTrigger.className).not.toContain('border-gray-200/50')

    const tabList = screen.getByRole('tablist')
    expect(tabList.className).toContain('bg-muted/70')
    expect(tabList.className).toContain('border-border/50')
    expect(tabList.className).not.toContain('bg-white/80')

    const activeTab = screen.getByRole('tab', { name: '标签A' })
    expect(activeTab.className).toContain('bg-card')
    expect(activeTab.className).toContain('text-foreground')
    expect(activeTab.className).not.toContain('text-gray-900')
  })

  it('Loading 与 Skeleton 组件应使用语义化颜色 token', () => {
    const { container } = render(
      <div>
        <LoadingOverlay isLoading message="载入中">
          <div>业务内容</div>
        </LoadingOverlay>
        <PageLoading message="页面载入中" />

        <LoadingSkeleton rows={2} />
        <CardSkeleton count={1} />
        <TableSkeleton rows={1} columns={2} />
        <ChartSkeleton />
      </div>
    )

    expect(container.innerHTML).toContain('bg-background/80')
    expect(container.innerHTML).toContain('border-t-primary')
    expect(container.innerHTML).not.toContain('border-t-purple-500')

    const pageMessage = screen.getByText('页面载入中')
    expect(pageMessage.className).toContain('text-muted-foreground')

    expect(container.innerHTML).toContain('bg-card')
    expect(container.innerHTML).toContain('border-border/50')
    expect(container.innerHTML).not.toContain('bg-white rounded-lg shadow')
  })

  it('Modal 内容容器应使用语义化颜色 token', () => {
    render(
      <Modal open>
        <ModalContent>
          <ModalTitle>模态标题</ModalTitle>
          <ModalDescription>模态描述</ModalDescription>
          模态内容
        </ModalContent>
      </Modal>
    )

    const modal = screen.getByText('模态内容').closest('[role="dialog"]') as HTMLElement
    expect(modal.className).toContain('bg-card/95')
    expect(modal.className).toContain('border-border/30')
    expect(modal.className).not.toContain('bg-white/95')
  })

  it('Dialog 内容容器应使用语义化颜色 token', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>对话框标题</DialogTitle>
          <DialogDescription>对话框描述</DialogDescription>
          对话框内容
        </DialogContent>
      </Dialog>
    )

    const dialogContent = screen.getByText('对话框标题').closest('[role="dialog"]') as HTMLElement
    expect(dialogContent.className).toContain('bg-card/95')
    expect(dialogContent.className).toContain('border-border/40')
    expect(dialogContent.className).not.toContain('bg-white')
  })

  it('Table 应使用语义化颜色 token', () => {
    const columns = [{ key: 'name', title: '名称' }]
    const data = [{ name: '设备A' }]

    const { container } = render(
      <Table columns={columns} data={data} />
    )

    expect(container.innerHTML).toContain('bg-card/80')
    expect(container.innerHTML).toContain('border-border/50')
    expect(container.innerHTML).toContain('text-foreground')
    expect(container.innerHTML).toContain('bg-muted/40')
    expect(container.innerHTML).not.toContain('bg-white/80')
    expect(container.innerHTML).not.toContain('text-gray-900')
  })
})
