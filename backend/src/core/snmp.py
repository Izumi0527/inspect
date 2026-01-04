"""
SNMP协议核心模块

提供SNMP v1/v2c/v3协议支持，用于网络设备监控和数据采集。
支持加密、认证和批量数据获取。
"""

import asyncio
from dataclasses import dataclass
from enum import Enum
from typing import Optional, List, Any, Union
import structlog

# 使用 pysnmp 7.x 的正确导入路径
from pysnmp.hlapi.v3arch.asyncio import (
    get_cmd, next_cmd, bulk_cmd,
    SnmpEngine, UdpTransportTarget, ContextData,
    ObjectType, ObjectIdentity,
    CommunityData, UsmUserData,
    usmHMACMD5AuthProtocol, usmHMACSHAAuthProtocol,
    usmHMAC128SHA224AuthProtocol, usmHMAC192SHA256AuthProtocol,
    usmHMAC256SHA384AuthProtocol, usmHMAC384SHA512AuthProtocol,
    usmDESPrivProtocol, usm3DESEDEPrivProtocol,
    usmAesCfb128Protocol, usmAesCfb192Protocol, usmAesCfb256Protocol,
    usmNoAuthProtocol, usmNoPrivProtocol
)

logger = structlog.get_logger()


class SNMPVersion(Enum):
    """SNMP版本枚举"""
    V1 = "v1"
    V2C = "v2c"
    V3 = "v3"


class SNMPSecurityLevel(Enum):
    """SNMP v3安全级别"""
    NO_AUTH_NO_PRIV = "noAuthNoPriv"        # 无认证无加密
    AUTH_NO_PRIV = "authNoPriv"             # 认证无加密
    AUTH_PRIV = "authPriv"                  # 认证加密


class SNMPAuthProtocol(Enum):
    """SNMP v3认证协议"""
    MD5 = "MD5"
    SHA = "SHA"
    SHA224 = "SHA224"
    SHA256 = "SHA256"
    SHA384 = "SHA384"
    SHA512 = "SHA512"


class SNMPPrivProtocol(Enum):
    """SNMP v3加密协议"""
    DES = "DES"
    AES = "AES"
    AES192 = "AES192"
    AES256 = "AES256"
    TRIPLE_DES = "3DES"


@dataclass
class SNMPCredentials:
    """SNMP认证凭据"""
    version: SNMPVersion
    # v1/v2c 使用
    community: Optional[str] = None
    # v3 使用
    username: Optional[str] = None
    security_level: Optional[SNMPSecurityLevel] = None
    auth_protocol: Optional[SNMPAuthProtocol] = None
    auth_key: Optional[str] = None
    priv_protocol: Optional[SNMPPrivProtocol] = None
    priv_key: Optional[str] = None
    context_engine_id: Optional[str] = None
    context_name: Optional[str] = ""


@dataclass
class SNMPConfig:
    """SNMP连接配置"""
    host: str
    port: int = 161
    timeout: float = 5.0
    retries: int = 3
    max_repetitions: int = 10  # GetBulk操作的最大重复数


@dataclass
class SNMPResult:
    """SNMP查询结果"""
    oid: str
    value: Any
    value_type: str
    error: Optional[str] = None


