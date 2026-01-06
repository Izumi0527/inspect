#!/usr/bin/env python3
"""
服务器启动脚本 - 专门处理 Windows 平台的事件循环问题
"""
import sys
import asyncio
import os
import argparse

# 在导入任何其他模块之前设置事件循环策略
if sys.platform == 'win32':
    # 设置 Windows 事件循环策略
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    # 设置环境变量强制使用 ProactorEventLoop
    os.environ['UVLOOP_DISABLE'] = '1'

def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description='网络设备巡检系统后端服务启动器')
    parser.add_argument('--dev', action='store_true', help='开发模式启动（带热重载）')
    parser.add_argument('--prod', action='store_true', help='生产模式启动')
    parser.add_argument('--port', type=int, default=8000, help='服务端口（默认：8000）')
    parser.add_argument('--host', default='0.0.0.0', help='绑定主机（默认：0.0.0.0）')
    parser.add_argument('--workers', type=int, default=1, help='工作进程数（默认：1）')
    
    args = parser.parse_args()
    
    # 默认为开发模式
    if not args.dev and not args.prod:
        args.dev = True
    
    return args

def main():
    """主启动函数"""
    args = parse_args()
    
    import uvicorn
    from src.core.config import settings
    
    # 确保在 Windows 上使用正确的事件循环
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        print(f"[信息] Windows 平台：使用 ProactorEventLoop 解决文件描述符限制")
    
    # 构建启动参数
    uvicorn_kwargs = {
        "app": "src.main:app",
        "host": args.host,
        "port": args.port,
        "loop": "asyncio",  # 强制使用 asyncio
        "access_log": True,
    }
    
    if args.prod:
        # 生产模式配置
        print(f"[信息] 生产模式启动 - 端口: {args.port}")
        uvicorn_kwargs.update({
            "log_level": "info",
            "use_colors": False,
            "workers": args.workers if sys.platform != 'win32' else 1,  # Windows 强制单进程
        })
    else:
        # 开发模式配置
        print(f"[信息] 开发模式启动 - 端口: {args.port}")
        uvicorn_kwargs.update({
            "reload": True,
            "log_level": "debug",
            "use_colors": True,
        })
    
    # Windows 特殊配置
    if sys.platform == 'win32':
        uvicorn_kwargs["workers"] = 1  # Windows 上强制使用单进程
        print(f"[信息] Windows 优化：单进程模式，连接池大小已调整")
    
    # 启动服务器
    try:
        uvicorn.run(**uvicorn_kwargs)
    except KeyboardInterrupt:
        print("\n[信息] 服务已停止")
    except Exception as e:
        print(f"[错误] 服务启动失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()