/* eslint-disable no-console */
/**
 * 用于定位 Windows 环境下 next build 的 `spawn EPERM`：在 Node 启动时注入该文件，
 * 记录所有 child_process 的 spawn/fork/execFile 调用参数与错误。
 *
 * 使用方式（PowerShell）：
 *   $env:NODE_OPTIONS="--require ./scripts/trace-spawn.cjs"
 *   pnpm exec next build --no-lint
 */

const childProcess = require('child_process')

const safeJson = (value) => {
  try {
    return JSON.stringify(value)
  } catch {
    return '"<unserializable>"'
  }
}

const wrap = (name, fn) => {
  return function wrapped(...args) {
    const [command, argv, options] = args
    const argvPreview = Array.isArray(argv) ? argv.join(' ') : argv
    const optPreview = options ? safeJson({
      cwd: options.cwd,
      shell: options.shell,
      windowsHide: options.windowsHide,
      detached: options.detached,
      stdio: options.stdio,
    }) : 'null'
    console.error(`[trace-spawn] ${name}:`, command, argvPreview ?? '', optPreview)

    let child
    try {
      child = fn.apply(this, args)
    } catch (err) {
      console.error(`[trace-spawn] ${name} threw:`, command, err && err.code, err && err.message)
      if (err && err.stack) {
        console.error(err.stack)
      }
      throw err
    }
    if (child && typeof child.on === 'function') {
      child.on('error', (err) => {
        console.error(`[trace-spawn] ${name} error:`, command, err && err.code, err && err.message)
      })
    }
    return child
  }
}

childProcess.spawn = wrap('spawn', childProcess.spawn)
childProcess.execFile = wrap('execFile', childProcess.execFile)
childProcess.fork = wrap('fork', childProcess.fork)
