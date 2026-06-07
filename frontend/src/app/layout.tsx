import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'
// import { RoutePreloadManager, CriticalResourcePreloader } from '@/components/performance'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: '网络设备巡检系统',
  description: '现代化的企业级网络设备巡检与监控平台',
  keywords: ['网络监控', '设备巡检', '企业级', 'SNMP', '网络管理'],
  authors: [{ name: 'Your Team' }],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/* <CriticalResourcePreloader /> */}
        <Providers>
          {/* <RoutePreloadManager /> */}
          {children}
        </Providers>
      </body>
    </html>
  )
}
