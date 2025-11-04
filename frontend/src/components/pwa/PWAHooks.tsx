'use client'

import { useCallback, useEffect, useState } from 'react'
import { useNotifications } from '../feedback/FeedbackSystem'

type InstallPromptOutcome = 'accepted' | 'dismissed'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: InstallPromptOutcome; platform: string }>
  prompt: () => Promise<void>
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

// PWA 安装状态类型
interface PWAInstallState {
  isInstallable: boolean
  isInstalled: boolean
  canInstall: boolean
  installPrompt: BeforeInstallPromptEvent | null
}

// PWA Hook
export const usePWA = () => {
  const [pwaState, setPwaState] = useState<PWAInstallState>({
    isInstallable: false,
    isInstalled: false,
    canInstall: false,
    installPrompt: null
  })

  const notifications = useNotifications()

  useEffect(() => {
    // 检查是否已安装
    const checkIfInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      const navigatorWithStandalone = window.navigator as NavigatorWithStandalone
      return isStandalone || navigatorWithStandalone.standalone === true
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      setPwaState(prev => ({
        ...prev,
        isInstallable: true,
        canInstall: true,
        installPrompt: promptEvent
      }))
    }

    // 监听应用安装事件
    const handleAppInstalled = () => {
      setPwaState(prev => ({
        ...prev,
        isInstalled: true,
        canInstall: false,
        installPrompt: null
      }))
      notifications.success('安装成功', 'PWA应用已成功安装到您的设备')
    }

    // 初始化状态
    setPwaState(prev => ({
      ...prev,
      isInstalled: checkIfInstalled()
    }))

    // 添加事件监听器
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // 清理
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [notifications])

  // 安装 PWA
  const installPWA = async () => {
    if (!pwaState.installPrompt) return false

    try {
      await pwaState.installPrompt.prompt()
      const choiceResult = await pwaState.installPrompt.userChoice

      if (choiceResult.outcome === 'accepted') {
        setPwaState(prev => ({
          ...prev,
          canInstall: false,
          installPrompt: null
        }))
        return true
      }
      return false
    } catch (error) {
      console.error('PWA installation failed:', error)
      notifications.error('安装失败', '无法安装PWA应用，请稍后重试')
      return false
    }
  }

  return {
    ...pwaState,
    installPWA
  }
}

// 离线状态Hook
export const useOfflineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)
  const notifications = useNotifications()

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (wasOffline) {
        notifications.success('网络已恢复', '您的网络连接已恢复正常')
        setWasOffline(false)
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      setWasOffline(true)
      notifications.warning('网络连接断开', '您当前处于离线状态，部分功能可能无法使用')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [wasOffline, notifications])

  return { isOnline, wasOffline }
}


// Service Worker Hook
export const useServiceWorker = () => {
  const [isSupported, setIsSupported] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [hasUpdate, setHasUpdate] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState<ServiceWorkerRegistration | null>(null)

  const notifications = useNotifications()

  const applyUpdate = useCallback(async () => {
    const available = updateAvailable
    if (!available) return

    const newWorker = available.waiting
    if (newWorker) {
      newWorker.postMessage({ type: 'SKIP_WAITING' })
      window.location.reload()
    }
  }, [updateAvailable])

  const registerServiceWorker = useCallback(async () => {
    try {
      const registrationResult = await navigator.serviceWorker.register('/sw.js')
      setIsRegistered(true)
      setRegistration(registrationResult)

      registrationResult.addEventListener('updatefound', () => {
        const newWorker = registrationResult.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setHasUpdate(true)
            setUpdateAvailable(registrationResult)
            notifications.info('有新版本可用', '发现新版本，点击更新以获得最佳体验', {
              persistent: true,
              action: {
                label: '立即更新',
                onClick: () => void applyUpdate(),
              },
            })
          }
        })
      })
    } catch (error) {
      console.error('Service Worker registration failed:', error)
    }
  }, [applyUpdate, notifications])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      setIsSupported(true)
      registerServiceWorker()
    }
  }, [registerServiceWorker])

  const unregisterServiceWorker = useCallback(async () => {
    if (!registration) return false

    const result = await registration.unregister()
    if (result) {
      setIsRegistered(false)
      setRegistration(null)
    }
    return result
  }, [registration])

  return {
    isSupported,
    isRegistered,
    registration,
    hasUpdate,
    updateAvailable,
    applyUpdate,
    unregisterServiceWorker,
  }
}

// PWA 安装提示组件
// PWA 安装提示组件
export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, canInstall, installPWA } = usePWA()
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    // 延迟显示安装提示，避免干扰初始用户体验
    if (isInstallable && canInstall) {
      const timer = setTimeout(() => {
        setShowPrompt(true)
      }, 10000) // 10秒后显示

      return () => clearTimeout(timer)
    }
  }, [isInstallable, canInstall])

  if (!showPrompt) return null

  const handleInstall = async () => {
    const success = await installPWA()
    if (success) {
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // 24小时内不再显示
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  // 检查是否在24小时内被忽略
  const dismissedTime = localStorage.getItem('pwa-install-dismissed')
  if (dismissedTime && Date.now() - parseInt(dismissedTime) < 24 * 60 * 60 * 1000) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:w-80 bg-white rounded-lg shadow-lg border p-4 z-50">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">安装应用到设备</h3>
          <p className="text-sm text-gray-600 mb-3">
            将巡检系统安装到您的设备，获得更好的使用体验
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={handleInstall}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              立即安装
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors"
            >
              暂不安装
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 离线状态指示器
export const OfflineIndicator: React.FC = () => {
  const { isOnline } = useOfflineStatus()

  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-white text-center py-2 px-4 text-sm font-medium z-50">
      <div className="flex items-center justify-center gap-2">
        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
        您当前处于离线状态，部分功能可能无法使用
      </div>
    </div>
  )
}