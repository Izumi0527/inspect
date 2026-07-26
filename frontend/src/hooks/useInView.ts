import { useState, useEffect, useCallback } from 'react'

interface UseInViewOptions {
  /**
   * 触发阈值 (0-1)
   * 0 表示元素刚进入视口就触发
   * 1 表示元素完全进入视口才触发
   * @default 0.1
   */
  threshold?: number | number[]

  /**
   * 视口边距(CSS margin 语法)
   * 例如: '100px 0px' 表示提前 100px 触发
   * @default '0px'
   */
  rootMargin?: string

  /**
   * 是否只触发一次
   * 设为 true 后,元素进入视口后将停止观察
   * @default true
   */
  triggerOnce?: boolean

  /**
   * 自定义根元素
   * 默认为 viewport
   * @default null
   */
  root?: Element | null
}

interface UseInViewReturn {
  /**
   * 需要绑定到目标元素的 ref（callback ref：元素挂载/卸载时触发重新观察）
   */
  ref: (node: HTMLDivElement | null) => void

  /**
   * 元素是否在视口内
   */
  inView: boolean
}

/**
 * 懒加载 Hook - 基于 IntersectionObserver API
 *
 * @description
 * 用于检测元素是否进入视口,常用于图片/组件懒加载
 *
 * 实现说明：必须使用 callback ref + state 保存元素。
 * 若用 RefObject，当组件首帧走"加载骨架"分支（目标元素未渲染）时，
 * effect 已经执行完且依赖不变，后续元素挂载也不会重新 observe，
 * 导致 inView 永远为 false、懒加载内容永远不出现。
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true })
 *
 *   return (
 *     <div ref={ref}>
 *       {inView ? <ExpensiveChart /> : <ChartSkeleton />}
 *     </div>
 *   )
 * }
 * ```
 *
 * @param options - 配置选项
 * @returns { ref, inView } - ref 绑定到目标元素, inView 表示是否在视口内
 */
export function useInView(options: UseInViewOptions = {}): UseInViewReturn {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    triggerOnce = true,
    root = null,
  } = options

  const [inView, setInView] = useState(false)
  const [element, setElement] = useState<HTMLDivElement | null>(null)

  const ref = useCallback((node: HTMLDivElement | null) => {
    setElement(node)
  }, [])

  useEffect(() => {
    if (!element) return

    // 检查浏览器是否支持 IntersectionObserver
    if (typeof IntersectionObserver === 'undefined') {
      console.warn('IntersectionObserver 不支持,直接显示内容')
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const isIntersecting = entry.isIntersecting

          // 更新 inView 状态
          setInView(isIntersecting)

          // 如果只触发一次且已经进入视口,停止观察
          if (isIntersecting && triggerOnce) {
            observer.unobserve(element)
          }
        })
      },
      {
        root,
        rootMargin,
        threshold,
      }
    )

    observer.observe(element)

    // 清理函数
    return () => {
      observer.unobserve(element)
    }
  }, [element, root, rootMargin, threshold, triggerOnce])

  return { ref, inView }
}
