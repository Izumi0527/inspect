"""
SNMP协议核心模块

提供SNMP v1/v2c/v3协议支持，用于网络设备监控和数据采集。
支持加密、认证和批量数据获取。
"""

import asyncio
import socket
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Any, Tuple, Union
import structlog

# 使用 pysnmp 7.x 的正确导入路径
from pysnmp.hlapi.v3arch.asyncio import (
    get_cmd, next_cmd, bulk_cmd,
    SnmpEngine, UdpTransportTarget, ContextData,
    ObjectType, ObjectIdentity,
    CommunityData, UsmUserData,
    usmHMACMD5AuthProtocol, usmHMACSHAAuthProtocol,
    usmDESPrivProtocol, usmAesCfb128Protocol
)
from pysnmp.proto import rfc1902
from pysnmp.entity import engine, config
from pysnmp.carrier.asyncio import dgram
from pysnmp.smi import builder, view, compiler
from pysnmp.entity.rfc3413 import cmdgen
from pysnmp.proto.api import v2c

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
    
    支持SNMP v1/v2c/v3协议的Get、GetNext、GetBulk、Set操作
    """

    def __init__(self, config: SNMPConfig, credentials: SNMPCredentials):
        self.config = config
        self.credentials = credentials
        self._engine = None
        self._context = None
        self.logger = logger.bind(
            host=config.host,
            port=config.port,
            version=credentials.version.value
        )
    
    async def __aenter__(self):
        """异步上下文管理器入口"""
        await self._initialize_engine()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口"""
        if self._engine:
            self._engine.transportDispatcher.closeDispatcher()

    async def _initialize_engine(self):
        """初始化SNMP引擎和认证配置"""
        try:
            self._engine = engine.SnmpEngine()
            
            # 配置传输协议
            config.addTransport(
                self._engine,
                dgram.udp.domainName + (1,),
                dgram.udp.UdpTransport().openClientMode()
            )
            
            # 根据SNMP版本配置认证
            if self.credentials.version in [SNMPVersion.V1, SNMPVersion.V2C]:
                await self._configure_community_auth()
            elif self.credentials.version == SNMPVersion.V3:
                await self._configure_v3_auth()
                
            # 配置目标参数
            # 获取正确的消息处理模型
            mp_model = 1 if self.credentials.version == SNMPVersion.V2C else 0
            
            config.addTargetParams(
                self._engine, 
                'my-creds',     # 参数名称
                'my-area',      # 安全名称
                'noAuthNoPriv', # 安全级别（对于v1/v2c）
                mp_model        # 消息处理模型
            )
            
            config.addTargetAddr(
                self._engine, 
                'my-router',
                dgram.udp.domainName, 
                (self.config.host, self.config.port),
                'my-creds'
            )
            
            self.logger.info("SNMP引擎初始化成功")
            
        except Exception as e:
            self.logger.error(f"SNMP引擎初始化失败: {e}")
            raise

    async def _configure_community_auth(self):
        """配置Community认证（v1/v2c）"""
        config.addV1System(
            self._engine, 
            'my-area',  # 安全名称，需要与addTargetParams中的安全名称对应
            self.credentials.community or 'public'
        )

    async def _configure_v3_auth(self):
        """配置v3认证"""
        if not self.credentials.username:
            raise ValueError("SNMP v3需要用户名")
        
        # 根据安全级别配置认证
        if self.credentials.security_level == SNMPSecurityLevel.NO_AUTH_NO_PRIV:
            config.addV3User(
                self._engine,
                self.credentials.username,
                config.usmNoAuthProtocol,
                None,
                config.usmNoPrivProtocol,
                None,
            )
        elif self.credentials.security_level == SNMPSecurityLevel.AUTH_NO_PRIV:
            auth_proto = self._get_auth_protocol()
            config.addV3User(
                self._engine,
                self.credentials.username,
                auth_proto,
                self.credentials.auth_key,
                config.usmNoPrivProtocol,
                None,
            )
        elif self.credentials.security_level == SNMPSecurityLevel.AUTH_PRIV:
            auth_proto = self._get_auth_protocol()
            priv_proto = self._get_priv_protocol()
            config.addV3User(
                self._engine,
                self.credentials.username,
                auth_proto,
                self.credentials.auth_key,
                priv_proto,
                self.credentials.priv_key,
            )

    def _get_auth_protocol(self):
        """获取认证协议"""
        auth_map = {
            SNMPAuthProtocol.MD5: config.usmHMACMD5AuthProtocol,
            SNMPAuthProtocol.SHA: config.usmHMACSHAAuthProtocol,
            SNMPAuthProtocol.SHA224: config.usmHMAC128SHA224AuthProtocol,
            SNMPAuthProtocol.SHA256: config.usmHMAC192SHA256AuthProtocol,
            SNMPAuthProtocol.SHA384: config.usmHMAC256SHA384AuthProtocol,
            SNMPAuthProtocol.SHA512: config.usmHMAC384SHA512AuthProtocol,
        }
        return auth_map.get(
            self.credentials.auth_protocol, 
            config.usmHMACMD5AuthProtocol
        )

    def _get_priv_protocol(self):
        """获取加密协议"""
        priv_map = {
            SNMPPrivProtocol.DES: config.usmDESPrivProtocol,
            SNMPPrivProtocol.AES: config.usmAesCfb128Protocol,
            SNMPPrivProtocol.AES192: config.usmAesCfb192Protocol,
            SNMPPrivProtocol.AES256: config.usmAesCfb256Protocol,
            SNMPPrivProtocol.TRIPLE_DES: config.usm3DESEDEPrivProtocol,
        }
        return priv_map.get(
            self.credentials.priv_protocol, 
            config.usmDESPrivProtocol
        )

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
            # 使用 pysnmp 7.x 的异步 API，需要先创建传输目标
            transport_target = await UdpTransportTarget.create((self.config.host, self.config.port))
            
            errorIndication, errorStatus, errorIndex, varBinds = await get_cmd(
                SnmpEngine(),
                self._get_auth_data(),
                transport_target,
                ContextData(),
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
        
        Args:
            oid: 起始OID
            
        Returns:
            查询结果列表
        """
        results = []
        try:
            # 使用 pysnmp 7.x 的异步 API，需要先创建传输目标
            transport_target = await UdpTransportTarget.create((self.config.host, self.config.port))
            
            async for (errorIndication, errorStatus, errorIndex, varBinds) in next_cmd(
                SnmpEngine(),
                self._get_auth_data(),
                transport_target,
                ContextData(),
                ObjectType(ObjectIdentity(oid)),
                lexicographicMode=False
            ):
                if errorIndication:
                    self.logger.error(f"SNMP错误: {errorIndication}")
                    break
                    
                if errorStatus:
                    error_msg = f"SNMP错误: {errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex) - 1][0] or '?'}"
                    self.logger.error(error_msg)
                    break
                
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
            self.logger.error(f"SNMP WALK操作失败: {e}")
            results.append(SNMPResult(oid=oid, value=None, value_type="error", error=str(e)))
        
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
            # 使用 pysnmp 7.x 的异步 API，需要先创建传输目标
            transport_target = await UdpTransportTarget.create((self.config.host, self.config.port))
            
            errorIndication, errorStatus, errorIndex, varBinds = await bulk_cmd(
                SnmpEngine(),
                self._get_auth_data(),
                transport_target,
                ContextData(),
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

    def _get_auth_data(self):
        """获取认证数据对象"""
        if self.credentials.version == SNMPVersion.V1:
            return CommunityData(self.credentials.community or 'public', mpModel=0)
        elif self.credentials.version == SNMPVersion.V2C:
            return CommunityData(self.credentials.community or 'public', mpModel=1)
        elif self.credentials.version == SNMPVersion.V3:
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
        
        raise ValueError(f"不支持的SNMP版本或安全级别")

    def _get_auth_protocol_enum(self):
        """获取认证协议枚举（用于高级API）"""
        auth_map = {
            SNMPAuthProtocol.MD5: usmHMACMD5AuthProtocol,
            SNMPAuthProtocol.SHA: usmHMACSHAAuthProtocol,
        }
        return auth_map.get(self.credentials.auth_protocol, usmHMACMD5AuthProtocol)

    def _get_priv_protocol_enum(self):
        """获取加密协议枚举（用于高级API）"""
        priv_map = {
            SNMPPrivProtocol.DES: usmDESPrivProtocol,
            SNMPPrivProtocol.AES: usmAesCfb128Protocol,
        }
        return priv_map.get(self.credentials.priv_protocol, usmDESPrivProtocol)

    async def test_connection(self) -> bool:
        """
        测试SNMP连接
        
        Returns:
            连接是否成功
        """
        try:
            # 尝试获取系统描述 OID
            results = await self.get("1.3.6.1.2.1.1.1.0")  # sysDescr
            
            if results and not results[0].error:
                self.logger.info(f"SNMP连接测试成功: {results[0].value}")
                return True
            else:
                self.logger.error(f"SNMP连接测试失败: {results[0].error if results else '无响应'}")
                return False
                
        except Exception as e:
            self.logger.error(f"SNMP连接测试异常: {e}")
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