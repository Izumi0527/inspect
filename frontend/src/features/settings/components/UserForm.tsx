'use client'

import React, { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, User, Mail, UserCheck, Shield } from 'lucide-react'
import {
  Button, SimpleInput as Input, SimpleSelect, SelectItem, Card, CardContent,
  Badge
} from '@/components/atoms'
import { User as UserType, UserRole, UserStatus } from '../types'

// 表单验证 Schema
const userFormSchema = z.object({
  username: z
    .string()
    .min(3, '用户名至少3个字符')
    .max(50, '用户名不能超过50个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '用户名只能包含字母、数字、下划线和连字符'),
  email: z
    .string()
    .email('请输入有效的邮箱地址'),
  fullName: z
    .string()
    .max(100, '姓名不能超过100个字符')
    .optional()
    .or(z.literal('')),
  role: z.enum(['admin', 'operator', 'viewer'] as const),
  status: z.enum(['active', 'inactive', 'locked', 'pending'] as const),
  password: z
    .string()
    .min(8, '密码至少8个字符')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      '密码必须包含大小写字母、数字和特殊字符')
    .optional(),
  confirmPassword: z.string().optional()
}).refine((data) => {
  if (data.password && data.confirmPassword) {
    return data.password === data.confirmPassword
  }
  return true
}, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword']
})

type UserFormData = z.infer<typeof userFormSchema>

