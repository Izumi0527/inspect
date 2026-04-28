/**
 * HTTP 拦截器 - 自动记录所有API请求和响应
 * 为所有HTTP请求添加日志记录和性能监控
 */

import { createLogger, setRequestId, clearRequestId, logApiCall } from '../lib/logger';
import { TokenManager } from '../lib/api-client';

const logger = createLogger('http_interceptor');

export interface RequestConfig {
  url: string;
  method: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  requestId?: string;
}

export interface ResponseInfo {
  status: number;
  statusText: string;
  headers: Headers;
  url: string;
  redirected: boolean;
}

export interface InterceptorHooks {
  onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  onResponse?: (response: Response, config: RequestConfig, duration: number) => Response | Promise<Response>;
  onError?: (error: Error, config: RequestConfig, duration: number) => void | Promise<void>;
}

class HttpInterceptor {
  private originalFetch: typeof fetch | null = null;
  private hooks: InterceptorHooks = {};
  private requestIdCounter = 0;
  private isInitialized = false;

  constructor() {
    // 延迟初始化，避免在SSR环境中访问window
    // 实际的初始化将在setupInterceptor方法中进行
  }

  /**
   * 检查当前是否在浏览器环境中
   */
  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.fetch !== 'undefined';
  }

  /**
   * 设置拦截器钩子
   */
  setHooks(hooks: InterceptorHooks) {
    this.hooks = { ...this.hooks, ...hooks };
  }

  /**
   * 手动初始化拦截器
   */
  initialize() {
    this.setupInterceptor();
  }

  /**
   * 生成唯一的请求ID
   */
  private generateRequestId(): string {
    const timestamp = Date.now();
    const counter = ++this.requestIdCounter;
    return `req_${timestamp}_${counter}`;
  }

  /**
   * 解析请求配置
   */
  private parseRequestConfig(input: RequestInfo | URL, init?: RequestInit): RequestConfig {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    const headers = init?.headers;
    const body = init?.body;
    const requestId = this.generateRequestId();

    return {
      url,
      method: method.toUpperCase(),
      headers,
      body,
      requestId,
    };
  }

  /**
   * 记录请求开始
   */
  private logRequestStart(config: RequestConfig) {
    logger.debug(`🚀 发起API请求`, {
      method: config.method,
      url: config.url,
      requestId: config.requestId,
      hasBody: !!config.body,
      bodySize: config.body ? this.getBodySize(config.body) : 0,
    });

    // 设置当前请求ID到存储中，供其他模块使用
    if (config.requestId) {
      setRequestId(config.requestId);
    }
  }

  /**
   * 记录请求完成
   */
  private logRequestComplete(response: Response, config: RequestConfig, duration: number) {
    const isSuccess = response.status >= 200 && response.status < 300;
    const logLevel = isSuccess ? 'info' : 'warn';

    logger[logLevel](`${isSuccess ? '✅' : '⚠️'} API请求完成`, {
      method: config.method,
      url: config.url,
      status: response.status,
      statusText: response.statusText,
      duration: Math.round(duration),
      requestId: config.requestId,
      contentLength: response.headers.get('content-length') || 'unknown',
    });

    // 记录到API调用日志中
    logApiCall(config.method, config.url, response.status, Math.round(duration), {
      requestId: config.requestId,
    });

    // 清除请求ID
    clearRequestId();
  }

  /**
   * 记录请求错误
   */
  private logRequestError(error: Error, config: RequestConfig, duration: number) {
    logger.error(`❌ API请求失败`, {
      method: config.method,
      url: config.url,
      error: error.message,
      duration: Math.round(duration),
      requestId: config.requestId,
      stack: error.stack,
    });

    // 清除请求ID
    clearRequestId();
  }

  /**
   * 获取请求体大小
   */
  private getBodySize(body: BodyInit): number {
    if (typeof body === 'string') {
      return body.length;
    }
    if (body instanceof FormData) {
      // FormData 大小估算
      return Array.from(body.entries()).reduce((size, [key, value]) => {
        return size + key.length + (typeof value === 'string' ? value.length : 1000);
      }, 0);
    }
    if (body instanceof ArrayBuffer) {
      return body.byteLength;
    }
    if (body instanceof Blob) {
      return body.size;
    }
    return 0;
  }

  /**
   * 检查是否为API请求（过滤掉静态资源请求）
   */
  private isApiRequest(url: string): boolean {
    // 只记录API请求，忽略静态资源
    return (
      url.includes('/api/') ||
      url.includes('/graphql') ||
      (url.startsWith('http') && !url.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i))
    );
  }

  /**
   * 设置拦截器
   */
  private setupInterceptor() {
    // 检查是否在浏览器环境中
    if (!this.isBrowser()) {
      logger.warn('HTTP拦截器无法在非浏览器环境中初始化');
      return;
    }

    // 初始化原始fetch引用
    if (!this.originalFetch) {
      this.originalFetch = window.fetch.bind(window);
    }

    // 如果已经初始化过，避免重复设置
    if (this.isInitialized) {
      logger.warn('HTTP拦截器已经初始化，跳过重复设置');
      return;
    }

    window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const config = this.parseRequestConfig(input, init);

      // 如果不是API请求，直接使用原始fetch
      if (!this.isApiRequest(config.url) || !this.originalFetch) {
        return this.originalFetch ? this.originalFetch(input, init) : fetch(input, init);
      }

      const startTime = performance.now();

      try {
        // 执行请求前钩子
        let finalConfig = config;
        if (this.hooks.onRequest) {
          finalConfig = await this.hooks.onRequest(config);
        }

        // 记录请求开始
        this.logRequestStart(finalConfig);

        // 获取认证token（使用 TokenManager 统一管理）
        const token = TokenManager.getAccessToken();

        // 调试日志：验证 token 是否获取成功
        if (token) {
          logger.debug('🔑 已获取认证token', {
            requestId: finalConfig.requestId,
            tokenLength: token.length,
            tokenPrefix: token.substring(0, 20) + '...'
          });
        } else {
          logger.warn('⚠️ 未找到认证token', {
            requestId: finalConfig.requestId,
            url: finalConfig.url
          });
        }

        // 更新请求头，添加请求ID和Authorization
        // 注意：必须使用Headers构造函数来正确复制Headers对象
        // 使用spread operator无法正确展开Headers对象（其属性不可枚举）
        const enhancedHeaders = new Headers(init?.headers || {})
        enhancedHeaders.set('X-Request-ID', finalConfig.requestId || '')

        // 添加认证token到请求头
        if (token) {
          enhancedHeaders.set('Authorization', `Bearer ${token}`)
          logger.debug('✅ 已添加 Authorization header', {
            requestId: finalConfig.requestId
          });
        }

        const enhancedInit: RequestInit = {
          ...init,
          headers: enhancedHeaders,
        };

        // 发起实际请求
        const response = await this.originalFetch!(input, enhancedInit);
        const endTime = performance.now();
        const duration = endTime - startTime;

        // 记录请求完成
        this.logRequestComplete(response, finalConfig, duration);

        // 执行响应后钩子
        let finalResponse = response;
        if (this.hooks.onResponse) {
          finalResponse = await this.hooks.onResponse(response, finalConfig, duration);
        }

        return finalResponse;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;

        // 记录请求错误
        this.logRequestError(error as Error, config, duration);

        // 执行错误钩子
        if (this.hooks.onError) {
          await this.hooks.onError(error as Error, config, duration);
        }

        throw error;
      }
    };

    this.isInitialized = true;

    logger.info('HTTP拦截器已激活', {
      originalFetch: typeof this.originalFetch,
      interceptorVersion: '1.0.1',
    });
  }

  /**
   * 恢复原始的fetch函数
   */
  restore() {
    if (!this.isBrowser() || !this.originalFetch) {
      return;
    }

    window.fetch = this.originalFetch;
    this.isInitialized = false;
    logger.info('HTTP拦截器已卸载');
  }

  /**
   * 获取拦截器统计信息
   */
  getStats() {
    const isActive = this.isBrowser() && this.originalFetch
      ? window.fetch !== this.originalFetch
      : false;

    return {
      requestCount: this.requestIdCounter,
      isActive,
      isInitialized: this.isInitialized,
      isBrowser: this.isBrowser(),
    };
  }
}

// 创建全局拦截器实例
const httpInterceptor = new HttpInterceptor();

// 导出便捷方法
export const setInterceptorHooks = (hooks: InterceptorHooks) => httpInterceptor.setHooks(hooks);
export const restoreOriginalFetch = () => httpInterceptor.restore();
export const getInterceptorStats = () => httpInterceptor.getStats();

export default httpInterceptor;
