"""
巡检脚本执行框架

提供灵活的脚本化巡检能力，支持Python脚本、Shell脚本、PowerShell脚本等。
支持脚本模板、参数传递、安全执行、超时控制等功能。
"""

import asyncio
import os
import sys
import tempfile
import subprocess
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, timezone
from pathlib import Path
import structlog
import json

logger = structlog.get_logger()


class ScriptType(Enum):
    """脚本类型"""
    PYTHON = "python"
    SHELL = "shell"
    POWERSHELL = "powershell"
    BATCH = "batch"
    JAVASCRIPT = "javascript"


class ScriptExecMode(Enum):
    """脚本执行模式"""
    SYNC = "sync"           # 同步执行
    ASYNC = "async"         # 异步执行
    BACKGROUND = "background"  # 后台执行


@dataclass
class ScriptContext:
    """脚本执行上下文"""
    device_id: int
    device_name: str
    ip_address: str
    device_type: str
    credentials: Dict[str, Any] = field(default_factory=dict)
    custom_vars: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScriptTemplate:
    """脚本模板"""
    id: str
    name: str
    description: str
    script_type: ScriptType
    content: str
    parameters: List[Dict[str, Any]] = field(default_factory=list)
    timeout: float = 300.0  # 5分钟默认超时
    requires_credentials: bool = False
    tags: List[str] = field(default_factory=list)
    version: str = "1.0"
    author: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class ScriptExecution:
    """脚本执行信息"""
    id: str
    script_id: str
    context: ScriptContext
    parameters: Dict[str, Any]
    exec_mode: ScriptExecMode = ScriptExecMode.SYNC
    timeout: float = 300.0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    status: str = "pending"
    exit_code: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    result_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class ScriptSandbox:
    """脚本安全沙箱"""
    
    def __init__(self, max_memory_mb: int = 256, max_cpu_time: float = 300.0):
        self.max_memory_mb = max_memory_mb
        self.max_cpu_time = max_cpu_time
        self.temp_dir = Path(tempfile.mkdtemp(prefix="inspect_scripts_"))
        self.logger = logger.bind(component="script_sandbox")
    
    def __del__(self):
        """清理临时目录"""
        try:
            import shutil
            shutil.rmtree(self.temp_dir)
        except:
            pass
    
    def create_temp_script(self, script_content: str, script_type: ScriptType) -> Path:
        """创建临时脚本文件"""
        extensions = {
            ScriptType.PYTHON: ".py",
            ScriptType.SHELL: ".sh",
            ScriptType.POWERSHELL: ".ps1",
            ScriptType.BATCH: ".bat",
            ScriptType.JAVASCRIPT: ".js"
        }
        
        extension = extensions.get(script_type, ".txt")
        script_file = self.temp_dir / f"script_{datetime.now().timestamp()}{extension}"
        
        with open(script_file, 'w', encoding='utf-8') as f:
            f.write(script_content)
        
        # 为shell脚本设置执行权限
        if script_type == ScriptType.SHELL:
            os.chmod(script_file, 0o755)
        
        return script_file
    
    def get_execution_command(
        self, 
        script_file: Path, 
        script_type: ScriptType,
        parameters: Dict[str, Any]
    ) -> List[str]:
        """获取脚本执行命令"""
        if script_type == ScriptType.PYTHON:
            cmd = [sys.executable, str(script_file)]
        elif script_type == ScriptType.SHELL:
            cmd = ["/bin/bash", str(script_file)]
        elif script_type == ScriptType.POWERSHELL:
            cmd = ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(script_file)]
        elif script_type == ScriptType.BATCH:
            cmd = ["cmd", "/c", str(script_file)]
        elif script_type == ScriptType.JAVASCRIPT:
            cmd = ["node", str(script_file)]
        else:
            raise ValueError(f"不支持的脚本类型: {script_type}")
        
        # 添加参数
        for key, value in parameters.items():
            if isinstance(value, (str, int, float)):
                cmd.extend([f"--{key}", str(value)])
        
        return cmd


