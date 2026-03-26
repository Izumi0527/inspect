import { Button } from '@/components/atoms'
import { Card } from '@/components/atoms'
import { Monitor, Network, Shield, TrendingUp, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 dark:from-[#181818] dark:via-[#1f1f1f] dark:to-[#252526]">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pt-16 pb-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
              企业级
              <span className="bg-gradient-to-r from-teal-600 via-cyan-500 to-emerald-500 bg-clip-text text-transparent ml-3">
                网络设备
              </span>
              <br />
              巡检系统
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-8 text-muted-foreground dark:text-gray-300">
              现代化的网络设备监控与巡检平台，采用苹果风格设计，提供实时监控、智能告警、自动化巡检等功能
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-teal-600 to-cyan-500 hover:from-teal-700 hover:to-cyan-600 text-white px-8 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                >
                  立即登录
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/docs">
                <Button
                  variant="outline"
                  size="lg"
                  className="border-2 border-border/70 dark:border-gray-700 bg-card/80 backdrop-blur-sm hover:bg-card text-foreground/90 dark:text-gray-200 px-8 py-4 text-lg font-semibold rounded-xl"
                >
                  查看文档
                </Button>
              </Link>
            </div>

            {/* 测试账号提示 */}
            <div className="mt-8 p-4 bg-blue-50/80 dark:bg-blue-900/20 backdrop-blur-sm rounded-xl border border-blue-200 dark:border-blue-700/50">
              <p className="text-sm text-blue-700 dark:text-blue-200 text-center">
                <strong>测试账号：</strong>用户名 <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">admin</code>
                密码 <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">Admin123!</code>
              </p>
            </div>
          </div>
        </div>
        
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-gradient-to-br from-teal-400 to-cyan-400 opacity-20 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-400 to-teal-400 opacity-20 blur-3xl" />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              核心功能特性
            </h2>
            <p className="mt-4 text-lg text-muted-foreground dark:text-gray-300">
              全面的网络设备管理解决方案
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border border-border/40 dark:border-gray-700/50 rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mb-6">
                <Monitor className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">实时监控</h3>
              <p className="text-muted-foreground dark:text-gray-300">
                24/7实时监控设备状态，性能指标可视化展示
              </p>
            </Card>

            <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border border-border/40 dark:border-gray-700/50 rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-2xl flex items-center justify-center mb-6">
                <Network className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">自动巡检</h3>
              <p className="text-muted-foreground dark:text-gray-300">
                智能巡检策略，自动化设备健康检查
              </p>
            </Card>

            <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border border-border/40 dark:border-gray-700/50 rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl flex items-center justify-center mb-6">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">智能告警</h3>
              <p className="text-muted-foreground dark:text-gray-300">
                多级告警规则，多渠道通知推送
              </p>
            </Card>

            <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border border-border/40 dark:border-gray-700/50 rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-6">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">数据分析</h3>
              <p className="text-muted-foreground dark:text-gray-300">
                详细报表分析，性能趋势预测
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <div className="bg-gradient-to-r from-teal-600 to-cyan-500 rounded-3xl p-12 text-white">
            <h2 className="text-3xl font-bold mb-4">
              准备开始使用了吗？
            </h2>
            <p className="text-xl text-blue-100 mb-8">
              立即体验企业级网络设备巡检系统的强大功能
            </p>
            <Link href="/login">
              <Button
                size="lg"
                className="bg-card text-blue-600 hover:bg-blue-50 px-8 py-4 text-lg font-semibold rounded-xl shadow-lg"
              >
                立即登录体验
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card/80 backdrop-blur-lg border-t border-border/50 dark:border-gray-700/50">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="text-center">
            <p className="text-muted-foreground dark:text-gray-300">
              © 2025 网络设备巡检系统. 保留所有权利.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