interface Props {
  initialData?: Partial<UserType>
  onSubmit: (data: UserFormData) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

// 角色选项
const roleOptions: Array<{ value: UserRole; label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = [
  { value: 'admin', label: '管理员', icon: Shield, color: 'text-red-600' },
  { value: 'operator', label: '操作员', icon: UserCheck, color: 'text-blue-600' },
  { value: 'viewer', label: '查看者', icon: User, color: 'text-gray-600' }
]

// 状态选项
const statusOptions: Array<{ value: UserStatus; label: string; color: string }> = [
  { value: 'active', label: '激活', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: '停用', color: 'bg-gray-100 text-gray-800' },
  { value: 'locked', label: '锁定', color: 'bg-red-100 text-red-800' },
  { value: 'pending', label: '待激活', color: 'bg-yellow-100 text-yellow-800' }
]

export const UserForm: React.FC<Props> = ({ 
  initialData, 
  onSubmit, 
  onCancel, 
  loading = false 
}) => {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  const isEditMode = !!initialData?.id
  
  // 表单配置
  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isDirty },
    watch
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: initialData?.username || '',
      email: initialData?.email || '',
      fullName: initialData?.fullName || '',
      role: initialData?.role || 'viewer',
      status: initialData?.status || 'active',
      password: '',
      confirmPassword: ''
    },
    mode: 'onChange'
  })
  
  // 监听密码变化
  const password = watch('password')
  
  // 提交处理
  const handleFormSubmit = async (data: UserFormData) => {
    setSubmitting(true)
    try {
      const payload = isEditMode && !data.password
        ? { ...data, password: undefined, confirmPassword: undefined }
        : data
      await onSubmit(payload)
    } catch (error) {
      console.error('提交表单失败:', error)
    } finally {
      setSubmitting(false)
    }
  }
  
  // 密码强度检查
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { strength: 0, label: '', color: '' }
    
    let strength = 0
    const checks = [
      /[a-z]/.test(pwd), // 小写字母
      /[A-Z]/.test(pwd), // 大写字母
      /\d/.test(pwd), // 数字
      /[@$!%*?&]/.test(pwd), // 特殊字符
      pwd.length >= 8 // 长度
    ]
    
    strength = checks.filter(check => check).length
    
    if (strength <= 2) {
      return { strength, label: '弱', color: 'text-red-500' }
    } else if (strength <= 3) {
      return { strength, label: '中等', color: 'text-yellow-500' }
    } else {
      return { strength, label: '强', color: 'text-green-500' }
    }
  }
  
  const passwordStrength = getPasswordStrength(password || '')
  const isSubmitting = submitting || loading
  
  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* 基本信息 */}
      <Card>
        <CardContent className="p-6">
          <h4 className="text-lg font-medium mb-4 flex items-center">
            <User className="w-5 h-5 mr-2" />
            基本信息
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 用户名 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                用户名 <span className="text-red-500">*</span>
              </label>
              <Controller
                name="username"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="输入用户名"
                    error={errors.username?.message}
                    disabled={isEditMode} // 编辑模式下用户名不可修改
                  />
                )}
              />
            </div>
            
            {/* 邮箱 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                邮箱地址 <span className="text-red-500">*</span>
              </label>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    type="email"
                    placeholder="输入邮箱地址"
                    leftIcon={<Mail className="w-4 h-4" />}
                    error={errors.email?.message}
                  />
                )}
              />
            </div>
            
            {/* 姓名 */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                真实姓名
              </label>
              <Controller
                name="fullName"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    placeholder="输入真实姓名（可选）"
                    error={errors.fullName?.message}
                  />
                )}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 角色和权限 */}
      <Card>
        <CardContent className="p-6">
          <h4 className="text-lg font-medium mb-4 flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            角色和权限
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 角色选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                用户角色 <span className="text-red-500">*</span>
              </label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <SimpleSelect
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="选择角色"
                    error={errors.role?.message}
                  >
                    {roleOptions.map((option) => {
                      const IconComponent = option.icon
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <IconComponent className={`w-4 h-4 ${option.color}`} />
                            <span>{option.label}</span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SimpleSelect>
                )}
              />
              {/* 角色说明 */}
              <div className="mt-2 text-xs text-gray-500">
                <p>• 管理员：拥有所有权限</p>
                <p>• 操作员：可以执行设备巡检操作</p>
                <p>• 查看者：只能查看数据，无法修改</p>
              </div>
            </div>
            
            {/* 状态选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                账户状态 <span className="text-red-500">*</span>
              </label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <SimpleSelect
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="选择状态"
                    error={errors.status?.message}
                  >
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SimpleSelect>
                )}
              />
              {/* 状态说明 */}
              <div className="mt-2">
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => {
                    const selectedOption = statusOptions.find(opt => opt.value === field.value)
                    return selectedOption ? (
                      <Badge className={selectedOption.color}>
                        {selectedOption.label}
                      </Badge>
                    ) : <div></div>
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 密码设置 */}
      {(!isEditMode || password) && (
        <Card>
          <CardContent className="p-6">
            <h4 className="text-lg font-medium mb-4 flex items-center">
              <Eye className="w-5 h-5 mr-2" />
              {isEditMode ? '修改密码' : '设置密码'}
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 密码 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isEditMode ? '新密码' : '密码'} 
                  {!isEditMode && <span className="text-red-500">*</span>}
                </label>
                <Controller
                  name="password"
                  control={control}
                  render={({ field }) => (
                    <div className="relative">
                      <Input
                        {...field}
                        type={showPassword ? 'text' : 'password'}
                        placeholder={isEditMode ? '留空则不修改密码' : '输入密码'}
                        error={errors.password?.message}
                        rightIcon={
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        }
                      />
                    </div>
                  )}
                />
                {/* 密码强度指示器 */}
                {password && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span>密码强度:</span>
                      <span className={passwordStrength.color}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                      <div 
                        className={`h-1 rounded-full transition-all duration-300 ${
                          passwordStrength.strength <= 2 ? 'bg-red-500' :
                          passwordStrength.strength <= 3 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* 确认密码 */}
              {password && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    确认密码 <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="confirmPassword"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="再次输入密码"
                        error={errors.confirmPassword?.message}
                        rightIcon={
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        }
                      />
                    )}
                  />
                </div>
              )}
            </div>
            
            {/* 密码要求说明 */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <h5 className="text-sm font-medium text-blue-800 mb-2">密码要求：</h5>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• 至少8个字符</li>
                <li>• 包含大写字母</li>
                <li>• 包含小写字母</li>
                <li>• 包含数字</li>
                <li>• 包含特殊字符 (@$!%*?&)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* 操作按钮 */}
      <div className="flex justify-end space-x-3 pt-6 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          取消
        </Button>
        <Button
          type="submit"
          disabled={!isValid || (!isDirty && isEditMode) || isSubmitting}
          loading={isSubmitting}
        >
          {isEditMode ? '保存修改' : '创建用户'}
        </Button>
      </div>
    </form>
  )
}