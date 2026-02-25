import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LogCollectionModal } from '@/features/logs/components/LogCollectionModal'
import { fetchDevices } from '@/features/devices/api/devices.api'

jest.mock('@/features/devices/api/devices.api', () => ({
  fetchDevices: jest.fn(),
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('LogCollectionModal', () => {
  it('应支持选择设备并触发批量采集，且渲染失败明细', async () => {
    ;(fetchDevices as jest.Mock).mockResolvedValue({
      devices: [
        { id: 1, name: 'dev-1', ip: '10.0.0.1', device_type: 'switch', status: 'online', location: '', last_seen: '', uptime: '' },
        { id: 2, name: 'dev-2', ip: '10.0.0.2', device_type: 'switch', status: 'online', location: '', last_seen: '', uptime: '' },
      ],
      total: 2,
      page: 1,
      pageSize: 200,
    })

    const onCollectBatch = jest.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      collected_count: 10,
      device_id: 0,
      collected: { 1: 10 },
      failed: { 2: 'ssh credentials not configured' },
    })

    render(
      <LogCollectionModal
        open={true}
        onClose={jest.fn()}
        collecting={false}
        progress={{}}
        onCollectSingle={jest.fn()}
        onCollectBatch={onCollectBatch}
        onAfterCollect={jest.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('dev-1')).toBeInTheDocument()
      expect(screen.getByText('dev-2')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('选择设备-1'))
    fireEvent.click(screen.getByLabelText('选择设备-2'))

    fireEvent.click(screen.getByRole('button', { name: '开始采集' }))

    await waitFor(() => {
      expect(onCollectBatch).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText(/ssh credentials not configured/i)).toBeInTheDocument()
  })
})

