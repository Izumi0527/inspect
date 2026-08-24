import { Button, Card } from '@/components/atoms'
import { Monitor, Network, Shield, TrendingUp, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { ComponentType } from 'react'

type Feature = {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  iconGradient: string
}

const features: Feature[] = [
  {
    title: '实时监控',
    description: '24/7实时监控设备状态，性能指标可视化展示',
    icon: Monitor,
    iconGradient: 'from-teal-500 to-cyan-600',
  },
  {
    title: '自动巡检',
    description: '智能巡检策略，自动化设备健康检查',
    icon: Network,
    iconGradient: 'from-cyan-500 to-teal-600',
  },
  {
    title: '智能告警',
    description: '多级告警规则，多渠道通知推送',
    icon: Shield,
    iconGradient: 'from-red-500 to-pink-600',
  },
  {
    title: '数据分析',
    description: '详细报表分析，性能趋势预测',
    icon: TrendingUp,
    iconGradient: 'from-green-500 to-emerald-600',
  },
]

export default function HomePage() {
  // html/body 全局 overflow:hidden，落地页自身作为滚动容器，否则超出视口的内容无法滚动查看
  return (
    <div className="h-dvh overflow-y-auto bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 dark:from-[#181818] dark:via-[#1f1f1f] dark:to-[#252526]">
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden px-6 pt-16 pb-24">
          <div className="mx-auto max-w-7xl">
            <div className="text-center">
              <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
                企业级
                <span className="bg-gradient-to-r from-teal-700 via-cyan-700 to-emerald-600 dark:from-teal-400 dark:via-cyan-400 dark:to-emerald-400 bg-clip-text text-transparent ml-3">
                  网络设备
                </span>
                <br />
                巡检系统
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-xl leading-8 text-muted-foreground dark:text-gray-300">
                现代化的网络设备监控与巡检平台，采用苹果风格设计，提供实时监控、智能告警、自动化巡检等功能
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                {/* 渐变加深至 teal-700/cyan-700：原 teal-600/cyan-500 上白字对比度仅 2.43，不满足 WCAG AA */}
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-r from-teal-700 to-cyan-700 hover:from-teal-800 hover:to-cyan-800 text-white text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                >
                  <Link href="/login">
                    立即登录
                    <ArrowRight className="ml-2" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-2 border-border/70 dark:border-gray-700 bg-card/80 backdrop-blur-sm hover:bg-card text-foreground/90 dark:text-gray-200 text-lg font-semibold rounded-xl"
                >
                  <Link href="/docs">查看文档</Link>
                </Button>
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
              {features.map((feature) => {
                const Icon = feature.icon
                return (
                  <Card
                    key={feature.title}
                    className="p-8 text-center backdrop-blur-sm border border-border/40 dark:border-gray-700/50 rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
                  >
                    <div
                      className={`mx-auto w-16 h-16 bg-gradient-to-br ${feature.iconGradient} rounded-2xl flex items-center justify-center mb-6`}
                    >
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground dark:text-gray-300">{feature.description}</p>
                  </Card>
                )
              })}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6">
          <div className="mx-auto max-w-4xl text-center">
            <div className="bg-gradient-to-r from-teal-700 to-cyan-700 rounded-3xl p-12 text-white">
              <h2 className="text-3xl font-bold mb-4">
                准备开始使用了吗？
              </h2>
              <p className="text-xl text-white mb-8">
                立即体验企业级网络设备巡检系统的强大功能
              </p>
              {/* 配色不随主题变化：容器渐变与主题无关，原 bg-card 在暗色下变深导致对比度仅 3.04。
                  primary-foreground 在明暗两套变量下同为 0 0% 98%，兼顾语义 token 约束与恒定浅底 */}
              <Button
                asChild
                size="lg"
                className="bg-primary-foreground text-teal-700 hover:bg-teal-50 text-lg font-semibold rounded-xl shadow-lg"
              >
                <Link href="/login">立即登录体验</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-card/80 backdrop-blur-lg border-t border-border/50 dark:border-gray-700/50">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="text-center">
            <p className="text-muted-foreground dark:text-gray-300">
              © {new Date().getFullYear()} 网络设备巡检系统. 保留所有权利.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
