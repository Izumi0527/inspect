import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'
import 'whatwg-fetch' // Polyfill for fetch in testing

// Configure testing library
configure({ testIdAttribute: 'data-testid' })

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      replace: jest.fn(),
      reload: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
    }
  },
}))

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock Next.js Image component
jest.mock('next/image', () => {
  return function Image({ src, alt, ...props }) {
    return <img src={src} alt={alt} {...props} />
  }
})

// Mock framer-motion
jest.mock('framer-motion', () => {
  // 过滤 framer-motion 的专有 props，避免 React 报“未知 DOM 属性”噪音
  // 仅用于测试环境渲染，不影响业务逻辑。
  const stripMotionProps = (props = {}) => {
    const {
      layoutId,
      layout,
      whileHover,
      whileTap,
      whileDrag,
      initial,
      animate,
      exit,
      transition,
      variants,
      drag,
      dragConstraints,
      dragElastic,
      dragMomentum,
      onAnimationStart,
      onAnimationComplete,
      onUpdate,
      ...rest
    } = props
    return rest
  }

  const make = (Tag) =>
    ({ children, ...props }) => <Tag {...stripMotionProps(props)}>{children}</Tag>

  return {
    motion: {
      div: make('div'),
      button: make('button'),
      span: make('span'),
      p: make('p'),
      tr: make('tr'),
      img: make('img'),
      nav: make('nav'),
      aside: make('aside'),
    },
    AnimatePresence: ({ children }) => <>{children}</>,
    useReducedMotion: () => false,
  }
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor(callback, options) {
    this.callback = callback
    this.options = options
  }

  observe() {
    return null
  }

  disconnect() {
    return null
  }

  unobserve() {
    return null
  }
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback
  }

  observe() {
    return null
  }

  disconnect() {
    return null
  }

  unobserve() {
    return null
  }
}

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.localStorage = localStorageMock

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.sessionStorage = sessionStorageMock

// Setup fetch mock
global.fetch = jest.fn()

// Mock window.location
delete window.location
window.location = {
  href: 'http://localhost:13000',
  origin: 'http://localhost:13000',
  protocol: 'http:',
  host: 'localhost:13000',
  hostname: 'localhost',
  port: '13000',
  pathname: '/',
  search: '',
  hash: '',
  assign: jest.fn(),
  replace: jest.fn(),
  reload: jest.fn(),
}

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to ignore specific console methods
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
}

// Setup global test utilities
global.testUtils = {
  // Mock API responses
  mockApiResponse: (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }),
  
  // Create mock props
  createMockProps: (overrides = {}) => ({
    ...overrides,
  }),
  
  // Wait for async operations
  waitFor: (callback, timeout = 1000) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      const check = () => {
        try {
          callback()
          resolve()
        } catch (error) {
          if (Date.now() - startTime >= timeout) {
            reject(error)
          } else {
            setTimeout(check, 10)
          }
        }
      }
      check()
    })
  },
}

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})
