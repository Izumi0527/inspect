import type { DeviceGroupItem } from '../types'

export const MAX_DEVICE_GROUP_DEPTH = 3

export interface DeviceGroupTreeNode {
  group: DeviceGroupItem
  depth: number
  pathLabel: string
  children: DeviceGroupTreeNode[]
}

export interface SelectableParentOption {
  group: DeviceGroupItem
  depth: number
  pathLabel: string
}

export function buildGroupLookup(groups: DeviceGroupItem[]): {
  byId: Map<number, DeviceGroupItem>
  childrenByParent: Map<number | null, DeviceGroupItem[]>
} {
  const byId = new Map<number, DeviceGroupItem>()
  const childrenByParent = new Map<number | null, DeviceGroupItem[]>()

  for (const group of groups) {
    byId.set(group.id, group)
  }

  for (const group of groups) {
    const parentKey =
      group.parent_id !== null && byId.has(group.parent_id) && group.parent_id !== group.id
        ? group.parent_id
        : null
    const list = childrenByParent.get(parentKey) ?? []
    list.push(group)
    childrenByParent.set(parentKey, list)
  }

  return { byId, childrenByParent }
}

export function getGroupDepth(groupId: number, byId: Map<number, DeviceGroupItem>): number {
  let depth = 0
  let currentId: number | null = groupId
  const visited = new Set<number>()

  while (currentId !== null && !visited.has(currentId)) {
    const current = byId.get(currentId)
    if (!current) break
    visited.add(currentId)
    depth += 1
    currentId = current.parent_id
  }

  return depth
}

export function getSubtreeHeight(
  groupId: number,
  childrenByParent: Map<number | null, DeviceGroupItem[]>,
  visited: Set<number> = new Set(),
): number {
  if (visited.has(groupId)) return 0
  const nextVisited = new Set(visited)
  nextVisited.add(groupId)

  const children = childrenByParent.get(groupId) ?? []
  if (children.length === 0) return 1

  let maxChildHeight = 0
  for (const child of children) {
    maxChildHeight = Math.max(
      maxChildHeight,
      getSubtreeHeight(child.id, childrenByParent, nextVisited),
    )
  }
  return 1 + maxChildHeight
}

export function getDescendantIds(
  groupId: number,
  childrenByParent: Map<number | null, DeviceGroupItem[]>,
): Set<number> {
  const descendants = new Set<number>()
  const queue = [...(childrenByParent.get(groupId) ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || descendants.has(current.id)) continue
    descendants.add(current.id)
    const children = childrenByParent.get(current.id) ?? []
    queue.push(...children)
  }

  return descendants
}

export function buildDeviceGroupTree(groups: DeviceGroupItem[]): DeviceGroupTreeNode[] {
  const { childrenByParent } = buildGroupLookup(groups)

  const buildNodes = (
    parentId: number | null,
    depth: number,
    prefix: string,
    visited: Set<number>,
  ): DeviceGroupTreeNode[] => {
    const list = childrenByParent.get(parentId) ?? []
    return list
      .filter((item) => !visited.has(item.id))
      .map((item) => {
        const nextVisited = new Set(visited)
        nextVisited.add(item.id)
        const pathLabel = prefix ? `${prefix} / ${item.name}` : item.name
        return {
          group: item,
          depth,
          pathLabel,
          children: buildNodes(item.id, depth + 1, pathLabel, nextVisited),
        }
      })
  }

  return buildNodes(null, 1, '', new Set())
}

export function flattenDeviceGroupTree(nodes: DeviceGroupTreeNode[]): DeviceGroupTreeNode[] {
  const result: DeviceGroupTreeNode[] = []
  const visit = (items: DeviceGroupTreeNode[]) => {
    for (const node of items) {
      result.push(node)
      if (node.children.length > 0) {
        visit(node.children)
      }
    }
  }
  visit(nodes)
  return result
}

export function getSelectableParentGroups(
  groups: DeviceGroupItem[],
  editingGroupId: number | null,
): SelectableParentOption[] {
  const { byId, childrenByParent } = buildGroupLookup(groups)
  const flatTree = flattenDeviceGroupTree(buildDeviceGroupTree(groups))

  const excludedIds = new Set<number>()
  let requiredHeight = 1

  if (editingGroupId !== null && byId.has(editingGroupId)) {
    excludedIds.add(editingGroupId)
    for (const id of getDescendantIds(editingGroupId, childrenByParent)) {
      excludedIds.add(id)
    }
    requiredHeight = getSubtreeHeight(editingGroupId, childrenByParent)
  }

  return flatTree
    .filter((node) => {
      if (excludedIds.has(node.group.id)) return false
      return node.depth + requiredHeight <= MAX_DEVICE_GROUP_DEPTH
    })
    .map((node) => ({
      group: node.group,
      depth: node.depth,
      pathLabel: node.pathLabel,
    }))
}
