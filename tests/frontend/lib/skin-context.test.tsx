import React from 'react'
import { act, renderHook } from '@testing-library/react'

import { SkinProvider, useSkin, SKIN_STORAGE_KEY } from '@/lib/contexts/skin-context'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SkinProvider>{children}</SkinProvider>
)

describe('SkinProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-skin')
  })

  it('未存储偏好时默认经典皮肤，并把属性补齐到 html', () => {
    const { result } = renderHook(() => useSkin(), { wrapper })

    expect(result.current.skin).toBe('classic')
    expect(document.documentElement.getAttribute('data-skin')).toBe('classic')
  })

  it('按本地存储同步精密仪器皮肤', () => {
    window.localStorage.setItem(SKIN_STORAGE_KEY, 'instrument')

    const { result } = renderHook(() => useSkin(), { wrapper })

    expect(result.current.skin).toBe('instrument')
    expect(document.documentElement.getAttribute('data-skin')).toBe('instrument')
  })

  it('非法存储值回退为经典皮肤', () => {
    window.localStorage.setItem(SKIN_STORAGE_KEY, 'sunset')

    const { result } = renderHook(() => useSkin(), { wrapper })

    expect(result.current.skin).toBe('classic')
  })

  it('切换皮肤时写入本地存储与 html 属性', () => {
    const { result } = renderHook(() => useSkin(), { wrapper })

    act(() => {
      result.current.setSkin('instrument')
    })

    expect(result.current.skin).toBe('instrument')
    expect(window.localStorage.getItem(SKIN_STORAGE_KEY)).toBe('instrument')
    expect(document.documentElement.getAttribute('data-skin')).toBe('instrument')

    act(() => {
      result.current.setSkin('classic')
    })

    expect(window.localStorage.getItem(SKIN_STORAGE_KEY)).toBe('classic')
    expect(document.documentElement.getAttribute('data-skin')).toBe('classic')
  })

  it('响应跨标签页的 storage 事件', () => {
    const { result } = renderHook(() => useSkin(), { wrapper })
    expect(result.current.skin).toBe('classic')

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: SKIN_STORAGE_KEY, newValue: 'instrument' })
      )
    })

    expect(result.current.skin).toBe('instrument')
    expect(document.documentElement.getAttribute('data-skin')).toBe('instrument')
  })
})
