import { Children, Fragment, isValidElement, type ReactNode } from 'react'

/** 忽略未提供、布尔值及空文本；数字零仍是有效内容。 */
export function hasWorkspaceContent(content: ReactNode): boolean {
  return Children.toArray(content).some(child => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) return hasWorkspaceContent(child.props.children)
    return child !== ''
  })
}
