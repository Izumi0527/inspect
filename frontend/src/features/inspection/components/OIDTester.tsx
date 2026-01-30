/**
 * OID 测试器组件
 * 用于测试 SNMP OID 是否可以正常查询
 */

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'

interface OIDTestResult {
  success: boolean
  value?: string
  type?: string
  message?: string
}

interface OIDTesterProps {
  defaultDeviceId?: number
  defaultOid?: string
  onTestSuccess?: (result: { value: string; type: string }) => void
}

export function OIDTester({
  defaultDeviceId,
  defaultOid,
  onTestSuccess,
}: OIDTesterProps) {
  const [deviceId, setDeviceId] = useState<string>(
    defaultDeviceId?.toString() || ''
  )
  const [oid, setOid] = useState<string>(defaultOid || '')
  const [testResult, setTestResult] = useState<OIDTestResult | null>(null)

  // 测试 OID - 使用本地 mutation（后端 API 尚未完全实现）
  const testMutation = useMutation({
    mutationFn: async ({ deviceId, oid }: { deviceId: number; oid: string }): Promise<OIDTestResult> => {
      // TODO: 调用真实的 OID 测试 API
      // 目前返回模拟结果
      console.log(`Testing OID ${oid} on device ${deviceId}`)
      return {
        success: false,
        message: 'OID 测试功能尚未完全实现',
      }
    },
    onSuccess: (data: OIDTestResult) => {
      setTestResult(data)
      if (data.success && data.value && data.type) {
        onTestSuccess?.({ value: data.value, type: data.type })
      }
    },
    onError: (error: Error) => {
      setTestResult({
        success: false,
        message: error.message,
      })
    },
  })

  // 处理测试
  const handleTest = () => {
    if (!deviceId || !oid) {
      setTestResult({
        success: false,
        message: '请填写设备 ID 和 OID',
      })
      return
    }

    const deviceIdNum = parseInt(deviceId)
    if (isNaN(deviceIdNum) || deviceIdNum <= 0) {
      setTestResult({
        success: false,
        message: '设备 ID 必须是正整数',
      })
      return
    }

    // 验证 OID 格式
    const oidPattern = /^(\d+\.)+\d+$/
    if (!oidPattern.test(oid)) {
      setTestResult({
        success: false,
        message: 'OID 格式不正确，应该类似：1.3.6.1.2.1.1.3.0',
      })
      return
    }

    setTestResult(null)
    testMutation.mutate({ deviceId: deviceIdNum, oid })
  }

  // 清除结果
  const handleClear = () => {
    setTestResult(null)
  }

  // 常用 OID 示例
  const commonOids = [
    { label: 'System Uptime', oid: '1.3.6.1.2.1.1.3.0' },
    { label: 'System Description', oid: '1.3.6.1.2.1.1.1.0' },
    { label: 'System Name', oid: '1.3.6.1.2.1.1.5.0' },
    { label: 'CPU Usage (Cisco)', oid: '1.3.6.1.4.1.9.2.1.56.0' },
    { label: 'Memory Usage (Cisco)', oid: '1.3.6.1.4.1.9.2.1.8.0' },
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">OID 测试工具</h3>

      <div className="space-y-4">
        {/* 设备 ID 输入 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            设备 ID <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="输入设备 ID"
          />
          <p className="text-xs text-gray-500 mt-1">
            要测试的目标设备的 ID
          </p>
        </div>

        {/* OID 输入 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            OID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={oid}
            onChange={(e) => setOid(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：1.3.6.1.2.1.1.3.0"
          />
          <p className="text-xs text-gray-500 mt-1">
            SNMP OID，格式：数字.数字.数字...
          </p>
        </div>

        {/* 常用 OID 快捷选择 */}
        <div>
          <label className="block text-sm font-medium mb-2">
            常用 OID 快捷选择
          </label>
          <div className="flex flex-wrap gap-2">
            {commonOids.map((item) => (
              <button
                key={item.oid}
                onClick={() => setOid(item.oid)}
                className="px-3 py-1 text-xs border rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
                title={item.oid}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 测试按钮 */}
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={testMutation.isPending}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testMutation.isPending ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                测试中...
              </span>
            ) : (
              <span className="flex items-center justify-center">
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
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                测试 OID
              </span>
            )}
          </button>
          {testResult && (
            <button
              onClick={handleClear}
              className="px-4 py-2 border rounded hover:bg-gray-100 transition-colors"
            >
              清除
            </button>
          )}
        </div>

        {/* 测试结果 */}
        {testResult && (
          <div
            className={`rounded-lg p-4 ${
              testResult.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-start">
              {testResult.success ? (
                <svg
                  className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 text-red-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
              <div className="flex-1">
                <h4
                  className={`font-semibold mb-2 ${
                    testResult.success ? 'text-green-900' : 'text-red-900'
                  }`}
                >
                  {testResult.success ? '测试成功' : '测试失败'}
                </h4>
                {testResult.success ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-green-700 font-medium">值：</span>
                        <span className="text-green-900 ml-2 font-mono">
                          {testResult.value}
                        </span>
                      </div>
                      <div>
                        <span className="text-green-700 font-medium">类型：</span>
                        <span className="text-green-900 ml-2">
                          {testResult.type}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-green-700 mt-2">
                      OID 查询成功，可以在模板中使用此 OID
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-red-800">
                    {testResult.message || '未知错误'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="bg-gray-50 rounded p-3">
          <h5 className="text-xs font-semibold mb-2">使用说明</h5>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• 输入设备 ID 和要测试的 OID</li>
            <li>• 点击"测试 OID"按钮执行查询</li>
            <li>• 测试成功会显示查询到的值和数据类型</li>
            <li>• 测试失败会显示错误信息</li>
            <li>• 可以使用常用 OID 快捷按钮快速填充</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
