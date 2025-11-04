// 代码分割配置工具
export const createChunkName = (featureName: string, componentName?: string) => {
  return componentName ? `${featureName}-${componentName}` : featureName
}

// 动态导入工具
export const dynamicImport = <T = unknown>(
  importFn: () => Promise<{ default: T }>,
  options?: {
    chunkName?: string
    retries?: number
    fallback?: T
  }
): Promise<T> => {
  const { retries = 3, fallback } = options || {}
  
  let attempt = 0
  
  const tryImport = async (): Promise<T> => {
    try {
      const loadedModule = await importFn()
      return loadedModule.default
    } catch (error) {
      attempt++
      
      if (attempt <= retries) {
        // 指数退避重试
        const delay = Math.pow(2, attempt - 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        return tryImport()
      }
      
      if (typeof fallback !== 'undefined') {
        console.warn('Dynamic import failed, using fallback:', error)
        return fallback
      }
      
      throw error
    }
  }
  
  return tryImport()
}

// 特性检测和polyfill加载
export const loadPolyfillIfNeeded = async (
  featureName: string,
  polyfillImport: () => Promise<unknown>
) => {
  // 检查特性是否已存在
  const featureChecks: Record<string, () => boolean> = {
    'IntersectionObserver': () => 'IntersectionObserver' in window,
    'ResizeObserver': () => 'ResizeObserver' in window,
    'requestIdleCallback': () => 'requestIdleCallback' in window,
    'fetch': () => 'fetch' in window,
    'AbortController': () => 'AbortController' in window,
    'WebGL': () => {
      try {
        const canvas = document.createElement('canvas')
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      } catch {
        return false
      }
    }
  }
  
  const check = featureChecks[featureName]
  if (check && !check()) {
    try {
      await polyfillImport()
      console.log(`Polyfill loaded for: ${featureName}`)
    } catch (error) {
      console.warn(`Failed to load polyfill for ${featureName}:`, error)
    }
  }
}

// 模块缓存管理
class ModuleCache {
  private cache = new Map<string, Promise<unknown>>()

  get<T>(key: string, importFn: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) {
      return this.cache.get(key)! as Promise<T>
    }

    const promise = importFn()
    this.cache.set(key, promise)

    return promise
  }
  
  clear(key?: string) {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }
  
  size() {
    return this.cache.size
  }
}

export const moduleCache = new ModuleCache()

// 预加载策略
export const preloadStrategy = {
  // 鼠标悬停预加载
  onHover: (importFn: () => Promise<unknown>, delay: number = 100) => {
    let timeoutId: NodeJS.Timeout | null = null
    
    return {
      onMouseEnter: () => {
        timeoutId = setTimeout(() => {
          importFn().catch(error => {
            console.warn('Preload on hover failed:', error)
          })
        }, delay)
      },
      onMouseLeave: () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
      }
    }
  },
  
  // 可见区域预加载
  onVisible: (
    importFn: () => Promise<unknown>,
    options?: IntersectionObserverInit
  ) => {
    return (element: HTMLElement | null) => {
      if (!element || !('IntersectionObserver' in window)) return
      
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              importFn().catch(error => {
                console.warn('Preload on visible failed:', error)
              })
              observer.unobserve(entry.target)
            }
          })
        },
        { threshold: 0.1, ...options }
      )
      
      observer.observe(element)
      
      return () => observer.disconnect()
    }
  },
  
  // 空闲时预加载
  onIdle: (importFn: () => Promise<unknown>, timeout: number = 2000) => {
    const preload = () => {
      importFn().catch(error => {
        console.warn('Preload on idle failed:', error)
      })
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
    }

    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(preload, { timeout })
    } else {
      setTimeout(preload, 1)
    }
  }
}

// Bundle 分析工具
export const bundleAnalyzer = {
  // 记录模块加载时间
  logModuleLoadTime: (moduleName: string, startTime: number) => {
    const loadTime = performance.now() - startTime
    console.log(`[Bundle] ${moduleName} loaded in ${loadTime.toFixed(2)}ms`)
    
    // 发送到分析服务（如果需要）
    if (process.env.NODE_ENV === 'production' && window.gtag) {
      window.gtag('event', 'module_load_time', {
        event_category: 'performance',
        event_label: moduleName,
        value: Math.round(loadTime)
      })
    }
  },
  
  // 检查chunk大小
  checkChunkSize: (chunkName: string, threshold: number = 244 * 1024) => {
    // 这个函数在生产环境中需要配合webpack插件使用
    if (process.env.NODE_ENV === 'development') {
      const thresholdInKb = Math.round(threshold / 1024)
      console.log(`[Bundle] Checking chunk size for: ${chunkName} (limit: ${thresholdInKb} KB)`)
    }
  }
}

// 关键资源提示
export const resourceHints = {
  // 预连接到外部域名
  preconnect: (domains: string[]) => {
    domains.forEach(domain => {
      const link = document.createElement('link')
      link.rel = 'preconnect'
      link.href = domain
      document.head.appendChild(link)
    })
  },
  
  // DNS预解析
  dnsPrefetch: (domains: string[]) => {
    domains.forEach(domain => {
      const link = document.createElement('link')
      link.rel = 'dns-prefetch'
      link.href = domain
      document.head.appendChild(link)
    })
  },
  
  // 预加载关键资源
  preload: (resources: Array<{ href: string; as: string; type?: string }>) => {
    resources.forEach(({ href, as, type }) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.href = href
      link.as = as
      if (type) link.type = type
      document.head.appendChild(link)
    })
  }
}