class ScriptExecutor:
    """脚本执行器"""
    
    def __init__(self):
        self.sandbox = ScriptSandbox()
        self.running_executions: Dict[str, subprocess.Popen] = {}
        self.logger = logger.bind(component="script_executor")
        
        # 内置脚本模板
        self.builtin_templates = self._load_builtin_templates()
    
    async def execute_script(
        self, 
        template: ScriptTemplate, 
        context: ScriptContext,
        parameters: Dict[str, Any] = None,
        exec_mode: ScriptExecMode = ScriptExecMode.SYNC
    ) -> ScriptExecution:
        """执行脚本"""
        execution_id = f"exec_{datetime.now().timestamp()}"
        parameters = parameters or {}
        
        execution = ScriptExecution(
            id=execution_id,
            script_id=template.id,
            context=context,
            parameters=parameters,
            exec_mode=exec_mode,
            timeout=template.timeout,
            started_at=datetime.now(timezone.utc)
        )
        
        self.logger.info(
            "开始执行脚本",
            execution_id=execution_id,
            script_name=template.name,
            device_id=context.device_id,
            script_type=template.script_type.value
        )
        
        try:
            # 预处理脚本内容
            processed_content = self._preprocess_script(template, context, parameters)
            
            # 创建临时脚本文件
            script_file = self.sandbox.create_temp_script(processed_content, template.script_type)
            
            # 执行脚本
            if exec_mode == ScriptExecMode.SYNC:
                await self._execute_sync(execution, script_file, template.script_type, parameters)
            elif exec_mode == ScriptExecMode.ASYNC:
                await self._execute_async(execution, script_file, template.script_type, parameters)
            else:  # BACKGROUND
                self._execute_background(execution, script_file, template.script_type, parameters)
            
            # 解析结果
            if execution.stdout and execution.exit_code == 0:
                execution.result_data = self._parse_script_output(execution.stdout)
            
            execution.completed_at = datetime.now(timezone.utc)
            execution.status = "completed" if execution.exit_code == 0 else "failed"
            
            self.logger.info(
                "脚本执行完成",
                execution_id=execution_id,
                exit_code=execution.exit_code,
                status=execution.status,
                execution_time=(execution.completed_at - execution.started_at).total_seconds()
            )
            
        except Exception as e:
            execution.status = "error"
            execution.error_message = str(e)
            execution.completed_at = datetime.now(timezone.utc)
            
            self.logger.error(
                "脚本执行失败",
                execution_id=execution_id,
                error=str(e)
            )
        
        return execution
    
    def _preprocess_script(
        self, 
        template: ScriptTemplate, 
        context: ScriptContext, 
        parameters: Dict[str, Any]
    ) -> str:
        """预处理脚本内容，进行模板变量替换"""
        content = template.content
        
        # 替换上下文变量
        replacements = {
            '{{DEVICE_ID}}': str(context.device_id),
            '{{DEVICE_NAME}}': context.device_name,
            '{{IP_ADDRESS}}': context.ip_address,
            '{{DEVICE_TYPE}}': context.device_type,
        }
        
        # 添加自定义变量
        for key, value in context.custom_vars.items():
            replacements[f'{{{{CUSTOM_{key.upper()}}}}}'] = str(value)
        
        # 添加参数变量
        for key, value in parameters.items():
            replacements[f'{{{{PARAM_{key.upper()}}}}}'] = str(value)
        
        # 执行替换
        for placeholder, value in replacements.items():
            content = content.replace(placeholder, value)
        
        # 如果是Python脚本，添加上下文注入代码
        if template.script_type == ScriptType.PYTHON:
            context_injection = self._generate_python_context_injection(context, parameters)
            content = context_injection + "\n" + content
        
        return content
    
    def _generate_python_context_injection(
        self, 
        context: ScriptContext, 
        parameters: Dict[str, Any]
    ) -> str:
        """生成Python上下文注入代码"""
        context_dict = {
            'device_id': context.device_id,
            'device_name': context.device_name,
            'ip_address': context.ip_address,
            'device_type': context.device_type,
            'credentials': context.credentials,
            'custom_vars': context.custom_vars,
            'parameters': parameters
        }
        
        return f"""
# Auto-injected context
import json
import sys
from datetime import datetime

CONTEXT = {json.dumps(context_dict)}
DEVICE_ID = {context.device_id}
DEVICE_NAME = "{context.device_name}"
IP_ADDRESS = "{context.ip_address}"
DEVICE_TYPE = "{context.device_type}"

def log_result(data):
    '''输出结构化结果'''
    print("===SCRIPT_RESULT_START===")
    print(json.dumps(data))
    print("===SCRIPT_RESULT_END===")

def log_info(message):
    '''输出信息日志'''
    print(f"[INFO] {{message}}")

def log_error(message):
    '''输出错误日志'''
    print(f"[ERROR] {{message}}", file=sys.stderr)
"""
    
    async def _execute_sync(
        self, 
        execution: ScriptExecution,
        script_file: Path,
        script_type: ScriptType,
        parameters: Dict[str, Any]
    ):
        """同步执行脚本"""
        cmd = self.sandbox.get_execution_command(script_file, script_type, parameters)
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self._get_safe_env(),
            cwd=self.sandbox.temp_dir
        )
        
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=execution.timeout
            )
            
            execution.stdout = stdout.decode('utf-8', errors='replace')
            execution.stderr = stderr.decode('utf-8', errors='replace')
            execution.exit_code = process.returncode
            
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            execution.status = "timeout"
            execution.error_message = f"脚本执行超时 ({execution.timeout}s)"
            execution.exit_code = -1
    
    async def _execute_async(
        self, 
        execution: ScriptExecution,
        script_file: Path,
        script_type: ScriptType,
        parameters: Dict[str, Any]
    ):
        """异步执行脚本"""
        # 异步执行与同步执行类似，但可以在后台处理
        await self._execute_sync(execution, script_file, script_type, parameters)
    
    def _execute_background(
        self, 
        execution: ScriptExecution,
        script_file: Path,
        script_type: ScriptType,
        parameters: Dict[str, Any]
    ):
        """后台执行脚本"""
        cmd = self.sandbox.get_execution_command(script_file, script_type, parameters)
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self._get_safe_env(),
            cwd=self.sandbox.temp_dir
        )
        
        self.running_executions[execution.id] = process
        execution.status = "running"
    
    def _get_safe_env(self) -> Dict[str, str]:
        """获取安全的环境变量"""
        safe_env = {
            'PATH': os.environ.get('PATH', ''),
            'HOME': str(self.sandbox.temp_dir),
            'TEMP': str(self.sandbox.temp_dir),
            'TMP': str(self.sandbox.temp_dir),
            'PYTHONPATH': '',
            'PYTHONDONTWRITEBYTECODE': '1',
        }
        return safe_env
    
    def _parse_script_output(self, stdout: str) -> Optional[Dict[str, Any]]:
        """解析脚本输出中的结构化结果"""
        try:
            # 查找结构化输出标记
            start_marker = "===SCRIPT_RESULT_START==="
            end_marker = "===SCRIPT_RESULT_END==="
            
            start_idx = stdout.find(start_marker)
            if start_idx == -1:
                return None
            
            end_idx = stdout.find(end_marker, start_idx)
            if end_idx == -1:
                return None
            
            result_json = stdout[start_idx + len(start_marker):end_idx].strip()
            return json.loads(result_json)
            
        except Exception as e:
            self.logger.warning(f"解析脚本输出失败: {e}")
            return None
    
    def get_execution_status(self, execution_id: str) -> Optional[Dict[str, Any]]:
        """获取后台执行的脚本状态"""
        process = self.running_executions.get(execution_id)
        if not process:
            return None
        
        poll_result = process.poll()
        if poll_result is not None:
            # 进程已结束
            stdout, stderr = process.communicate()
            self.running_executions.pop(execution_id)
            
            return {
                'status': 'completed',
                'exit_code': poll_result,
                'stdout': stdout.decode('utf-8', errors='replace'),
                'stderr': stderr.decode('utf-8', errors='replace')
            }
        else:
            return {
                'status': 'running',
                'exit_code': None
            }
    
    def cancel_execution(self, execution_id: str) -> bool:
        """取消后台执行的脚本"""
        process = self.running_executions.get(execution_id)
        if process and process.poll() is None:
            process.terminate()
            self.running_executions.pop(execution_id)
            return True
        return False
    
    def _load_builtin_templates(self) -> Dict[str, ScriptTemplate]:
        """加载内置脚本模板"""
        templates = {}
        
        # Python SNMP查询模板
        templates['snmp_query'] = ScriptTemplate(
            id='snmp_query',
            name='SNMP查询脚本',
            description='通过SNMP协议查询设备指标',
            script_type=ScriptType.PYTHON,
            content="""
#!/usr/bin/env python3
# SNMP查询脚本模板
import subprocess
import json
import sys

def snmp_get(ip, community, oid):
    '''执行SNMP GET查询'''
    try:
        cmd = ['snmpget', '-v2c', '-c', community, ip, oid]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            log_error(f"SNMP查询失败: {result.stderr}")
            return None
    except Exception as e:
        log_error(f"SNMP查询异常: {e}")
        return None

def main():
    community = CONTEXT.get('parameters', {}).get('community', 'public')
    oid = CONTEXT.get('parameters', {}).get('oid', '1.3.6.1.2.1.1.1.0')
    
    log_info(f"查询设备 {IP_ADDRESS} 的OID {oid}")
    
    result = snmp_get(IP_ADDRESS, community, oid)
    if result:
        log_result({
            'device_id': DEVICE_ID,
            'ip_address': IP_ADDRESS,
            'oid': oid,
            'value': result,
            'status': 'success'
        })
    else:
        log_result({
            'device_id': DEVICE_ID,
            'ip_address': IP_ADDRESS,
            'oid': oid,
            'status': 'failed'
        })

if __name__ == '__main__':
    main()
""",
            parameters=[
                {'name': 'community', 'type': 'string', 'default': 'public', 'description': 'SNMP团体字符串'},
                {'name': 'oid', 'type': 'string', 'required': True, 'description': '要查询的OID'}
            ],
            timeout=60.0,
            tags=['snmp', 'query', 'basic']
        )
        
        # Shell ping检查模板
        templates['ping_check'] = ScriptTemplate(
            id='ping_check',
            name='Ping连通性检查',
            description='检查设备网络连通性',
            script_type=ScriptType.SHELL,
            content="""#!/bin/bash
# Ping连通性检查脚本
IP="{{IP_ADDRESS}}"
COUNT="{{PARAM_COUNT}}"

if [ -z "$COUNT" ]; then
    COUNT=4
fi

echo "[INFO] 正在Ping $IP，发送 $COUNT 个包..."

if ping -c $COUNT -W 3 $IP > /dev/null 2>&1; then
    echo "===SCRIPT_RESULT_START==="
    echo '{"status": "online", "device_id": {{DEVICE_ID}}, "ip_address": "'$IP'"}'
    echo "===SCRIPT_RESULT_END==="
    echo "[INFO] 设备在线"
    exit 0
else
    echo "===SCRIPT_RESULT_START==="
    echo '{"status": "offline", "device_id": {{DEVICE_ID}}, "ip_address": "'$IP'"}'
    echo "===SCRIPT_RESULT_END==="
    echo "[ERROR] 设备离线"
    exit 1
fi
""",
            parameters=[
                {'name': 'count', 'type': 'integer', 'default': 4, 'description': 'Ping包数量'}
            ],
            timeout=30.0,
            tags=['network', 'connectivity', 'ping']
        )
        
        # Python系统信息查询模板
        templates['system_info'] = ScriptTemplate(
            id='system_info',
            name='系统信息查询',
            description='通过SSH查询系统基本信息',
            script_type=ScriptType.PYTHON,
            content="""
#!/usr/bin/env python3
# 系统信息查询脚本
import paramiko
import json
import sys
from datetime import datetime

def ssh_execute(host, username, password, command):
    '''执行SSH命令'''
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(host, username=username, password=password, timeout=30)
        
        stdin, stdout, stderr = ssh.exec_command(command)
        result = stdout.read().decode('utf-8')
        error = stderr.read().decode('utf-8')
        
        ssh.close()
        
        if error:
            log_error(f"SSH命令错误: {error}")
            return None
        
        return result.strip()
    except Exception as e:
        log_error(f"SSH连接失败: {e}")
        return None

def main():
    credentials = CONTEXT.get('credentials', {})
    username = credentials.get('ssh_username')
    password = credentials.get('ssh_password')
    
    if not username or not password:
        log_error("缺少SSH认证信息")
        return
    
    commands = {
        'hostname': 'hostname',
        'uptime': 'uptime',
        'memory': 'free -h',
        'disk': 'df -h',
        'cpu_info': 'cat /proc/cpuinfo | grep "model name" | head -1'
    }
    
    results = {}
    for key, cmd in commands.items():
        log_info(f"执行命令: {cmd}")
        result = ssh_execute(IP_ADDRESS, username, password, cmd)
        if result:
            results[key] = result
    
    log_result({
        'device_id': DEVICE_ID,
        'ip_address': IP_ADDRESS,
        'system_info': results,
        'timestamp': datetime.now().isoformat(),
        'status': 'success'
    })

if __name__ == '__main__':
    main()
""",
            parameters=[],
            requires_credentials=True,
            timeout=120.0,
            tags=['ssh', 'system', 'info']
        )
        
        return templates
    
    def get_builtin_template(self, template_id: str) -> Optional[ScriptTemplate]:
        """获取内置脚本模板"""
        return self.builtin_templates.get(template_id)
    
    def list_builtin_templates(self) -> List[ScriptTemplate]:
        """列出所有内置脚本模板"""
        return list(self.builtin_templates.values())


# 全局脚本执行器实例
script_executor = ScriptExecutor()