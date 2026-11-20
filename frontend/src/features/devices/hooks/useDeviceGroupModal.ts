'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ApiClientError } from '@/lib/api-client'
import {
  createDeviceGroup,
  deleteDeviceGroup,
  DEVICE_GROUPS_QUERY_KEY,
  getDeviceGroups,
  updateDeviceGroup,
} from '../api/devices.api'
import type { DeviceGroupItem } from '../types'
import {
  buildDeviceGroupTree,
  flattenDeviceGroupTree,
  getSelectableParentGroups,
} from '../utils/deviceGroupTree'
import {
  NO_PARENT_GROUP_VALUE,
  type DeviceGroupFormValues,
} from '../components/DeviceGroupFormPanel'

const EMPTY_FORM: DeviceGroupFormValues = {
  name: '',
  description: '',
  parentId: NO_PARENT_GROUP_VALUE,
}

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback

export function useDeviceGroupModal(isOpen: boolean, onMutated?: () => void) {
  const queryClient = useQueryClient()
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingGroup, setEditingGroup] = useState<DeviceGroupItem | null>(null)
  const [formValues, setFormValues] = useState<DeviceGroupFormValues>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState<DeviceGroupItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data: groups = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: DEVICE_GROUPS_QUERY_KEY,
    queryFn: getDeviceGroups,
    enabled: isOpen,
  })

  const flatNodes = useMemo(
    () => flattenDeviceGroupTree(buildDeviceGroupTree(groups)),
    [groups],
  )

  const childCountMap = useMemo(() => {
    const counts = new Map<number, number>()
    for (const group of groups) {
      if (group.parent_id !== null) {
        counts.set(group.parent_id, (counts.get(group.parent_id) ?? 0) + 1)
      }
    }
    return counts
  }, [groups])

  const parentOptions = useMemo(
    () =>
      getSelectableParentGroups(
        groups,
        formMode === 'edit' && editingGroup ? editingGroup.id : null,
      ),
    [groups, formMode, editingGroup],
  )

  const invalidateGroupCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: DEVICE_GROUPS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['devices'] }),
      queryClient.invalidateQueries({ queryKey: ['monitoring-devices'] }),
    ])
    onMutated?.()
  }

  const openCreateForm = () => {
    setFormMode('create')
    setEditingGroup(null)
    setFormValues(EMPTY_FORM)
    setFormError(null)
    setDeletingGroup(null)
  }

  const openEditForm = (group: DeviceGroupItem) => {
    setFormMode('edit')
    setEditingGroup(group)
    setFormValues({
      name: group.name,
      description: group.description ?? '',
      parentId: group.parent_id !== null ? String(group.parent_id) : NO_PARENT_GROUP_VALUE,
    })
    setFormError(null)
    setDeletingGroup(null)
  }

  const closeForm = () => {
    setFormMode(null)
    setEditingGroup(null)
    setFormError(null)
  }

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = formValues.name.trim()
    if (!trimmedName) {
      setFormError('请输入分组名称')
      return
    }
    const parentId =
      formValues.parentId && formValues.parentId !== NO_PARENT_GROUP_VALUE
        ? Number(formValues.parentId)
        : null
    const trimmedDesc = formValues.description.trim()

    setSubmitting(true)
    setFormError(null)
    try {
      if (formMode === 'create') {
        await createDeviceGroup({
          name: trimmedName,
          ...(trimmedDesc ? { description: trimmedDesc } : {}),
          parent_id: parentId,
        })
        toast.success('设备分组已创建')
      } else if (formMode === 'edit' && editingGroup) {
        await updateDeviceGroup(editingGroup.id, {
          name: trimmedName,
          description: trimmedDesc || null,
          parent_id: parentId,
        })
        toast.success('设备分组已更新')
      }
      closeForm()
      await invalidateGroupCaches()
    } catch (err) {
      setFormError(getErrorMessage(err, '保存设备分组失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestDelete = async (group: DeviceGroupItem) => {
    const hasChildren = (childCountMap.get(group.id) ?? 0) > 0
    if (group.device_count > 0 || hasChildren) {
      setDeletingGroup(group)
      setFormMode(null)
      return
    }

    setDeleting(true)
    try {
      await deleteDeviceGroup(group.id, 'reject')
      toast.success(`已删除分组「${group.name}」`)
      await invalidateGroupCaches()
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setDeletingGroup(group)
        setFormMode(null)
      } else {
        toast.error(getErrorMessage(err, '删除设备分组失败'))
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleConfirmUnassignDelete = async () => {
    if (!deletingGroup) return
    setDeleting(true)
    try {
      await deleteDeviceGroup(deletingGroup.id, 'unassign')
      toast.success(`已将设备移至未分组并删除「${deletingGroup.name}」`)
      setDeletingGroup(null)
      await invalidateGroupCaches()
    } catch (err) {
      toast.error(getErrorMessage(err, '删除设备分组失败'))
    } finally {
      setDeleting(false)
    }
  }

  return {
    groups,
    flatNodes,
    childCountMap,
    parentOptions,
    isLoading,
    isError,
    errorMessage: error instanceof Error ? error.message : '加载分组列表失败',
    formMode,
    formValues,
    formError,
    submitting,
    deletingGroup,
    deleting,
    setFormValues,
    setDeletingGroup,
    refetch,
    openCreateForm,
    openEditForm,
    closeForm,
    handleFormSubmit,
    handleRequestDelete,
    handleConfirmUnassignDelete,
  }
}
