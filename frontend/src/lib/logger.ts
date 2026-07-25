/**
 * 前端统一日志服务
 * 支持不同环境的日志级别控制和输出方式
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  requestId?: string;
}

class Logger {
  private currentLevel: LogLevel;
  private isDevelopment: boolean;
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // 最多保存1000条日志

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    // 开发环境显示所有日志，生产环境只显示错误
    this.currentLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.ERROR;
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * 创建带模块名的日志记录器
   */
  createModuleLogger(module: string) {
    return {
      debug: (message: string, data?: unknown) => this.log(LogLevel.DEBUG, module, message, data),
      info: (message: string, data?: unknown) => this.log(LogLevel.INFO, module, message, data),
      warn: (message: string, data?: unknown) => this.log(LogLevel.WARN, module, message, data),
      error: (message: string, data?: unknown) => this.log(LogLevel.ERROR, module, message, data),
    };
  }

  /**
   * 核心日志记录方法
   */
  private log(level: LogLevel, module: string, message: string, data?: unknown) {
    if (level < this.currentLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const entry: LogEntry = {
      timestamp,
      level,
      module,
      message,
      data,
    };

    // 添加请求ID（如果存在）
    const requestId = this.getCurrentRequestId();
    if (requestId) {
      entry.requestId = requestId;
    }

    // 保存到内存中
    this.addLogEntry(entry);

    // 输出到控制台
    this.outputToConsole(entry);

    // 远程上报：当前为 no-op（后端端点未实现，避免静默 404）
    this.sendToRemote(entry);
  }

  /**
   * 添加日志条目到内存
   */
  private addLogEntry(entry: LogEntry) {
    this.logs.push(entry);

    // 保持日志数量在限制内
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  /**
   * 输出到浏览器控制台
   */
  private outputToConsole(entry: LogEntry) {
    const { timestamp, level, module, message, data, requestId } = entry;
    const timeStr = new Date(timestamp).toLocaleTimeString();
    const prefix = `[${timeStr}] [${LogLevel[level]}] [${module}]`;
    const fullMessage = requestId ? `${prefix} [${requestId}] ${message}` : `${prefix} ${message}`;

    switch (level) {
      case LogLevel.DEBUG:
        if (data) {
          console.debug(fullMessage, data);
        } else {
          console.debug(fullMessage);
        }
        break;
      case LogLevel.INFO:
        if (data) {
          console.info(fullMessage, data);
        } else {
          console.info(fullMessage);
        }
        break;
      case LogLevel.WARN:
        if (data) {
          console.warn(fullMessage, data);
        } else {
          console.warn(fullMessage);
        }
        break;
      case LogLevel.ERROR:
        if (data) {
          console.error(fullMessage, data);
        } else {
          console.error(fullMessage);
        }
        break;
    }
  }

  /**
   * 发送到远程日志服务
   */
  private async sendToRemote(_entry: LogEntry) {
    // 远程上报端点 /api/v1/logs/frontend 后端未实现，此前在生产环境会产生静默 404。
    // 暂移除远程上报，仅保留控制台与内存日志。如需前端遥测，应接入专门的可观测平台，
    // 或新增带限流/字段白名单/脱敏的后端摄取端点（见整改文档 P3-2 方案 A）。
  }

  /**
   * 获取当前请求ID（从存储中）
   */
  private getCurrentRequestId(): string | undefined {
    try {
      return sessionStorage.getItem('currentRequestId') || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 设置当前请求ID
   */
  setRequestId(requestId: string) {
    try {
      sessionStorage.setItem('currentRequestId', requestId);
    } catch {
      // 忽略存储失败
    }
  }

  /**
   * 清除当前请求ID
   */
  clearRequestId() {
    try {
      sessionStorage.removeItem('currentRequestId');
    } catch {
      // 忽略存储失败
    }
  }

  /**
   * 获取所有日志条目
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * 清除所有日志
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * 导出日志到文件
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * 记录性能指标
   */
  logPerformance(name: string, duration: number, details?: unknown) {
    this.log(LogLevel.INFO, 'performance', `${name} took ${duration}ms`, details);
  }

  /**
   * 记录用户操作
   */
  logUserAction(action: string, details?: unknown) {
    this.log(LogLevel.INFO, 'user_action', action, details);
  }

  /**
   * 记录API调用
   */
  logApiCall(method: string, url: string, status: number, duration: number, details?: unknown) {
    const level = status >= 400 ? LogLevel.ERROR : LogLevel.DEBUG;
    this.log(level, 'api', `${method} ${url} ${status} (${duration}ms)`, details);
  }
}

// 创建全局日志实例
const logger = new Logger();

// 导出便捷方法
export const createLogger = (module: string) => logger.createModuleLogger(module);
export const setLogLevel = (level: LogLevel) => logger.setLevel(level);
export const setRequestId = (id: string) => logger.setRequestId(id);
export const clearRequestId = () => logger.clearRequestId();
export const getLogs = () => logger.getLogs();
export const clearLogs = () => logger.clearLogs();
export const exportLogs = () => logger.exportLogs();
export const logPerformance = (name: string, duration: number, details?: unknown) =>
  logger.logPerformance(name, duration, details);
export const logUserAction = (action: string, details?: unknown) =>
  logger.logUserAction(action, details);
export const logApiCall = (method: string, url: string, status: number, duration: number, details?: unknown) =>
  logger.logApiCall(method, url, status, duration, details);

export default logger;