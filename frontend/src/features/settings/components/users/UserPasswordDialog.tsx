'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { User } from '../../types/users.types'

interface Props {
  open: boolean
  user: User | null
  isSubmitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (userId: string, newPassword: string) => Promise<void>
}

export function UserPasswordDialog({
  open,
  user,
  isSubmitting = false,
  onOpenChange,
  onSubmit,
}: Props) {
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setPassword('')
      setPasswordConfirm('')
      setError(null)
    }
  }, [open])

  const handleSubmit = async () => {
    setError(null)

    if (!user?.id) {
      setError('用户信息缺失')
      return
    }
    if (!password) {
      setError('请输入新密码')
      return
    }
    if (password.length < 8) {
      setError('密码长度至少 8 位')
      return
    }
    if (password !== passwordConfirm) {
      setError('两次输入的密码不一致')
      return
    }

    try {
      await onSubmit(user.id, password)
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message || '提交失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>重置密码</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {user ? (
              <>
                为用户 <span className="font-medium text-gray-900 dark:text-gray-100">{user.username}</span> 重置密码
              </>
            ) : (
              '请选择需要重置密码的用户'
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">新密码</Label>
            <Input
              id="newPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPasswordConfirm">确认新密码</Label>
            <Input
              id="newPasswordConfirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="再次输入新密码"
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !user}>
            {isSubmitting ? '提交中...' : '确定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
