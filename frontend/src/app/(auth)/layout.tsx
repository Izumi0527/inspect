/**
 * 认证页面布局
 * 为登录、注册等认证相关页面提供统一布局
 */

import { ReactNode } from 'react'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '用户认证 - 网络设备巡检系统',
  description: '企业级网络设备巡检与监控平台用户认证',
}

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      {/* 认证页面不需要额外的布局包装，直接渲染子页面 */}
      {children}
      
      {/* 可以在这里添加认证页面的通用元素，比如背景装饰等 */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        {/* 背景装饰元素 */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-400/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl" />
      </div>
    </div>
  )
}