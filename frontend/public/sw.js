// Service Worker for PWA offline functionality
const STATIC_CACHE = 'static-cache-v1'
const DYNAMIC_CACHE = 'dynamic-cache-v1'

// 静态资源列表
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/dashboard/devices',
  '/dashboard/monitoring',
  '/dashboard/alerts',
  '/dashboard/inspection',
  '/dashboard/reports',
  '/dashboard/settings',
  '/manifest.json',
  // 添加关键CSS和JS文件
  '/_next/static/css/',
  '/_next/static/js/',
]

// 动态缓存的API端点
const CACHE_API_ENDPOINTS = [
  '/api/devices',
  '/api/dashboard/stats',
  '/api/monitoring/metrics',
  '/api/alerts',
]

// 安装事件 - 缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully')
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error)
      })
  )
})

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...')
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => {
        console.log('[SW] Service worker activated')
        return self.clients.claim()
      })
  )
})

// 拦截请求 - 缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event

  // 跳过非HTTP(S)请求
  if (request.url.startsWith('chrome-extension://') || 
      !request.url.startsWith('http')) {
    return
  }

  // 静态资源 - Cache First
  if (isStaticAsset(request.url)) {
    event.respondWith(cacheFirstStrategy(request))
    return
  }

  // API请求 - Network First
  if (isAPIRequest(request.url)) {
    event.respondWith(networkFirstStrategy(request))
    return
  }

  // HTML文档 - Stale While Revalidate
  if (request.destination === 'document') {
    event.respondWith(staleWhileRevalidateStrategy(request))
    return
  }

  // 默认策略 - Network First
  event.respondWith(networkFirstStrategy(request))
})

// 判断是否为静态资源
function isStaticAsset(url) {
  return url.includes('/_next/static/') ||
         url.includes('.js') ||
         url.includes('.css') ||
         url.includes('.png') ||
         url.includes('.jpg') ||
         url.includes('.svg') ||
         url.includes('.ico')
}

// 判断是否为API请求
function isAPIRequest(url) {
  return url.includes('/api/') ||
         CACHE_API_ENDPOINTS.some(endpoint => url.includes(endpoint))
}

// Cache First 策略 - 优先使用缓存
async function cacheFirstStrategy(request) {
  try {
    const cache = await caches.open(STATIC_CACHE)
    const cachedResponse = await cache.match(request)
    
    if (cachedResponse) {
      return cachedResponse
    }
    
    const networkResponse = await fetch(request)
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.error('[SW] Cache first strategy failed:', error)
    return new Response('Offline content not available', { 
      status: 503,
      statusText: 'Service Unavailable' 
    })
  }
}

// Network First 策略 - 优先使用网络
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request)
    
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', error)
    
    const cache = await caches.open(DYNAMIC_CACHE)
    const cachedResponse = await cache.match(request)
    
    if (cachedResponse) {
      return cachedResponse
    }
    
    // 返回离线页面
    if (request.destination === 'document') {
      return caches.match('/offline.html')
    }
    
    return new Response(JSON.stringify({ 
      error: 'Network unavailable',
      message: '网络连接不可用，请检查您的网络设置'
    }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// Stale While Revalidate 策略 - 返回缓存同时更新
async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(DYNAMIC_CACHE)
  const cachedResponse = await cache.match(request)
  
  // 后台更新缓存
  const networkResponsePromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  }).catch((error) => {
    console.log('[SW] Background update failed:', error)
  })
  
  // 如果有缓存，立即返回
  if (cachedResponse) {
    return cachedResponse
  }
  
  // 否则等待网络响应
  return networkResponsePromise || new Response('Page not available offline', {
    status: 503,
    statusText: 'Service Unavailable'
  })
}

// 处理消息
self.addEventListener('message', (event) => {
  const { type } = event.data
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break
      
    case 'GET_CACHE_INFO':
      getCacheInfo().then(info => {
        event.ports[0].postMessage(info)
      })
      break
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(success => {
        event.ports[0].postMessage({ success })
      })
      break
      
    default:
      console.log('[SW] Unknown message type:', type)
  }
})

// 获取缓存信息
async function getCacheInfo() {
  const cacheNames = await caches.keys()
  const cacheInfo = []
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    cacheInfo.push({
      name: cacheName,
      size: keys.length
    })
  }
  
  return cacheInfo
}

// 清理所有缓存
async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)))
    return true
  } catch (error) {
    console.error('[SW] Failed to clear caches:', error)
    return false
  }
}

// 后台同步
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag)
  
  if (event.tag === 'sync-offline-actions') {
    event.waitUntil(syncOfflineActions())
  }
})

// 同步离线操作
async function syncOfflineActions() {
  try {
    // 获取离线操作队列
    const offlineActions = await getOfflineActions()
    
    for (const action of offlineActions) {
      try {
        const response = await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body
        })
        
        if (response.ok) {
          await removeOfflineAction(action.id)
          console.log('[SW] Offline action synced:', action.id)
        }
      } catch (error) {
        console.error('[SW] Failed to sync offline action:', error)
      }
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error)
  }
}

// 获取离线操作（从IndexedDB或localStorage）
async function getOfflineActions() {
  // 这里应该从IndexedDB获取，暂时返回空数组
  return []
}

// 移除已同步的离线操作
async function removeOfflineAction(actionId) {
  // 这里应该从IndexedDB移除，暂时忽略
  console.log('[SW] Removing offline action:', actionId)
}

// 推送通知
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event)
  
  const options = {
    body: event.data ? event.data.text() : '您有新的消息',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'view',
        title: '查看',
        icon: '/icons/view-icon.png'
      },
      {
        action: 'close',
        title: '关闭',
        icon: '/icons/close-icon.png'
      }
    ]
  }
  
  event.waitUntil(
    self.registration.showNotification('网络设备巡检系统', options)
  )
})

// 通知点击
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event)
  
  event.notification.close()
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/dashboard')
    )
  } else if (event.action === 'close') {
    // 关闭通知，不做其他操作
    return
  } else {
    // 默认操作 - 打开应用
    event.waitUntil(
      clients.matchAll().then((clients) => {
        const client = clients.find(c => c.visibilityState === 'visible')
        if (client) {
          client.navigate('/dashboard')
          client.focus()
        } else {
          clients.openWindow('/dashboard')
        }
      })
    )
  }
})

console.log('[SW] Service Worker loaded successfully')