class SNMPClient:
    """
    异步SNMP客户端
    
    支持SNMP v1/v2c/v3协议的Get、GetNext、GetBulk操作
    使用 pysnmp 7.x 高级 API
    """

    def __init__(self, config: SNMPConfig, credentials: SNMPCredentials):
        self.config = config
        self.credentials = credentials
        self._transport: Optional[UdpTransportTarget] = None
        self._engine: Optional[SnmpEngine] = None
        self.logger = logger.bind(
            host=config.host,
            port=config.port,
            version=credentials.version.value
        )
    
    async def __aenter__(self):
        """异步上下文管理器入口"""
        await self._initialize()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口"""
        # pysnmp 7.x 高级 API 不需要显式关闭
        pass

    async def _initialize(self):
        """初始化SNMP传输目标"""
        try:
            # 创建传输目标
            self._transport = await UdpTransportTarget.create(
                (self.config.host, self.config.port),
                timeout=self.config.timeout,
                retries=self.config.retries
            )
            # 注意：不在这里创建 SnmpEngine，每次请求时创建新的
            self.logger.info("SNMP引擎初始化成功")
        except Exception as e:
            self.logger.error(f"SNMP引擎初始化失败: {e}")
            raise

    def _get_auth_data(self):
        """获取认证数据对象"""
        if self.credentials.version == SNMPVersion.V1:
            return CommunityData(self.credentials.community or 'public', mpModel=0)
        elif self.credentials.version == SNMPVersion.V2C:
            return CommunityData(self.credentials.community or 'public', mpModel=1)
        elif self.credentials.version == SNMPVersion.V3:
            return self._get_v3_auth_data()
        
        raise ValueError(f"不支持的SNMP版本: {self.credentials.version}")

    def _get_v3_auth_data(self):
        """获取SNMPv3认证数据"""
        if not self.credentials.username:
            raise ValueError("SNMP v3需要用户名")
        
        if self.credentials.security_level == SNMPSecurityLevel.NO_AUTH_NO_PRIV:
            return UsmUserData(self.credentials.username)
        elif self.credentials.security_level == SNMPSecurityLevel.AUTH_NO_PRIV:
            return UsmUserData(
                self.credentials.username,
                self.credentials.auth_key,
                authProtocol=self._get_auth_protocol_enum()
            )
        elif self.credentials.security_level == SNMPSecurityLevel.AUTH_PRIV:
            return UsmUserData(
                self.credentials.username,
                self.credentials.auth_key,
                self.credentials.priv_key,
                authProtocol=self._get_auth_protocol_enum(),
                privProtocol=self._get_priv_protocol_enum()
            )
        
        # 默认无认证无加密
        return UsmUserData(self.credentials.username)

    def _get_auth_protocol_enum(self):
        """获取认证协议枚举"""
        auth_map = {
            SNMPAuthProtocol.MD5: usmHMACMD5AuthProtocol,
            SNMPAuthProtocol.SHA: usmHMACSHAAuthProtocol,
            SNMPAuthProtocol.SHA224: usmHMAC128SHA224AuthProtocol,
            SNMPAuthProtocol.SHA256: usmHMAC192SHA256AuthProtocol,
            SNMPAuthProtocol.SHA384: usmHMAC256SHA384AuthProtocol,
            SNMPAuthProtocol.SHA512: usmHMAC384SHA512AuthProtocol,
        }
        return auth_map.get(self.credentials.auth_protocol, usmHMACMD5AuthProtocol)

    def _get_priv_protocol_enum(self):
        """获取加密协议枚举"""
        priv_map = {
            SNMPPrivProtocol.DES: usmDESPrivProtocol,
            SNMPPrivProtocol.AES: usmAesCfb128Protocol,
            SNMPPrivProtocol.AES192: usmAesCfb192Protocol,
            SNMPPrivProtocol.AES256: usmAesCfb256Protocol,
            SNMPPrivProtocol.TRIPLE_DES: usm3DESEDEPrivProtocol,
        }
        return priv_map.get(self.credentials.priv_protocol, usmDESPrivProtocol)

    async def get(self, oids: Union[str, List[str]]) -> List[SNMPResult]:
        """
        SNMP GET操作
        
        Args:
            oids: 单个OID字符串或OID列表
            
        Returns:
            查询结果列表
        """
        if isinstance(oids, str):
            oids = [oids]
        
        results = []
        try:
            # 每次请求创建新的 SnmpEngine 以避免状态问题
            errorIndication, errorStatus, errorIndex, varBinds = await get_cmd(
                SnmpEngine(),
                self._get_auth_data(),
                self._transport,
                ContextData(contextName=self.credentials.context_name or ""),
                *[ObjectType(ObjectIdentity(oid)) for oid in oids]
            )
            
            if errorIndication:
                self.logger.error(f"SNMP错误: {errorIndication}")
                for oid in oids:
                    results.append(SNMPResult(oid=oid, value=None, value_type="error", error=str(errorIndication)))
                return results
                
            if errorStatus:
                error_msg = f"SNMP错误: {errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex) - 1][0] or '?'}"
                self.logger.error(error_msg)
                for oid in oids:
                    results.append(SNMPResult(oid=oid, value=None, value_type="error", error=error_msg))
                return results
            
            for varBind in varBinds:
                oid_str = str(varBind[0])
                value = varBind[1]
                value_type = type(value).__name__
                
                # 转换值为适当的Python类型
                if hasattr(value, 'prettyPrint'):
                    converted_value = value.prettyPrint()
                else:
                    converted_value = str(value)
                
                results.append(SNMPResult(
                    oid=oid_str,
                    value=converted_value,
                    value_type=value_type
                ))
                
                self.logger.debug(f"SNMP GET: {oid_str} = {converted_value} ({value_type})")
                    
        except Exception as e:
            self.logger.error(f"SNMP GET操作失败: {e}")
            for oid in oids:
                results.append(SNMPResult(oid=oid, value=None, value_type="error", error=str(e)))
        
        return results

    async def walk(self, oid: str) -> List[SNMPResult]:
        """
        SNMP WALK操作
        
        由于 pysnmp 7.x 在 Windows 上 next_cmd 可能有问题，
        这里使用 GETBULK 或多次 GET 来实现 WALK 功能
        
        Args:
            oid: 起始OID
            
        Returns:
            查询结果列表
        """
        results = []
        base_oid = oid
        
        try:
            # 首先尝试使用 GETBULK（更高效）
            if self.credentials.version != SNMPVersion.V1:
                bulk_results = await self._walk_with_bulk(oid, base_oid)
                if bulk_results:
                    return bulk_results
            
            # 如果 GETBULK 失败，使用多次 GET 模拟
            # 这种方法效率较低，但兼容性更好
            self.logger.debug(f"使用 GET 模拟 WALK: {oid}")
            
            # 获取常见的子 OID 列表
            common_suffixes = list(range(1, 20))  # .1 到 .19
            
            for suffix in common_suffixes:
                test_oid = f"{oid}.{suffix}.0" if not oid.endswith('.0') else f"{oid[:-2]}.{suffix}.0"
                
                try:
                    errorIndication, errorStatus, errorIndex, varBinds = await get_cmd(
                        SnmpEngine(),
                        self._get_auth_data(),
                        self._transport,
                        ContextData(contextName=self.credentials.context_name or ""),
                        ObjectType(ObjectIdentity(test_oid))
                    )
                    
                    if errorIndication or errorStatus:
                        continue
                    
                    for varBind in varBinds:
                        oid_str = str(varBind[0])
                        value = varBind[1]
                        value_type = type(value).__name__
                        
                        # 跳过 NoSuchObject 和 NoSuchInstance
                        if value_type in ['NoSuchObject', 'NoSuchInstance', 'EndOfMibView']:
                            continue
                        
                        if hasattr(value, 'prettyPrint'):
                            converted_value = value.prettyPrint()
                        else:
                            converted_value = str(value)
                        
                        results.append(SNMPResult(
                            oid=oid_str,
                            value=converted_value,
                            value_type=value_type
                        ))
                except Exception:
                    continue
                    
        except Exception as e:
            self.logger.error(f"SNMP WALK操作失败: {e}")
            if not results:
                results.append(SNMPResult(oid=oid, value=None, value_type="error", error=str(e)))
        
        return results
    
    async def _walk_with_bulk(self, oid: str, base_oid: str) -> List[SNMPResult]:
        """使用 GETBULK 实现 WALK"""
        results = []
        current_oid = oid
        
        try:
            for _ in range(100):  # 最多100次迭代
                errorIndication, errorStatus, errorIndex, varBinds = await bulk_cmd(
                    SnmpEngine(),
                    self._get_auth_data(),
                    self._transport,
                    ContextData(contextName=self.credentials.context_name or ""),
                    0,  # nonRepeaters
                    10, # maxRepetitions
                    ObjectType(ObjectIdentity(current_oid))
                )
                
                if errorIndication:
                    self.logger.debug(f"GETBULK 失败: {errorIndication}")
                    return []  # 返回空列表，让调用者使用备用方法
                    
                if errorStatus:
                    self.logger.debug(f"GETBULK 错误: {errorStatus}")
                    return []
                
                if not varBinds:
                    break
                
                found_valid = False
                for varBind in varBinds:
                    oid_str = str(varBind[0])
                    value = varBind[1]
                    value_type = type(value).__name__
                    
                    # 检查是否还在基础 OID 的子树下
                    if not oid_str.startswith(base_oid):
                        return results
                    
                    # 检查是否到达结尾
                    if value_type in ['EndOfMibView', 'NoSuchObject', 'NoSuchInstance']:
                        continue
                    
                    if hasattr(value, 'prettyPrint'):
                        converted_value = value.prettyPrint()
                    else:
                        converted_value = str(value)
                    
                    results.append(SNMPResult(
                        oid=oid_str,
                        value=converted_value,
                        value_type=value_type
                    ))
                    
                    current_oid = oid_str
                    found_valid = True
                
                if not found_valid:
                    break
                    
                if len(results) > 1000:
                    break
                    
        except Exception as e:
            self.logger.debug(f"GETBULK WALK 失败: {e}")
            return []
        
        return results

    async def bulk_get(self, oids: List[str], max_repetitions: Optional[int] = None) -> List[SNMPResult]:
        """
        SNMP BULK GET操作（仅支持v2c和v3）
        
        Args:
            oids: OID列表
            max_repetitions: 最大重复数
            
        Returns:
            查询结果列表
        """
        if self.credentials.version == SNMPVersion.V1:
            self.logger.warning("SNMP v1不支持BULK GET，将使用普通GET")
            return await self.get(oids)
        
        max_reps = max_repetitions or self.config.max_repetitions
        results = []
        
        try:
            # 每次请求创建新的 SnmpEngine 以避免状态问题
            errorIndication, errorStatus, errorIndex, varBinds = await bulk_cmd(
                SnmpEngine(),
                self._get_auth_data(),
                self._transport,
                ContextData(contextName=self.credentials.context_name or ""),
                0,  # nonRepeaters
                max_reps,  # maxRepetitions
                *[ObjectType(ObjectIdentity(oid)) for oid in oids]
            )
            
            if errorIndication:
                self.logger.error(f"SNMP错误: {errorIndication}")
                for oid in oids:
                    results.append(SNMPResult(oid=oid, value=None, value_type="error", error=str(errorIndication)))
                return results
                
            if errorStatus:
                error_msg = f"SNMP错误: {errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex) - 1][0] or '?'}"
                self.logger.error(error_msg)
                for oid in oids:
                    results.append(SNMPResult(oid=oid, value=None, value_type="error", error=error_msg))
                return results
            
            for varBind in varBinds:
                oid_str = str(varBind[0])
                value = varBind[1]
                value_type = type(value).__name__
                
                if hasattr(value, 'prettyPrint'):
                    converted_value = value.prettyPrint()
                else:
                    converted_value = str(value)
                
                results.append(SNMPResult(
                    oid=oid_str,
                    value=converted_value,
                    value_type=value_type
                ))
                    
        except Exception as e:
            self.logger.error(f"SNMP BULK GET操作失败: {e}")
            for oid in oids:
                results.append(SNMPResult(oid=oid, value=None, value_type="error", error=str(e)))
        
        return results

    async def test_connection(self) -> bool:
        """
        测试SNMP连接
        
        Returns:
            连接是否成功
        """
        try:
            self.logger.debug(
                "开始SNMP连接测试",
                host=self.config.host,
                port=self.config.port,
                timeout=self.config.timeout,
                retries=self.config.retries,
                version=self.credentials.version.value
            )
            
            # 尝试获取系统描述 OID
            results = await self.get("1.3.6.1.2.1.1.1.0")  # sysDescr
            
            if results and not results[0].error:
                self.logger.info(f"SNMP连接测试成功: {results[0].value[:100] if results[0].value else 'N/A'}...")
                return True
            else:
                error_msg = results[0].error if results else '无响应'
                self.logger.error(f"SNMP连接测试失败: {error_msg}")
                return False
                
        except Exception as e:
            self.logger.error(f"SNMP连接测试异常: {e}", exc_info=True)
            return False


# 常用的OID定义
class CommonOIDs:
    """常用的SNMP OID常量"""
    
    # 系统信息
    SYS_DESCR = "1.3.6.1.2.1.1.1.0"        # 系统描述
    SYS_OBJECT_ID = "1.3.6.1.2.1.1.2.0"    # 系统对象ID
    SYS_UPTIME = "1.3.6.1.2.1.1.3.0"       # 系统运行时间
    SYS_CONTACT = "1.3.6.1.2.1.1.4.0"      # 系统联系人
    SYS_NAME = "1.3.6.1.2.1.1.5.0"         # 系统名称
    SYS_LOCATION = "1.3.6.1.2.1.1.6.0"     # 系统位置
    
    # 接口信息
    IF_NUMBER = "1.3.6.1.2.1.2.1.0"        # 接口数量
    IF_INDEX = "1.3.6.1.2.1.2.2.1.1"       # 接口索引
    IF_DESCR = "1.3.6.1.2.1.2.2.1.2"       # 接口描述
    IF_TYPE = "1.3.6.1.2.1.2.2.1.3"        # 接口类型
    IF_MTU = "1.3.6.1.2.1.2.2.1.4"         # 接口MTU
    IF_SPEED = "1.3.6.1.2.1.2.2.1.5"       # 接口速度
    IF_ADMIN_STATUS = "1.3.6.1.2.1.2.2.1.7"  # 接口管理状态
    IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8"   # 接口操作状态
    
    # 接口统计
    IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10"    # 入口字节数
    IF_IN_UCAST_PKTS = "1.3.6.1.2.1.2.2.1.11"  # 入口单播包数
    IF_IN_DISCARDS = "1.3.6.1.2.1.2.2.1.13"    # 入口丢弃包数
    IF_IN_ERRORS = "1.3.6.1.2.1.2.2.1.14"      # 入口错误包数
    IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16"     # 出口字节数
    IF_OUT_UCAST_PKTS = "1.3.6.1.2.1.2.2.1.17" # 出口单播包数
    IF_OUT_DISCARDS = "1.3.6.1.2.1.2.2.1.19"   # 出口丢弃包数
    IF_OUT_ERRORS = "1.3.6.1.2.1.2.2.1.20"     # 出口错误包数
    
    # CPU和内存 (需要设备支持HOST-RESOURCES-MIB)
    HR_PROCESSOR_LOAD = "1.3.6.1.2.1.25.3.3.1.2"  # CPU负载
    HR_STORAGE_INDEX = "1.3.6.1.2.1.25.2.3.1.1"   # 存储索引
    HR_STORAGE_TYPE = "1.3.6.1.2.1.25.2.3.1.2"    # 存储类型
    HR_STORAGE_SIZE = "1.3.6.1.2.1.25.2.3.1.5"    # 存储大小
    HR_STORAGE_USED = "1.3.6.1.2.1.25.2.3.1.6"    # 存储使用量


async def create_snmp_client(
    host: str,
    port: int = 161,
    version: SNMPVersion = SNMPVersion.V2C,
    community: str = "public",
    username: Optional[str] = None,
    security_level: Optional[SNMPSecurityLevel] = None,
    auth_protocol: Optional[SNMPAuthProtocol] = None,
    auth_key: Optional[str] = None,
    priv_protocol: Optional[SNMPPrivProtocol] = None,
    priv_key: Optional[str] = None,
    timeout: float = 5.0,
    retries: int = 3
) -> SNMPClient:
    """
    创建SNMP客户端的便捷函数
    
    Args:
        host: 目标主机
        port: 目标端口
        version: SNMP版本
        community: Community字符串（v1/v2c使用）
        username: 用户名（v3使用）
        security_level: 安全级别（v3使用）
        auth_protocol: 认证协议（v3使用）
        auth_key: 认证密钥（v3使用）
        priv_protocol: 加密协议（v3使用）
        priv_key: 加密密钥（v3使用）
        timeout: 超时时间
        retries: 重试次数
        
    Returns:
        配置好的SNMP客户端
    """
    config_obj = SNMPConfig(host=host, port=port, timeout=timeout, retries=retries)
    credentials = SNMPCredentials(
        version=version,
        community=community,
        username=username,
        security_level=security_level,
        auth_protocol=auth_protocol,
        auth_key=auth_key,
        priv_protocol=priv_protocol,
        priv_key=priv_key
    )
    
    return SNMPClient(config_obj, credentials)
