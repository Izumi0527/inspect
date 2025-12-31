'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Plus,
  UserPlus,
  Edit,
  Trash2,
  Lock,
  Unlock
} from 'lucide-react'
import {
  Card, CardContent, Button,
  SimpleInput as Input, SimpleSelect, SelectItem, Table, SimpleModal, Badge
} from '@/components/atoms'
import { useUsers } from '../hooks/useUsers'
import { UserForm } from './UserForm'
import { UserBulkImport } from './UserBulkImport'
import { User, UserRole, UserStatus, UserBulkOperation } from '../types'

interface Props {
  searchText: string
}

// 角色标签颜色映射
const roleColors: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800',
  operator: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-800'
}

// 状态标签颜色映射
const statusColors: Record<UserStatus, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800', 
  locked: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800'
}

// 角色显示名称
const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  operator: '操作员',
  viewer: '查看者'
}

// 状态显示名称
const statusLabels: Record<UserStatus, string> = {
  active: '活跃',
  inactive: '停用',
  locked: '锁定', 
  pending: '待激活'
}

export const UserManagement: React.FC<Props> = ({ searchText }) => {
  const allSelectValue = '__all__'
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>("")
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>("")
  const [sortBy] = useState('created_at')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')
  
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  
  // 使用自定义 Hook
  const {
    users,
    loading,
    total,
    error,
    createUser,
    updateUser,
    deleteUser,
    bulkOperation,
    importUsers,
    refetch
  } = useUsers({
    page: currentPage,
    pageSize,
    search: searchQuery,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
    sortBy,
    sortOrder
  })
  
  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchText)
      setCurrentPage(1)
    }, 300)
    
    return () => clearTimeout(timer)
  }, [searchText])
  
  // 处理筛选变化
  const handleFilterChange = useCallback((key: string, value: string) => {
    if (key === 'role') {
      setRoleFilter(value as UserRole | '')
    } else if (key === 'status') {
      setStatusFilter(value as UserStatus | '')
    }
    setCurrentPage(1)
  }, [])
  
  // 处理排序变化
  // 处理用户选择
  const handleUserSelect = useCallback((userId: string, selected: boolean) => {
    setSelectedUsers(prev => 
      selected 
        ? [...prev, userId]
        : prev.filter(id => id !== userId)
    )
  }, [])
  
  // 处理用户操作
  const handleUserAction = useCallback(async (action: string, user?: User) => {
    try {
      switch (action) {
        case 'edit':
          setSelectedUser(user || null)
          setIsEditModalOpen(true)
          break
        case 'delete':
          setSelectedUser(user || null)
          setIsDeleteModalOpen(true)
          break
        case 'lock':
          if (user) {
            await updateUser(user.id, { status: 'locked' })
          }
          break
        case 'unlock':
          if (user) {
            await updateUser(user.id, { status: 'active' })
          }
          break
        default:
          break
      }
    } catch (error) {
      console.error('操作失败:', error)
    }
  }, [updateUser])
  
  // 处理批量操作
  const handleBulkAction = useCallback(async (action: UserBulkOperation['type']) => {
    if (selectedUsers.length === 0) return
    
    try {
      await bulkOperation({
        userIds: selectedUsers,
        type: action
      })
      setSelectedUsers([])
    } catch (error) {
      console.error('批量操作失败:', error)
    }
  }, [selectedUsers, bulkOperation])
  
  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">加载用户列表失败：{error}</p>
        <Button onClick={refetch} className="mt-4">重试</Button>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">用户管理</h3>
          <p className="text-sm text-gray-600">管理系统用户账户和权限</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setIsImportModalOpen(true)}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            批量导入
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            添加用户
          </Button>
        </div>
      </div>
      
      {/* 筛选栏 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            {/* 搜索框 */}
            <div className="flex-1 min-w-64">
              <Input
                placeholder="搜索用户名、邮箱或姓名..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* 角色筛选 */}
            <SimpleSelect
              value={roleFilter || allSelectValue}
              onChange={(value) => handleFilterChange('role', value === allSelectValue ? '' : value)}
              placeholder="所有角色"
            >
              <SelectItem value={allSelectValue}>所有角色</SelectItem>
              <SelectItem value="admin">管理员</SelectItem>
              <SelectItem value="operator">操作员</SelectItem>
              <SelectItem value="viewer">查看者</SelectItem>
            </SimpleSelect>
            
            {/* 状态筛选 */}
            <SimpleSelect
              value={statusFilter || allSelectValue}
              onChange={(value) => handleFilterChange('status', value === allSelectValue ? '' : value)}
              placeholder="所有状态"
            >
              <SelectItem value={allSelectValue}>所有状态</SelectItem>
              <SelectItem value="active">活跃</SelectItem>
              <SelectItem value="inactive">停用</SelectItem>
              <SelectItem value="locked">锁定</SelectItem>
              <SelectItem value="pending">待激活</SelectItem>
            </SimpleSelect>
            
            {/* 批量操作 */}
            {selectedUsers.length > 0 && (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleBulkAction('activate')}
                >
                  激活 ({selectedUsers.length})
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleBulkAction('deactivate')}
                >
                  停用 ({selectedUsers.length})
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => handleBulkAction('delete')}
                >
                  删除 ({selectedUsers.length})
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* 用户表格 */}
      <Card>
        <Table
          loading={loading}
          data={users}
          columns={[
            {
              key: 'select',
              title: '',
              render: (_value: unknown, user: User) => (
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={(e) => handleUserSelect(user.id, e.target.checked)}
                  className="rounded border-gray-300"
                />
              ),
              width: '48px'
            },
            {
              key: 'user',
              title: '用户信息',
              sortable: true,
              render: (_value: unknown, user: User) => (
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <Users className="w-5 h-5 text-gray-600" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {user.fullName || user.username}
                    </p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                    {user.lastLoginAt && (
                      <p className="text-xs text-gray-400">
                        最后登录: {formatDate(user.lastLoginAt)}
                      </p>
                    )}
                  </div>
                </div>
              )
            },
            {
              key: 'role',
              title: '角色',
              sortable: true,
              render: (_value: unknown, user: User) => (
                <Badge className={roleColors[user.role]}>
                  {roleLabels[user.role]}
                </Badge>
              )
            },
            {
              key: 'status',
              title: '状态',
              sortable: true,
              render: (_value: unknown, user: User) => (
                <Badge className={statusColors[user.status]}>
                  {statusLabels[user.status]}
                </Badge>
              )
            },
            {
              key: 'createdAt',
              title: '创建时间',
              sortable: true,
              render: (_value: unknown, user: User) => (
                <span className="text-sm text-gray-900">
                  {formatDate(user.createdAt)}
                </span>
              )
            },
            {
              key: 'actions',
              title: '操作',
              render: (_value: unknown, user: User) => (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUserAction('edit', user)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  {user.status === 'active' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUserAction('lock', user)}
                    >
                      <Lock className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUserAction('unlock', user)}
                    >
                      <Unlock className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUserAction('delete', user)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ),
              width: '120px'
            }
          ]}
          pagination={{
            current: currentPage,
            total,
            pageSize,
            onChange: setCurrentPage,
            showTotal: true
          }}
        />
      </Card>
      
      {/* 创建用户模态框 */}
      <SimpleModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="创建用户"
        size="md"
      >
        <UserForm
          onSubmit={async (userData) => {
            const { confirmPassword: _confirmPassword, password: _password, ...rest } = userData
            // 表单中的密码字段仅用于前端校验，不需要提交给接口
            void _confirmPassword
            void _password
            const payload = {
              ...rest,
              fullName: rest.fullName || '',
              permissions: [] as string[],
            }
            await createUser(payload as Parameters<typeof createUser>[0])
            setIsCreateModalOpen(false)
          }}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      </SimpleModal>
      
      {/* 编辑用户模态框 */}
      <SimpleModal
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="编辑用户"
        size="md"
      >
        {selectedUser && (
          <UserForm
            initialData={selectedUser}
            onSubmit={async (userData) => {
              await updateUser(selectedUser.id, userData)
              setIsEditModalOpen(false)
              setSelectedUser(null)
            }}
            onCancel={() => {
              setIsEditModalOpen(false)
              setSelectedUser(null)
            }}
          />
        )}
      </SimpleModal>
      
      {/* 批量导入模态框 */}
      <SimpleModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="批量导入用户"
        size="lg"
      >
        <UserBulkImport
          onSubmit={async (importData) => {
            await importUsers(importData)
            setIsImportModalOpen(false)
          }}
          onCancel={() => setIsImportModalOpen(false)}
        />
      </SimpleModal>
      
      {/* 删除确认模态框 */}
      <SimpleModal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="确认删除"
        size="sm"
      >
        {selectedUser && (
          <div className="space-y-4">
            <p>您确定要删除用户 <strong>{selectedUser.username}</strong> 吗？</p>
            <p className="text-sm text-gray-600">此操作无法撤销。</p>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteModalOpen(false)
                  setSelectedUser(null)
                }}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await deleteUser(selectedUser.id)
                  setIsDeleteModalOpen(false)
                  setSelectedUser(null)
                }}
              >
                确认删除
              </Button>
            </div>
          </div>
        )}
      </SimpleModal>
    </div>
  )
}
