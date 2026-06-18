'use client'

/**
 * 强制改密页面
 * 首次登录或密码被管理员重置（force_password_change=true）的用户，
 * 在此完成改密。改密前后端会拒绝业务接口（403 PasswordChangeRequired）。
 * 改密成功后后端会失效所有会话，需重新登录。
 */

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { Loader2, Shield, KeyRound } from 'lucide-react'
import { useAuth, useRequireAuth } from '@/lib/contexts/auth-context'
import { api, ApiClientError } from '@/lib/api-client'

// 改密表单校验：新密码与确认一致、且不与当前密码相同。后端密码策略为最终权威。
const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, '请输入当前密码'),
    new_password: z.string().min(8, '新密码至少 8 位'),
    confirm_password: z.string().min(1, '请再次输入新密码'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: '两次输入的新密码不一致',
    path: ['confirm_password'],
  })
  .refine((data) => data.new_password !== data.current_password, {
    message: '新密码不能与当前密码相同',
    path: ['new_password'],
  })

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>

export default function ChangePasswordPage() {
  // 未登录用户重定向到登录页；已登录的强制改密用户可正常停留。
  const { isLoading } = useRequireAuth()
  const { logout } = useAuth()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setFocus,
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  })

  useEffect(() => {
    setFocus('current_password')
  }, [setFocus])

  const onSubmit = async (data: ChangePasswordFormData) => {
    try {
      await api.auth.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      })
      toast.success('密码修改成功，请使用新密码重新登录')
      // 后端已失效所有会话，清理本地登录态并跳转登录页。
      await logout()
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : '修改失败，请稍后重试'
      toast.error(message)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 dark:from-[#181818] dark:via-[#1f1f1f] dark:to-[#252526] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-r from-teal-600 to-cyan-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <KeyRound className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-2">修改密码</h2>
          <p className="text-slate-600 dark:text-gray-300">
            首次登录或密码已被重置，请先设置新密码后再继续使用
          </p>
        </div>

        <div className="bg-card/80 backdrop-blur-lg rounded-2xl shadow-xl border border-border/50 p-8">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="current_password" className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                当前密码
              </label>
              <input
                {...register('current_password')}
                id="current_password"
                type="password"
                autoComplete="current-password"
                className={`w-full px-4 py-3 border rounded-xl bg-background/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${errors.current_password ? 'border-red-300' : 'border-input'}`}
                placeholder="请输入当前密码"
              />
              {errors.current_password && (
                <p className="mt-2 text-sm text-red-600">{errors.current_password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="new_password" className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                新密码
              </label>
              <input
                {...register('new_password')}
                id="new_password"
                type="password"
                autoComplete="new-password"
                className={`w-full px-4 py-3 border rounded-xl bg-background/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${errors.new_password ? 'border-red-300' : 'border-input'}`}
                placeholder="请输入新密码"
              />
              {errors.new_password && (
                <p className="mt-2 text-sm text-red-600">{errors.new_password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirm_password" className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                确认新密码
              </label>
              <input
                {...register('confirm_password')}
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                className={`w-full px-4 py-3 border rounded-xl bg-background/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${errors.confirm_password ? 'border-red-300' : 'border-input'}`}
                placeholder="请再次输入新密码"
              />
              {errors.confirm_password && (
                <p className="mt-2 text-sm text-red-600">{errors.confirm_password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-teal-600 to-cyan-500 hover:from-teal-700 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Shield className="h-5 w-5" />
                )}
              </span>
              {isSubmitting ? '正在提交...' : '确认修改'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
