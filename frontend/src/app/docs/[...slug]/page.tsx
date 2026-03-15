import fs from 'node:fs/promises'
import path from 'node:path'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FolderOpen, FileText } from 'lucide-react'
import { Card, CardContent, Button } from '@/components/atoms'

type DocRouteParams = {
  slug?: string | string[]
}

async function resolveDocsRoot() {
  const candidates = [
    // Docker / CI：推荐把仓库根目录 docs 挂载到 /app/docs（cwd=/app）
    path.resolve(process.cwd(), 'docs'),
    // 本地仓库：frontend 与 docs 同级（cwd=frontend）
    path.resolve(process.cwd(), '..', 'docs'),
  ]

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isDirectory()) return candidate
    } catch {
      // ignore
    }
  }

  return null
}

function isPathInsideDocsRoot(docsRoot: string, absolutePath: string) {
  const normalizedRoot = path.normalize(docsRoot)
  const normalizedTarget = path.normalize(absolutePath)
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(normalizedRoot + path.sep)
  )
}

function resolveDocAbsolutePath(docsRoot: string, slug: string[]) {
  const relativePath = slug.join('/')
  const absolutePath = path.resolve(docsRoot, relativePath)
  if (!isPathInsideDocsRoot(docsRoot, absolutePath)) {
    return null
  }
  return absolutePath
}

function toDocHref(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return `/docs/${normalized}`
}

function formatRelativePath(slug: string[]) {
  return slug.join('/').replace(/\\/g, '/')
}

export default async function DocViewerPage({ params }: { params: Promise<DocRouteParams> }) {
  const resolvedParams = await params
  const docsRoot = await resolveDocsRoot()
  if (!docsRoot) {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <h1 className="text-2xl font-bold text-foreground">文档不可用</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            当前部署未检测到 `docs/` 目录，无法展示项目文档。
          </p>
          <Card className="mt-6 border-border/60 bg-card/80 dark:border-border dark:bg-card/80">
            <CardContent className="p-5 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">启用方式（推荐）</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  使用 docker-compose 时，将仓库根目录的 <code className="font-mono">./docs</code> 挂载到前端容器
                  <code className="font-mono">/app/docs</code>（只读）。
                </li>
                <li>
                  非容器部署时，确保前端运行目录可访问仓库的 <code className="font-mono">docs/</code> 目录。
                </li>
              </ul>
              <div className="mt-4">
                <Link href="/docs">
                  <Button variant="outline" className="cursor-pointer">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    返回文档中心
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const slug = Array.isArray(resolvedParams?.slug)
    ? resolvedParams.slug
    : typeof resolvedParams?.slug === 'string'
      ? [resolvedParams.slug]
      : []
  if (slug.length === 0) {
    notFound()
  }

  const absolutePath = resolveDocAbsolutePath(docsRoot, slug)
  if (!absolutePath) {
    notFound()
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(absolutePath)
  } catch {
    notFound()
  }

  const relativePath = formatRelativePath(slug)

  // 目录：展示简单列表（优先展示 readme.md）
  if (stat.isDirectory()) {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true })
    const items = entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        isDir: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    const readme = items.find(
      (i) => !i.isDir && (i.name.toLowerCase() === 'readme.md' || i.name.toLowerCase() === 'readme.mdx')
    )

    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-foreground">文档目录</h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">{relativePath}</p>
            </div>
            <div className="flex gap-2">
              <Link href="/docs">
                <Button variant="outline" className="cursor-pointer">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  返回文档中心
                </Button>
              </Link>
              {readme && (
                <Link href={toDocHref(`${relativePath}/${readme.name}`)}>
                  <Button className="cursor-pointer">
                    <FileText className="mr-2 h-4 w-4" />
                    打开 README
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <Card className="mt-6 border-border/60 bg-card/80 dark:border-border dark:bg-card/80">
            <CardContent className="p-5">
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">目录为空</p>
                ) : (
                  items.map((item) => {
                    const href = toDocHref(`${relativePath}/${item.name}`)
                    return (
                      <Link key={item.name} href={href} className="block">
                        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-4 py-3 transition hover:bg-muted/50 dark:border-border dark:bg-card/60">
                          <div className="flex min-w-0 items-center gap-3">
                            {item.isDir ? (
                              <FolderOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            ) : (
                              <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">打开</span>
                        </div>
                      </Link>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // 文件：仅允许读取 markdown/json/txt（避免意外泄露仓库敏感文件）
  const allowedExtensions = new Set(['.md', '.mdx', '.txt', '.json'])
  const ext = path.extname(absolutePath).toLowerCase()
  if (!allowedExtensions.has(ext)) {
    notFound()
  }

  let content = ''
  try {
    content = await fs.readFile(absolutePath, 'utf8')
  } catch {
    notFound()
  }

  const lastModified = stat.mtime ? stat.mtime.toISOString() : ''

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-foreground">文档查看</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{relativePath}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/docs">
              <Button variant="outline" className="cursor-pointer">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回文档中心
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          最后修改时间：{lastModified || '-'}
        </div>

        <Card className="mt-6 border-border/60 bg-card/80 dark:border-border dark:bg-card/80">
          <CardContent className="p-0">
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl p-5 font-mono text-[13px] leading-relaxed text-foreground">
              {content}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
