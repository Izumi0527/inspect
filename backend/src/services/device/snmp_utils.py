"""
SNMP 配置解析工具
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from src.core.snmp import (
    SNMPVersion,
    SNMPSecurityLevel,
    SNMPAuthProtocol,
    SNMPPrivProtocol,
)


def parse_tags(tags: Any) -> Dict[str, Any]:
    """解析 tags 字段为字典格式"""
    if not tags:
        return {}
    if isinstance(tags, dict):
        return tags
    if isinstance(tags, str):
        try:
            parsed = json.loads(tags)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def extract_snmp_config(tags: Any) -> Dict[str, Any]:
    """从 tags 中提取 snmp_config"""
    tags_dict = parse_tags(tags)
    snmp_config = tags_dict.get("snmp_config")
    return snmp_config if isinstance(snmp_config, dict) else {}


def normalize_snmp_version(value: Any) -> Optional[SNMPVersion]:
    """规范化 SNMP 版本"""
    if isinstance(value, SNMPVersion):
        return value
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    version_map = {
        "v1": SNMPVersion.V1,
        "1": SNMPVersion.V1,
        "v2c": SNMPVersion.V2C,
        "2c": SNMPVersion.V2C,
        "v3": SNMPVersion.V3,
        "3": SNMPVersion.V3,
    }
    return version_map.get(normalized)


def normalize_snmp_security_level(value: Any) -> Optional[SNMPSecurityLevel]:
    """规范化 SNMP v3 安全级别"""
    if isinstance(value, SNMPSecurityLevel):
        return value
    if not isinstance(value, str):
        return None
    normalized = value.replace("_", "").replace("-", "").strip().lower()
    level_map = {
        "noauthnopriv": SNMPSecurityLevel.NO_AUTH_NO_PRIV,
        "authnopriv": SNMPSecurityLevel.AUTH_NO_PRIV,
        "authpriv": SNMPSecurityLevel.AUTH_PRIV,
    }
    return level_map.get(normalized)


def normalize_snmp_auth_protocol(value: Any) -> Optional[SNMPAuthProtocol]:
    """规范化 SNMP v3 认证协议"""
    if isinstance(value, SNMPAuthProtocol):
        return value
    if not isinstance(value, str):
        return None
    normalized = value.strip().upper().replace("-", "")
    proto_map = {
        "MD5": SNMPAuthProtocol.MD5,
        "SHA": SNMPAuthProtocol.SHA,
        "SHA1": SNMPAuthProtocol.SHA,
        "SHA224": SNMPAuthProtocol.SHA224,
        "SHA256": SNMPAuthProtocol.SHA256,
        "SHA384": SNMPAuthProtocol.SHA384,
        "SHA512": SNMPAuthProtocol.SHA512,
    }
    return proto_map.get(normalized)


def normalize_snmp_priv_protocol(value: Any) -> Optional[SNMPPrivProtocol]:
    """规范化 SNMP v3 加密协议"""
    if isinstance(value, SNMPPrivProtocol):
        return value
    if not isinstance(value, str):
        return None
    normalized = value.strip().upper().replace("-", "")
    proto_map = {
        "DES": SNMPPrivProtocol.DES,
        "3DES": SNMPPrivProtocol.TRIPLE_DES,
        "AES": SNMPPrivProtocol.AES,
        "AES128": SNMPPrivProtocol.AES,
        "AES192": SNMPPrivProtocol.AES192,
        "AES256": SNMPPrivProtocol.AES256,
    }
    return proto_map.get(normalized)
