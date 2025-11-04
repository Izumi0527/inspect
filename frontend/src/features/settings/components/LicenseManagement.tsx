import React from 'react'
import { Key, AlertTriangle, CheckCircle } from 'lucide-react'
import { Card, CardContent, Button } from '@/components/atoms'

export const LicenseManagement: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Key className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-semibold">企业版许可证</h3>
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-600">有效</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <span className="font-medium">许可证持有者:</span> 企业网络科技有限公司
                </div>
                <div>
                  <span className="font-medium">许可设备数:</span> 1000 台
                </div>
                <div>
                  <span className="font-medium">许可用户数:</span> 100 人
                </div>
                <div>
                  <span className="font-medium">到期时间:</span> 2024-12-31
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-2xl font-bold text-blue-600 mb-2">63</div>
            <div className="text-sm text-gray-600">已使用设备</div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: '6.3%' }}></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-2xl font-bold text-green-600 mb-2">8</div>
            <div className="text-sm text-gray-600">活跃用户</div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div className="bg-green-600 h-2 rounded-full" style={{ width: '8%' }}></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-2xl font-bold text-orange-600 mb-2">335</div>
            <div className="text-sm text-gray-600">剩余天数</div>
            <div className="flex items-center justify-center gap-1 mt-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-orange-600">即将到期</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">更新许可证</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                许可证密钥
              </label>
              <textarea
                placeholder="请输入新的许可证密钥..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline">验证许可证</Button>
              <Button>更新许可证</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}