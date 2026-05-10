import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/atoms'
import type { ComponentType } from 'react'

type DocEntry = {
  title: string
  description: string
  href: string
  icon: ComponentType<{ className?: string }>
}

const quickLinks: DocEntry[] = [
  {
    title: '项目详细架构',
    description: '系统架构、模块边界、数据流、部署与扩展规范',
    href: '/docs/PROJECT_ARCHITECTURE.md',
    icon: BookOpen,
  },
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-muted/40 dark:bg-background">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">文档中心</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              本页面用于浏览仓库内 `docs/PROJECT_ARCHITECTURE.md` 项目详细架构文档。
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" className="cursor-pointer">
              返回首页
            </Button>
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {quickLinks.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className="block">
                <Card className="h-full border-border/50 bg-card/80 shadow-sm transition hover:shadow-md dark:border-border dark:bg-card/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
                        <Icon className="h-4 w-4 text-primary" />
                      </span>
                      {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        <div className="mt-8 rounded-xl border border-border/60 bg-card/60 p-5 text-sm text-muted-foreground dark:border-border dark:bg-card/60">
          <p className="font-semibold text-foreground">提示</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>文档以 Markdown 形式展示，便于复制与检索。</li>
            <li>如遇链接缺失或内容过期，优先以代码与接口返回为准，并同步更新文档。</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
