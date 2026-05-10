/**
 * 帮助对话框组件
 * 显示上下文相关的帮助信息和文档链接
 */

import { useState } from 'react'

interface HelpDialogProps {
  title?: string
  content?: string
  links?: Array<{
    title: string
    url: string
    description?: string
  }>
}

export function HelpDialog({ title = '帮助', content, links }: HelpDialogProps) {
  const [isOpen, setIsOpen] = useState(false)

  const defaultLinks = [
    {
      title: '项目详细架构文档',
      url: '/docs/PROJECT_ARCHITECTURE.md',
      description: '查看系统模块边界、巡检/监控/报表链路与扩展规范',
    },
  ]

  const displayLinks = links || defaultLinks

  return (
    <>
      {/* 帮助按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center rounded border border-border bg-card px-4 py-2 text-foreground transition-colors hover:bg-muted"
        title="查看帮助"
      >
        <svg
          className="w-5 h-5 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        帮助
      </button>

      {/* 对话框 */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* 背景遮罩 */}
            <div
              className="fixed inset-0 transition-opacity bg-muted/400 bg-opacity-75"
              onClick={() => setIsOpen(false)}
            />

            {/* 对话框内容 */}
            <div className="inline-block transform overflow-hidden rounded-lg border border-border/50 bg-card text-left text-foreground shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:align-middle">
              {/* 头部 */}
              <div className="bg-blue-500 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{title}</h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-white hover:text-foreground/90 transition-colors"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 内容 */}
              <div className="px-6 py-4">
                {content && (
                  <div className="mb-6">
                    <p className="whitespace-pre-line text-muted-foreground">{content}</p>
                  </div>
                )}

                {/* 文档链接 */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-foreground">
                    相关文档
                  </h4>
                  <div className="space-y-3">
                    {displayLinks.map((link, index) => (
                      <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded border border-border bg-background/40 p-3 transition-colors hover:bg-muted/60"
                      >
                        <div className="flex items-start">
                          <svg
                            className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <div className="flex-1">
                            <div className="font-medium text-foreground">
                              {link.title}
                            </div>
                            {link.description && (
                              <div className="mt-1 text-sm text-muted-foreground">
                                {link.description}
                              </div>
                            )}
                          </div>
                          <svg
                            className="ml-2 h-5 w-5 text-muted-foreground"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>

                {/* 快速提示 */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded p-4">
                  <div className="flex items-start">
                    <svg
                      className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="text-sm text-blue-800">
                      <div className="font-semibold mb-1">快速提示</div>
                      <ul className="space-y-1">
                        <li>• 使用筛选器快速查找需要的模板</li>
                        <li>• 内置模板不可编辑，但可以复制后修改</li>
                        <li>• 使用 OID 测试工具验证配置是否正确</li>
                        <li>• 定期导出模板配置作为备份</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部 */}
              <div className="flex justify-end border-t border-border/50 bg-muted/40 px-6 py-4">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
