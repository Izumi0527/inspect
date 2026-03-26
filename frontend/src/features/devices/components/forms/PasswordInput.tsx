'use client'

import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { SimpleInput as Input } from '@/components/atoms'

interface PasswordInputProps {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: () => void
  name?: string
  placeholder?: string
  error?: string
}

/** 带可见性切换的密码输入框，消除 CLI/SNMP 表单中 5 处重复 */
export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  onBlur,
  name,
  placeholder,
  error,
}) => {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        name={name}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        error={error}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 pr-3 flex items-center"
        onClick={() => setVisible(v => !v)}
      >
        {visible ? (
          <EyeOff className="h-4 w-4 text-muted-foreground/80" />
        ) : (
          <Eye className="h-4 w-4 text-muted-foreground/80" />
        )}
      </button>
    </div>
  )
}
