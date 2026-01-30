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
      title: '模板配置指南',
      url: '/docs/template-configuration-guide.md',
      description: '详细说明如何创建和配置巡检模板',
    },
    {
      title: '最佳实践',
      url: '/docs/template-best-practices.md',
      description: '阈值配置、检查项组合、性能优化建议',
    },
    {
      title: '厂商 OID 映射表',
      url: '/docs/vendor-oid-mapping.md',
      description: '各厂商的 SNMP OID 参考',
    },
  ]

  const displayLinks = links || defaultLinks

  return (
    <>
      {/* 帮助按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors flex items-center"
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
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setIsOpen(false)}
            />

            {/* 对话框内容 */}
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              {/* 头部 */}
              <div className="bg-blue-500 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{title}</h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-white hover:text-gray-200 transition-colors"
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
                    <p className="text-gray-700 whitespace-pre-line">{content}</p>
                  </div>
                )}

                {/* 文档链接 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">
                    相关文档
                  </h4>
                  <div className="space-y-3">
                    {displayLinks.map((link, index) => (
                      <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 border rounded hover:bg-gray-50 transition-colors"
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
                            <div className="font-medium text-gray-900">
                              {link.title}
                            </div>
                            {link.description && (
                              <div className="text-sm text-gray-600 mt-1">
                                {link.description}
                              </div>
                            )}
                          </div>
                          <svg
                            className="w-5 h-5 text-gray-400 ml-2"
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
              <div className="bg-gray-50 px-6 py-4 flex justify-end">
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
