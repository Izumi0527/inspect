'use client'

import { useEffect, useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import type {
  CreateUserRequest,
  Role,
  UpdateUserRequest,
  User,
  UserRole,
  UserStatus,
} from '../../types/users.types'

type Mode = 'create' | 'edit'

interface Props {
  open: boolean
  mode: Mode
  roles: Role[]
  user?: User | null
  isSubmitting?: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: CreateUserRequest) => Promise<void>
  onUpdate: (userId: string, data: UpdateUserRequest) => Promise<void>
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const statusOptions: Array<{ value: UserStatus; label: string }> = [
  { value: 'active', label: '正常' },
  { value: 'inactive', label: '停用' },
  { value: 'locked', label: '锁定' },
]

export function UserFormDialog({
  open,
  mode,
  roles,
  user,
  isSubmitting = false,
  onOpenChange,
  onCreate,
  onUpdate,
}: Props) {
  const defaultRole = useMemo<UserRole>(() => {
    const first = roles?.[0]?.name
    return (first as UserRole) || 'viewer'
  }, [roles])

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [status, setStatus] = useState<UserStatus>('active')
  const [forcePasswordChange, setForcePasswordChange] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setError(null)
      return
    }

    if (mode === 'edit' && user) {
      setUsername(user.username)
      setEmail(user.email)
      setFullName(user.fullName || '')
      setRole(user.role)
      setStatus(user.status)
      setPassword('')
      setPasswordConfirm('')
      setForcePasswordChange(false)
      setError(null)
      return
    }

    setUsername('')
    setEmail('')
    setFullName('')
    setRole(defaultRole)
    setStatus('active')
    setPassword('')
    setPasswordConfirm('')
    setForcePasswordChange(false)
    setError(null)
  }, [open, mode, user, defaultRole])

  const handleSubmit = async () => {
    setError(null)

    try {
      if (mode === 'create') {
        if (!username.trim()) {
          setError('请输入用户名')
          return
        }
        if (!email.trim() || !isValidEmail(email.trim())) {
          setError('请输入有效的邮箱地址')
          return
        }
        if (!password) {
          setError('请输入初始密码')
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

        await onCreate({
          username: username.trim(),
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          role,
          status,
          forcePasswordChange,
        })
        onOpenChange(false)
        return
      }

      if (!user?.id) {
        setError('用户信息缺失')
        return
      }
      if (!email.trim() || !isValidEmail(email.trim())) {
        setError('请输入有效的邮箱地址')
        return
      }

      await onUpdate(user.id, {
        email: email.trim(),
        fullName: fullName.trim(),
        role,
      })
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message || '提交失败')
    }
  }

  const title = mode === 'create' ? '添加用户' : '编辑用户'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              disabled={mode === 'edit' || isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">姓名</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="（可选）"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label>角色</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)} disabled={isSubmitting}>
              <SelectTrigger aria-label="用户角色">
                <SelectValue placeholder="请选择角色" />
              </SelectTrigger>
              <SelectContent>
                {(roles || []).map((r) => (
                  <SelectItem key={r.id} value={r.name}>
                    {r.displayName || r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === 'create' && (
            <>
              <div className="space-y-2">
                <Label>初始状态</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as UserStatus)} disabled={isSubmitting}>
                  <SelectTrigger aria-label="用户初始状态">
                    <SelectValue placeholder="请选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">初始密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 8 位"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordConfirm">确认密码</Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="再次输入密码"
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Checkbox
                  checked={forcePasswordChange}
                  onCheckedChange={setForcePasswordChange}
                  disabled={isSubmitting}
                  id="forcePasswordChange"
                />
                <Label htmlFor="forcePasswordChange" className="cursor-pointer">
                  首次登录强制修改密码
                </Label>
              </div>
            </>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '提交中...' : '提交'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
