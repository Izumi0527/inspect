'use client'

/**
 * 登录页面组件
 * 现代化设计，支持表单验证和错误处理
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, Shield, Monitor, AlertCircle } from 'lucide-react'
import { useAuth, withGuest } from '@/lib/contexts/auth-context'
import { LoginCredentials } from '@/lib/types/auth.types'

// 登录表单验证Schema
const loginSchema = z.object({
  username: z.string()
    .min(1, '请输入用户名')
    .min(3, '用户名至少3个字符'),
  password: z.string()
    .min(1, '请输入密码')
    .min(6, '密码至少6个字符'),
  remember_me: z.boolean().default(false),
})

type LoginFormData = z.infer<typeof loginSchema>

function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error, clearError } = useAuth()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setFocus,
    setValue,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
      remember_me: false,
    },
  })

  // 自动聚焦到用户名输入框
  useEffect(() => {
    setFocus('username')
  }, [setFocus])

  // 清除错误信息
  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data as LoginCredentials)
      // 登录成功后的跳转在auth context中处理
    } catch (error) {
      // 错误处理在auth context中完成
      console.error('Login submission error:', error)
    }
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* 顶部Logo和标题区域 */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <Monitor className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            网络设备巡检系统
          </h2>
          <p className="text-slate-600">
            请登录您的账户以继续
          </p>
        </div>

        {/* 登录表单卡片 */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8">
          {/* 测试账号提示 */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-center mb-2">
              <Shield className="h-5 w-5 text-blue-600 mr-2" />
              <h3 className="text-sm font-semibold text-blue-800">测试账号信息</h3>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm text-blue-700">
                用户名：<code className="bg-blue-100 px-2 py-1 rounded text-blue-800 font-mono">admin</code>
              </p>
              <p className="text-sm text-blue-700">
                密码：<code className="bg-blue-100 px-2 py-1 rounded text-blue-800 font-mono">Admin123!</code>
              </p>
              <p className="text-xs text-blue-600 mt-2">
                点击下方按钮可自动填充测试账号
              </p>
            </div>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  // 使用react-hook-form的setValue方法设置表单值
                  setValue('username', 'admin', {
                    shouldValidate: true,  // 触发验证
                    shouldDirty: true,     // 标记为已修改
                    shouldTouch: true      // 标记为已触摸
                  });
                  setValue('password', 'Admin123!', {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true
                  });
                }}
                className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg transition-colors duration-200"
              >
                一键填充测试账号
              </button>
            </div>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {/* 错误信息显示 */}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* 用户名输入 */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2">
                用户名
              </label>
              <input
                {...register('username')}
                type="text"
                autoComplete="username"
                className={`
                  w-full px-4 py-3 border rounded-xl bg-white/50 backdrop-blur-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  transition-all duration-200
                  ${errors.username ? 'border-red-300' : 'border-slate-300'}
                `}
                placeholder="请输入用户名"
              />
              {errors.username && (
                <p className="mt-2 text-sm text-red-600">{errors.username.message}</p>
              )}
            </div>

            {/* 密码输入 */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                密码
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`
                    w-full px-4 py-3 pr-12 border rounded-xl bg-white/50 backdrop-blur-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    transition-all duration-200
                    ${errors.password ? 'border-red-300' : 'border-slate-300'}
                  `}
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-2 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            {/* 记住我选项 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  {...register('remember_me')}
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                />
                <label htmlFor="remember_me" className="ml-2 block text-sm text-slate-700">
                  记住我
                </label>
              </div>

              <div className="text-sm">
                <Link
                  href="/forgot-password"
                  className="text-blue-600 hover:text-blue-500 font-medium"
                >
                  忘记密码？
                </Link>
              </div>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className={`
                group relative w-full flex justify-center py-3 px-4 border border-transparent
                text-sm font-medium rounded-xl text-white
                bg-gradient-to-r from-blue-600 to-purple-600
                hover:from-blue-700 hover:to-purple-700
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]
                shadow-lg hover:shadow-xl
              `}
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                {isSubmitting || isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Shield className="h-5 w-5" />
                )}
              </span>
              {isSubmitting || isLoading ? '正在登录...' : '立即登录'}
            </button>
          </form>

          {/* 底部链接 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              还没有账户？{' '}
              <Link
                href="/register"
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                联系管理员
              </Link>
            </p>
          </div>
        </div>

        {/* 系统信息 */}
        <div className="text-center">
          <p className="text-xs text-slate-500">
            企业级网络设备巡检与监控平台 v1.0.0
          </p>
          <p className="text-xs text-slate-400 mt-1">
            基于 React 19 + Next.js 15 构建
          </p>
        </div>
      </div>
    </div>
  )
}

// 使用withGuest HOC包装，确保已登录用户不能访问登录页
export default withGuest(LoginPage)