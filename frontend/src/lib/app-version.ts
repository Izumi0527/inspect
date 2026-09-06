/**
 * 全站统一的版本号展示源。
 *
 * 权威源是仓库根 VERSION 文件：构建时经 NEXT_PUBLIC_APP_VERSION 注入
 * （build-installer / upgrade-ubuntu / docker-compose.prod），开发模式由
 * next.config.js 的 resolveAppVersion 回退读取仓库根 VERSION。
 * 页面展示一律 import 本常量，禁止直接读 process.env.NEXT_PUBLIC_APP_VERSION——
 * 未注入时它为 undefined，会出现「vundefined」这类破碎展示，且各处兜底口径不一。
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || '未知'
