#!/usr/bin/env python3
"""从华为 S 系列 V200R024C00 官方产品文档（MIB 上/下册、日志参考、告警处理 4 份 .docx）
安全流式抽取全量知识库、兼容版 Trap 词典与 VRP 模块设施映射表。

产物：
  - backend-go/internal/snmpmib/huawei-mib-catalog.json.gz
  - backend-go/internal/snmpmib/huawei-alarms-kb.json.gz
  - backend-go/internal/snmpmib/huawei-logs-kb.json.gz
  - backend-go/internal/snmpmib/huawei-alarms.json
  - backend-go/internal/logs/vrp_modules_generated.go
  - frontend/src/lib/plain-language/trap-oids.ts

仅依赖 Python 标准库；Gzip 固定 mtime=0、键确定性排序，重复运行输出逐字节一致。
"""
from __future__ import annotations

import argparse
import gzip
import io
import json
import re
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DOCX_DIR = ROOT / 'docs' / 'vendor'
DEFAULT_SUPPLEMENT = ROOT / 'backend-go' / 'internal' / 'snmpmib' / 'huawei-alarms-v600-supplement.json'
OUT_ALARMS_JSON = ROOT / 'backend-go' / 'internal' / 'snmpmib' / 'huawei-alarms.json'
OUT_MIB_GZ = ROOT / 'backend-go' / 'internal' / 'snmpmib' / 'huawei-mib-catalog.json.gz'
OUT_ALARMS_KB_GZ = ROOT / 'backend-go' / 'internal' / 'snmpmib' / 'huawei-alarms-kb.json.gz'
OUT_LOGS_KB_GZ = ROOT / 'backend-go' / 'internal' / 'snmpmib' / 'huawei-logs-kb.json.gz'
OUT_VRP_MODULES_GO = ROOT / 'backend-go' / 'internal' / 'logs' / 'vrp_modules_generated.go'
OUT_TRAP_TS = ROOT / 'frontend' / 'src' / 'lib' / 'plain-language' / 'trap-oids.ts'

MAX_DOCX_XML_BYTES = 256 * 1024 * 1024
UNSAFE_XML_TOKENS = (b'<!DOCTYPE', b'<!ENTITY')

OID_RE = re.compile(r'^\d+(\.\d+)+$')
IDENT_RE = re.compile(r'[A-Za-z][A-Za-z0-9]+')
ENUM_RE = re.compile(r'([A-Za-z][A-Za-z0-9_-]*)\s*[(（]\s*(\d+)\s*[)）]')
MIB_HEADING_RE = re.compile(r'^\d+(?:\.\d+)*\s+([A-Za-z0-9_-]*MIB[A-Za-z0-9_-]*)$')
ALARM_HEADING_RE = re.compile(r'^\d+(?:\.\d+)*\s+([A-Za-z0-9_-]+)_(\d+(?:\.\d+)+)\s+(\S+)(?:\s+(\d+))?$')
LOG_HEADING_RE = re.compile(r'^[\d.]+\s+([A-Za-z0-9_-]+)/(\d)/([A-Za-z0-9_-]+)')
CAUSE_LABEL_RE = re.compile(r'^原因\s*\d+\s*[:：]?$')
TRAP_VAR_HEADERS = ('绑定变量', 'Binding Variable')
NODE_TYPE_HEADER = '数据类型'
REASON_NAME_RE = re.compile(r'Reason(Descr|Info)?$')
SEVERITY_WORDS = {'cleared', 'indeterminate', 'critical', 'major', 'minor', 'warning'}

VALID_LEVELS = {'critical', 'warning', 'info'}
VALID_FACILITIES = {
    'system', 'interface', 'security', 'routing', 'switching',
    'snmp', 'ssh', 'hardware', 'configuration',
}
ALWAYS_INCLUDE_MIBS = {
    'IF-MIB', 'ENTITY-MIB', 'HUAWEI-BASE-TRAP-MIB', 'HUAWEI-ENTITY-TRAP-MIB',
    'HUAWEI-ALARM-MIB', 'NOTIFICATION-LOG-MIB', 'HUAWEI-INFOCENTER-MIB',
}

CLEARED_RE = re.compile(
    r'Resume|Recover|Restore|Clear|Normal|Online|Insert|Connect(?!ion|Error|Fail)|Established|Success'
    r'|Completed|Enabled|(?<![Ii]n)Valid|Full$|Up$|On$|Close$|Login$|Logout$',
)
CRITICAL_RE = re.compile(
    r'Fail|Fault|Fatal|Invalid|Unusable|DyingGasp|PowerOff|Storm|Attack|Exhaust|Overload'
    r'|Broken|ProcessExit|Reboot|(?<!Nearly)Expire|Insufficient|AllMemberDown|TotalLinkLoss'
    r'|Temp\w*(Alarm|Rising|Falling)|(Fan|Power|Psu|Battery)\w*(Remove|Absent|Invalid)',
)

FACILITY_NAME_RULES = [
    ('hardware', re.compile(r'Temp|Fan|Power|Psu|Board|Card|Optical|Chassis|Volt|Humid|Battery|Rps|Lcd|Cmu|Entity(?!Ext)|Sensor|Fog|Gate|Unstable')),
    ('security', re.compile(r'Login|Logout|Auth|Password|Attack|Acl|Portal|Radius|Tacacs|Spoof|Wids|Snooping|Snp|Arp|Dhcp|Nac|Dot1x|8021x|Ipsg|Pki|Ssl|Ipsec|Secure|Quiet')),
    ('system', re.compile(r'Cpu|CPU|Mem(?!ber)|Memory|Flash|Storage|Patch|Upgrade|License|Gtl|Clock|Ntp|Ptp|Config|Reboot|Restart|Process|Telemetry')),
    ('interface', re.compile(r'Port|Link|Lacp|Trunk|Duplex|Ifnet|If[A-Z]|Interface|Optical|Lldp|Dldp|Efm|Cfm|Poe')),
]
FACILITY_MIB_RULES = [
    ('interface', ('IF-MIB', 'HUAWEI-IF-EXT-MIB', 'EtherLike-MIB', 'LAG-MIB', 'HUAWEI-PORT-MIB', 'HUAWEI-LLDP-MIB', 'LLDP-MIB',
                   'LLDP-EXT-DOT1-MIB', 'LLDP-EXT-DOT3-MIB', 'HUAWEI-DLDP-MIB', 'HUAWEI-ETHOAM-MIB', 'HUAWEI-E-TRUNK-MIB',
                   'HUAWEI-POE-MIB', 'HUAWEI-ERRORDOWN-MIB', 'HUAWEI-LDT-MIB', 'HUAWEI-RUMNG-MIB')),
    ('switching', ('BRIDGE-MIB', 'P-BRIDGE-MIB', 'Q-BRIDGE-MIB', 'HUAWEI-MSTP-MIB', 'HUAWEI-L2VLAN-MIB', 'HUAWEI-L2MAM-MIB',
                   'HUAWEI-L2IF-MIB', 'HUAWEI-STACK-MIB', 'HUAWEI-CSS-MIB', 'HUAWEI-M-LAG-MIB', 'HUAWEI-MLAG-MIB',
                   'HUAWEI-ERPS-MIB', 'HUAWEI-RRPP-MIB', 'HUAWEI-VBST-MIB', 'HUAWEI-MFLP-MIB', 'HUAWEI-SEP-MIB',
                   'HUAWEI-QINQ-MIB', 'HUAWEI-GARP-APP-MIB', 'HUAWEI-SWITCH-L2MAM-EXT-MIB', 'HUAWEI-XQoS-MIB',
                   'HUAWEI-HGMP-MIB', 'HUAWEI-UNIMNG-MIB', 'HUAWEI-MFF-MIB', 'HUAWEI-ISOLATE-MIB')),
    ('routing', ('BGP4-MIB', 'HUAWEI-BGP-VPN-MIB', 'OSPF-MIB', 'OSPF-TRAP-MIB', 'HUAWEI-OSPFV2-MIB', 'HUAWEI-OSPFV3-MIB',
                 'ISIS-MIB', 'RIPv2-MIB', 'HUAWEI-RIPV2-EXT-MIB', 'HUAWEI-RM-EXT-MIB', 'HUAWEI-BFD-MIB',
                 'HUAWEI-BFD-CONFIG-TRAP-MIB', 'VRRP-MIB', 'VRRPV3-MIB', 'HUAWEI-VRRP-EXT-MIB', 'HUAWEI-MPLS-EXTEND-MIB',
                 'HUAWEI-MPLSLDP-MIB', 'HUAWEI-MPLSLSR-EXT-MIB', 'HUAWEI-MPLSOAM-MIB', 'HUAWEI-LSP-PING-TRACE-TRAP-MIB',
                 'HUAWEI-L2VPN-MIB', 'HUAWEI-VPLS-EXT-MIB', 'HUAWEI-VPLS-TNL-MIB', 'HUAWEI-PWE3-MIB', 'HUAWEI-PWE3-TNL-MIB',
                 'HUAWEI-KOMPELLA-MIB', 'HUAWEI-CCC-MIB', 'HUAWEI-TUNNEL-TE-MIB', 'HUAWEI-RSVPTE-MIB', 'HUAWEI-VXLAN-MIB',
                 'HUAWEI-EVPN-MIB', 'HUAWEI-IPV6-MIB', 'IPV6-MIB', 'IP-MIB', 'IP-FORWARD-MIB', 'HUAWEI-GTSM-MIB',
                 'HUAWEI-MSDP-MIB', 'MSDP-MIB', 'HUAWEI-VPN-DIAGNOSTICS-MIB', 'HUAWEI-MULTICAST-MIB',
                 'HUAWEI-IPMCAST-MIB', 'IPMCAST-MIB', 'HUAWEI-MGMD-STD-MIB', 'MGMD-STD-MIB', 'HUAWEI-PIM-STD-MIB',
                 'HUAWEI-PIM-BSR-MIB', 'PIM-STD-MIB', 'PIM-BSR-MIB', 'MPLS-FTN-STD-MIB', 'MPLS-L3VPN-STD-MIB',
                 'MPLS-LDP-GENERIC-STD-MIB', 'MPLS-LDP-STD-MIB', 'MPLS-LSR-STD-MIB', 'MPLS-TE-STD-MIB',
                 'HUAWEI-L2VC-STATISTIC-MIB')),
    ('security', ('HUAWEI-AAA-MIB', 'HUAWEI-ACL-MIB', 'HUAWEI-SECURITY-MIB', 'HUAWEI-SECURITY-PKI-MIB', 'HUAWEI-SECURITY-IPSEC-MIB',
                  'HUAWEI-DHCP-SNOOPING-MIB', 'HUAWEI-DHCPS-MIB', 'HUAWEI-DHCPR-MIB', 'HUAWEI-MAC-AUTHEN-MIB', 'HUAWEI-PORTAL-MIB',
                  'HUAWEI-HWTACACS-MIB', 'HUAWEI-BRAS-RADIUS-MIB', 'HUAWEI-BRAS-SRVCFG-EAP-MIB', 'HUAWEI-BRAS-SRVCFG-STATICUSER-MIB',
                  'HUAWEI-USA-MIB', 'HUAWEI-USC-MIB', 'SAVI-MIB', 'HUAWEI-WLAN-WIDS-SERVICE-MIB', 'HUAWEI-ETHARP-MIB',
                  'HUAWEI-TCP-MIB', 'HUAWEI-DAD-MIB', 'HUAWEI-DIE-MIB', 'HUAWEI-MACSEC-MIB')),
    ('snmp', ('SNMPv2-MIB', 'SNMP-FRAMEWORK-MIB', 'SNMP-MPD-MIB', 'SNMP-NOTIFICATION-MIB', 'SNMP-TARGET-MIB',
              'SNMP-USER-BASED-SM-MIB', 'SNMP-VIEW-BASED-ACM-MIB', 'HUAWEI-SNMP-EXT-MIB', 'HUAWEI-ALARM-MIB',
              'HUAWEI-ALARM-RELIABILITY-MIB', 'NOTIFICATION-LOG-MIB', 'RMON-MIB', 'RMON2-MIB')),
    ('ssh', ('HUAWEI-SSH-MIB', 'HUAWEI-HTTP-MIB', 'HUAWEI-TFTPC-MIB')),
    ('hardware', ('HUAWEI-ENTITY-TRAP-MIB', 'HUAWEI-ENTITY-EXTENT-MIB', 'ENTITY-MIB', 'HUAWEI-BASE-TRAP-MIB',
                  'HUAWEI-ENERGYMNGT-MIB', 'HUAWEI-DC-TRAP-MIB', 'HUAWEI-DEVICE-MIB')),
    ('configuration', ('HUAWEI-CONFIG-MAN-MIB', 'HUAWEI-EASY-OPERATION-MIB', 'HUAWEI-DATASYNC-MIB', 'HUAWEI-AUTODIAGNOSE-MIB')),
    ('system', ('HUAWEI-TELEMETRY-MIB', 'HUAWEI-SYS-MAN-MIB', 'HUAWEI-SYS-RES-TRAP-MIB', 'HUAWEI-FWD-RES-TRAP-MIB')),
]
GENERIC_TRAP_FACILITY = {
    '1.3.6.1.6.3.1.1.5.1': 'system', '1.3.6.1.6.3.1.1.5.2': 'system',
    '1.3.6.1.6.3.1.1.5.3': 'interface', '1.3.6.1.6.3.1.1.5.4': 'interface',
    '1.3.6.1.6.3.1.1.5.5': 'security', '1.3.6.1.6.3.1.1.5.6': 'snmp',
}

LABEL_MAX = 24
LABEL_PREFIXES = ('该节点用来表示', '该节点标识', '该节点表示', '该告警表示', '该trap表示', '该Trap表示')
LABEL_SUFFIX_RE = re.compile(
    r'[，,]?(?:并|且|同时)?(?:会|将|则)?(?:触发|产生|出发|发出|上报|发送)(?:该|此|一条)?(?:告警信息|告警|trap|Trap|TRAP|通知|信息)$')
LABEL_OVERRIDES = {
    '1.3.6.1.6.3.1.1.5.1': '设备冷启动',
    '1.3.6.1.6.3.1.1.5.2': '设备热启动',
    '1.3.6.1.6.3.1.1.5.3': '链路断开',
    '1.3.6.1.6.3.1.1.5.4': '链路恢复',
    '1.3.6.1.6.3.1.1.5.5': 'SNMP 认证失败',
}

# 映射到 backend-go/internal/logs/service.go normalizeFacility 认可的值域：
# system / interface / security / routing / switching / snmp / ssh
OFFICIAL_MODULE_FACILITY_MAP = {
    # interface
    'bptnladp': 'interface', 'cfm': 'interface', 'dldp': 'interface', 'efm': 'interface',
    'eoam1ag': 'interface', 'eoam_adp': 'interface', 'eoam_y1731': 'interface', 'errdown': 'interface',
    'errordown': 'interface', 'etrunk': 'interface', 'ifadp': 'interface', 'ifnet': 'interface',
    'ifpdt': 'interface', 'l2bptnl': 'interface', 'l2if': 'interface', 'l2ifppi': 'interface',
    'l2v': 'interface', 'l3ad': 'interface', 'l3vpn': 'interface', 'lacp': 'interface',
    'lldp': 'interface', 'mid_l2bptnl': 'interface', 'nvo3': 'interface', 'poe': 'interface',
    'ru': 'interface', 'rumng': 'interface', 'ruup': 'interface', 'tnlm': 'interface',
    'tplmng': 'interface', 'trunk': 'interface', 'tunn_ps': 'interface', 'tunnel': 'interface',
    'uni-topomng': 'interface', 'vtrunk': 'interface', 'y1731adp': 'interface',
    # switching
    'adpvxlan': 'switching', 'arp': 'switching', 'arplink': 'switching', 'erps': 'switching',
    'hgmp': 'switching', 'lbdt': 'switching', 'loopdetect': 'switching', 'mad': 'switching',
    'mdns': 'switching', 'mstp': 'switching', 'mstp_adp': 'switching', 'rrpp': 'switching',
    'sep': 'switching', 'smlk': 'switching', 'svxlan': 'switching', 'sw_snpg': 'switching',
    'vbst': 'switching', 'vcmp': 'switching', 'vcmp_adp': 'switching',
    # routing
    '6over4': 'routing', 'ada_bfd': 'routing', 'adpipv4': 'routing', 'bfd': 'routing',
    'bgp': 'routing', 'cspf': 'routing', 'fibspt': 'routing', 'gre': 'routing',
    'igmp': 'routing', 'ip': 'routing', 'ipca': 'routing', 'ipfpm': 'routing',
    'iplrn': 'routing', 'ipv4-ipv6': 'routing', 'ipv6': 'routing', 'ipv6fibagent': 'routing',
    'ipv6pp': 'routing', 'ipv6tcp': 'routing', 'isis': 'routing', 'l3mb': 'routing',
    'ldp': 'routing', 'lspm': 'routing', 'lspv': 'routing', 'mcast': 'routing',
    'mcmd': 'routing', 'mfib': 'routing', 'mgmd': 'routing', 'mld': 'routing',
    'mpls': 'routing', 'mrm': 'routing', 'msdp': 'routing', 'nd': 'routing',
    'ospf': 'routing', 'ospfv3': 'routing', 'pim': 'routing', 'pim-std': 'routing',
    'rip': 'routing', 'ripng': 'routing', 'rm': 'routing', 'rsvp': 'routing',
    'tcp6': 'routing', 'vpnbase': 'routing', 'vrrp': 'routing',
    # security
    'aaa': 'security', 'acl6': 'security', 'acle': 'security', 'am': 'security',
    'cm': 'security', 'cmd': 'security', 'defd': 'security', 'dhcp': 'security',
    'dot1x': 'security', 'dsa': 'security', 'ecml': 'security', 'haca': 'security',
    'ike': 'security', 'ipsec': 'security', 'ipsec-vpn': 'security', 'keychain': 'security',
    'line': 'security', 'nac': 'security', 'nd_raguard': 'security', 'pki': 'security',
    'portal': 'security', 'rds': 'security', 'rsa': 'security', 'sa': 'security',
    'sacl': 'security', 'sece': 'security', 'station': 'security', 'tac': 'security',
    'usa': 'security',
    # ssh
    'ftps': 'ssh', 'http': 'ssh', 'http2c': 'ssh', 'ssh': 'ssh',
    'tftp': 'ssh', 'vty': 'ssh', 'web': 'ssh', 'web_writefile_log': 'ssh',
    'webmng': 'ssh', 'webs': 'ssh',
    # snmp
    'bulkstat': 'snmp', 'rmon': 'snmp', 'snmp': 'snmp', 'tad': 'snmp',
}


class BoundedSafeXMLStream(io.RawIOBase):
    """在流式读取 ZIP 内 XML 时强制校验字节上限并拒绝 DOCTYPE / ENTITY 声明。"""

    def __init__(self, inner: io.IOBase, max_bytes: int, label: str) -> None:
        self._inner = inner
        self._max_bytes = max_bytes
        self._label = label
        self._total = 0
        self._tail = b''

    def readable(self) -> bool:
        return True

    def read(self, size: int = -1) -> bytes:
        read_size = 65536 if size is None or size < 0 else min(size, 1024 * 1024)
        chunk = self._inner.read(read_size)
        if not chunk:
            return chunk
        self._total += len(chunk)
        if self._total > self._max_bytes:
            raise ValueError(f'{self._label} 解压大小超过安全上限 ({self._max_bytes} bytes)')
        window = (self._tail + chunk).upper()
        for token in UNSAFE_XML_TOKENS:
            if token in window:
                raise ValueError(f'{self._label} 包含被禁止的 XML 声明 {token.decode("ascii")}')
        self._tail = window[-16:]
        return chunk


def validate_zip_safety(zf: zipfile.ZipFile, docx_path: Path) -> zipfile.ZipInfo:
    for info in zf.infolist():
        name = info.filename
        if name.startswith('/') or name.startswith('\\') or ':' in name:
            raise ValueError(f'{docx_path.name} 包含非法路径成员: {name}')
        parts = PurePosixPath(name.replace('\\', '/')).parts
        if '..' in parts:
            raise ValueError(f'{docx_path.name} 包含路径穿越成员: {name}')
    try:
        doc_info = zf.getinfo('word/document.xml')
    except KeyError as exc:
        raise ValueError(f'{docx_path.name} 缺少 word/document.xml') from exc
    if doc_info.file_size > MAX_DOCX_XML_BYTES:
        raise ValueError(f'{docx_path.name} word/document.xml 体积过大 ({doc_info.file_size} bytes)')
    return doc_info


def para_text(p: ET.Element) -> str:
    parts: list[str] = []
    for node in p.iter():
        if node.tag == W + 't' and node.text:
            parts.append(node.text)
        elif node.tag == W + 'tab':
            parts.append('\t')
        elif node.tag == W + 'br':
            parts.append('\n')
    return ''.join(parts).strip()


def para_outline_level(p: ET.Element) -> str | None:
    p_pr = p.find(W + 'pPr')
    if p_pr is None:
        return None
    ol = p_pr.find(W + 'outlineLvl')
    return ol.get(W + 'val') if ol is not None else None


def iter_blocks(docx: Path):
    """安全流式产出 ('p', outline_lvl, text) 与 ('tbl', rows) 块。"""
    with zipfile.ZipFile(docx) as zf:
        doc_info = validate_zip_safety(zf, docx)
        with zf.open(doc_info) as raw_stream:
            safe_stream = BoundedSafeXMLStream(raw_stream, MAX_DOCX_XML_BYTES, f'{docx.name}:word/document.xml')
            depth = 0
            for event, el in ET.iterparse(safe_stream, events=('start', 'end')):
                if event == 'start':
                    if el.tag == W + 'tbl':
                        depth += 1
                    continue
                if el.tag == W + 'tbl':
                    depth -= 1
                    if depth == 0:
                        rows = []
                        for tr in el.iter(W + 'tr'):
                            cells = [
                                ' '.join(para_text(p) for p in tc.iter(W + 'p')).strip()
                                for tc in tr.findall(W + 'tc')
                            ]
                            rows.append(cells)
                        yield 'tbl', None, rows
                        el.clear()
                elif el.tag == W + 'p' and depth == 0:
                    text = para_text(el)
                    ol = para_outline_level(el)
                    if text:
                        yield 'p', ol, text
                    el.clear()


def detect_docx_type(docx: Path) -> str:
    with zipfile.ZipFile(docx) as zf:
        doc_info = validate_zip_safety(zf, docx)
        with zf.open(doc_info) as raw_stream:
            safe_stream = BoundedSafeXMLStream(raw_stream, MAX_DOCX_XML_BYTES, f'{docx.name}:detect')
            checked = 0
            for _, el in ET.iterparse(safe_stream, events=('end',)):
                if el.tag == W + 'p':
                    ol = para_outline_level(el)
                    text = para_text(el)
                    el.clear()
                    if ol in ('0', '1') and text:
                        if '日志参考' in text:
                            return 'logs'
                        if '告警处理' in text:
                            return 'alarms'
                        if 'MIB参考' in text or MIB_HEADING_RE.match(text):
                            return 'mib'
                        checked += 1
                        if checked >= 20:
                            break
    raise ValueError(f'无法识别文档类型: {docx.name}')


def oid_key(oid: str) -> tuple[int, ...]:
    return tuple(int(x) for x in oid.split('.'))


def parse_enum(dtype: str) -> dict[str, str]:
    if not dtype or ('..' in dtype and '(' in dtype and '{' not in dtype):
        return {}
    found = ENUM_RE.findall(dtype)
    if len(found) < 2:
        return {}
    result: dict[str, str] = {}
    for name, num in found:
        result.setdefault(num, name)
    return result


def classify_level(name: str) -> tuple[str, bool]:
    if CLEARED_RE.search(name):
        return 'info', True
    if CRITICAL_RE.search(name):
        return 'critical', False
    return 'warning', False


def classify_facility(oid: str, name: str, mib: str) -> str:
    if oid in GENERIC_TRAP_FACILITY:
        return GENERIC_TRAP_FACILITY[oid]
    for facility, pattern in FACILITY_NAME_RULES:
        if pattern.search(name):
            return facility
    for facility, mibs in FACILITY_MIB_RULES:
        if mib in mibs:
            return facility
    return 'system'


def clean_label(oid: str, meaning: str, name: str) -> tuple[str, str | None]:
    full = meaning.strip()
    if oid in LABEL_OVERRIDES:
        return LABEL_OVERRIDES[oid], full
    text = full
    for prefix in LABEL_PREFIXES:
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    text = re.sub(r'^' + re.escape(name) + r'告警表示[:：]', '', text)
    text = text.split('。')[0].strip() or full.strip('。')
    stripped = LABEL_SUFFIX_RE.sub('', text).strip(' ，,')
    if stripped and stripped != text:
        text = stripped
        if text.startswith('当') and len(text) > 1:
            text = text[1:]
        text = re.sub(r'(?:时|后)$', '', text)
        clauses = text.split('，')
        if len(clauses) > 1 and clauses[-1].startswith('当'):
            text = '，'.join(clauses[:-1])
    if len(text) > LABEL_MAX and '，' in text:
        first = text.split('，')[0].strip()
        if 4 <= len(first) <= LABEL_MAX:
            text = first
    if len(text) > LABEL_MAX:
        text = text[:LABEL_MAX] + '…'
    detail = full if text != full.rstrip('。') else None
    return text, detail


def ts_string(value: str) -> str:
    return (
        json.dumps(value, ensure_ascii=False)
        .replace('\u2028', '\\u2028')
        .replace('\u2029', '\\u2029')
    )


def merge_causes(paragraphs: list[str]) -> list[str]:
    out: list[str] = []
    pending_label = ''
    for p in paragraphs:
        text = p.strip()
        if not text:
            continue
        if CAUSE_LABEL_RE.match(text):
            pending_label = text.rstrip(':：') + '：'
            continue
        if pending_label:
            out.append(pending_label + text)
            pending_label = ''
        else:
            out.append(text)
    if pending_label:
        out.append(pending_label.rstrip('：'))
    return out


def parse_mib_docx(
    docx: Path,
    mib_catalog: dict[str, dict],
    trap_defs: dict[str, dict],
    raw_nodes: dict[str, dict],
    name_to_oid: dict[str, str],
) -> None:
    cur_mib = ''
    started = False
    for kind, ol, payload in iter_blocks(docx):
        if kind == 'p':
            if ol == '0':
                started = True
            if started and ol in ('0', '1'):
                m = MIB_HEADING_RE.match(payload)
                if m:
                    cur_mib = m.group(1)
            continue

        rows = payload
        header_idx = -1
        for i, r in enumerate(rows[:2]):
            if len(r) >= 4 and r[0].strip() == 'OID':
                header_idx = i
                break
        if header_idx < 0:
            continue
        header = [c.strip() for c in rows[header_idx]]
        if header[2] in TRAP_VAR_HEADERS and header[3] != '最大访问权限':
            for cells in rows[header_idx + 1:]:
                if len(cells) < 4 or not OID_RE.match(cells[0].strip()):
                    continue
                oid = cells[0].strip()
                name = re.sub(r'\s+', '', cells[1])
                if not name:
                    continue
                meaning = cells[3].strip()
                impl_spec = cells[4].strip() if len(cells) >= 5 else ''
                trap_defs.setdefault(oid, {
                    'name': name,
                    'mib': cur_mib,
                    'vars_raw': cells[2],
                    'meaning': meaning,
                })
                existing = mib_catalog.get(oid)
                if existing is None:
                    mib_catalog[oid] = {
                        'oid': oid,
                        'name': name,
                        'mib': cur_mib,
                        'data_type': 'NOTIFICATION-TYPE',
                        'access': 'accessible-for-notify',
                        'meaning': meaning,
                        'impl_spec': impl_spec,
                    }
                elif len(impl_spec) > len(existing['impl_spec']):
                    existing['impl_spec'] = impl_spec
        elif header[2] == NODE_TYPE_HEADER:
            for cells in rows[header_idx + 1:]:
                if len(cells) < 4 or not OID_RE.match(cells[0].strip()):
                    continue
                oid = cells[0].strip()
                name = re.sub(r'\s+', '', cells[1])
                if not name:
                    continue
                dtype = cells[2].strip()
                access = cells[3].strip()
                meaning = cells[4].strip() if len(cells) >= 5 else ''
                impl_spec = cells[5].strip() if len(cells) >= 6 else ''
                raw_nodes.setdefault(oid, {
                    'name': name,
                    'mib': cur_mib,
                    'enum': parse_enum(dtype),
                    'access': access.lower(),
                    'dtype': dtype,
                })
                name_to_oid.setdefault(name, oid)
                existing = mib_catalog.get(oid)
                if existing is None or existing['data_type'] == 'NOTIFICATION-TYPE':
                    mib_catalog[oid] = {
                        'oid': oid,
                        'name': name,
                        'mib': cur_mib,
                        'data_type': dtype,
                        'access': access,
                        'meaning': meaning,
                        'impl_spec': impl_spec,
                    }
                else:
                    if len(meaning) > len(existing['meaning']):
                        existing['meaning'] = meaning
                    if len(impl_spec) > len(existing['impl_spec']):
                        existing['impl_spec'] = impl_spec


def parse_alarm_docx(docx: Path) -> tuple[list[dict], set[str]]:
    entries: list[dict] = []
    seen_keys: set[tuple[str, str]] = set()
    alarm_modules: set[str] = set()
    started = False
    cur: dict | None = None
    cur_sec = ''

    def flush() -> None:
        nonlocal cur
        if cur is None:
            return
        key = (cur['oid'], cur['sub_id'])
        if key not in seen_keys:
            seen_keys.add(key)
            entries.append(finalize_alarm_entry(cur))
        cur = None

    for kind, ol, payload in iter_blocks(docx):
        if kind == 'p':
            if ol == '0':
                started = True
                continue
            if not started:
                continue
            if ol == '1':
                flush()
                cur_sec = ''
                continue
            if ol == '2':
                flush()
                cur_sec = ''
                m = ALARM_HEADING_RE.match(payload)
                if m:
                    mod = m.group(1)
                    alarm_modules.add(mod.lower())
                    cur = {
                        'oid': m.group(2),
                        'module': mod,
                        'alarm_name': m.group(3),
                        'sub_id': m.group(4) or '',
                        'sections': {},
                        'tables': {},
                    }
                continue
            if cur is None:
                continue
            if ol == '3':
                cur_sec = payload.strip()
                continue
            if cur_sec:
                cur['sections'].setdefault(cur_sec, []).append(payload.strip())
        else:
            if cur is not None and cur_sec:
                cur['tables'].setdefault(cur_sec, []).append(payload)

    flush()
    return entries, alarm_modules


def finalize_alarm_entry(raw: dict) -> dict:
    sections = raw['sections']
    tables = raw['tables']

    expl_paras = sections.get('告警解释', [])
    trap_template = ''
    meaning_parts = expl_paras
    if expl_paras and ('OID [oid]' in expl_paras[0] or re.match(r'^[A-Za-z0-9_-]+/\d+/', expl_paras[0])):
        trap_template = expl_paras[0]
        meaning_parts = expl_paras[1:]
    meaning = '\n'.join(meaning_parts).strip() or trap_template

    alarm_id = raw['oid']
    severity = ''
    alarm_type = ''
    attr_tables = tables.get('告警属性', []) or tables.get('告警属性表', [])
    if attr_tables and len(attr_tables[0]) >= 2 and len(attr_tables[0][1]) >= 3:
        row = attr_tables[0][1]
        alarm_id = row[0].strip() or raw['oid']
        severity = row[1].strip()
        alarm_type = row[2].strip()

    params: list[dict] = []
    param_tables = tables.get('告警参数', []) or tables.get('告警参数表', [])
    for tbl in param_tables:
        for row in tbl[1:]:
            if len(row) >= 2 and row[0].strip():
                params.append({'name': row[0].strip(), 'meaning': row[1].strip()})

    impact = '\n'.join(sections.get('对系统的影响', []) or sections.get('对系统影响', [])).strip()
    causes = merge_causes(sections.get('可能原因', []))
    procedures = [p for p in sections.get('处理步骤', []) if p]
    reference = '\n'.join(sections.get('参考信息', [])).strip()

    return {
        'oid': raw['oid'],
        'module': raw['module'],
        'alarm_name': raw['alarm_name'],
        'sub_id': raw['sub_id'],
        'alarm_id': alarm_id,
        'severity': severity,
        'alarm_type': alarm_type,
        'trap_template': trap_template,
        'meaning': meaning,
        'parameters': params,
        'impact': impact,
        'causes': causes,
        'procedures': procedures,
        'reference': reference,
    }


def parse_log_docx(docx: Path) -> tuple[list[dict], set[str]]:
    logs: list[dict] = []
    seen: set[tuple[str, str, int]] = set()
    log_modules: set[str] = set()
    started = False
    cur: dict | None = None
    cur_sec = ''

    def flush() -> None:
        nonlocal cur
        if cur is None:
            return
        key = (cur['module'], cur['mnemonic'], cur['severity'])
        if key not in seen:
            seen.add(key)
            logs.append(finalize_log_entry(cur))
        cur = None

    for kind, ol, payload in iter_blocks(docx):
        if kind == 'p':
            if ol == '0':
                started = True
                continue
            if not started:
                continue
            if ol == '1':
                flush()
                cur_sec = ''
                continue
            if ol in ('2', '3'):
                m = LOG_HEADING_RE.match(payload)
                if m:
                    flush()
                    cur_sec = ''
                    mod = m.group(1)
                    log_modules.add(mod.lower())
                    cur = {
                        'module': mod,
                        'severity': int(m.group(2)),
                        'mnemonic': m.group(3),
                        'sections': {},
                        'tables': {},
                    }
                    continue
                if ol == '2':
                    flush()
                    cur_sec = ''
                    continue
            if cur is None:
                continue
            if ol in ('3', '4'):
                cur_sec = payload.strip()
                continue
            if cur_sec:
                cur['sections'].setdefault(cur_sec, []).append(payload.strip())
        else:
            if cur is not None and cur_sec:
                cur['tables'].setdefault(cur_sec, []).append(payload)

    flush()
    return logs, log_modules


def finalize_log_entry(raw: dict) -> dict:
    sections = raw['sections']
    tables = raw['tables']
    params: list[dict] = []
    for tbl in tables.get('日志参数', []) or tables.get('日志参数表', []):
        for row in tbl[1:]:
            if len(row) >= 2 and row[0].strip():
                params.append({'name': row[0].strip(), 'meaning': row[1].strip()})

    return {
        'module': raw['module'],
        'severity': raw['severity'],
        'mnemonic': raw['mnemonic'],
        'template': '\n'.join(sections.get('日志信息', [])).strip(),
        'meaning': '\n'.join(sections.get('日志含义', [])).strip(),
        'parameters': params,
        'causes': merge_causes(sections.get('可能原因', [])),
        'procedures': [p for p in sections.get('处理步骤', []) if p],
    }


def extract_trap_vars(raw_vars: str) -> list[str]:
    names: list[str] = []
    if '：' in raw_vars:
        names = re.findall(r'([A-Za-z][A-Za-z0-9]+)：', raw_vars)
    if not names:
        names = [t for t in IDENT_RE.findall(raw_vars) if t not in ('NA', 'N', 'A', 'None')]
    seen: list[str] = []
    for n in names:
        if n not in seen:
            seen.append(n)
    return seen


def merge_supplement_into_legacy(
    supplement_path: Path,
    out_traps: dict[str, dict],
    out_nodes: dict[str, dict],
    severity_varbinds: dict[str, dict],
    reason_varbinds: dict[str, str],
) -> tuple[int, int]:
    data = json.loads(supplement_path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise ValueError(f'supplement 格式非法: {supplement_path}')

    added_traps = 0
    for raw_oid, raw_item in data.get('traps', {}).items():
        oid = raw_oid.strip().lstrip('.')
        if not OID_RE.match(oid) or oid in out_traps:
            continue
        name = str(raw_item.get('name', '')).strip()
        if not name:
            continue
        mib = str(raw_item.get('mib', '')).strip()
        derived_level, derived_cleared = classify_level(name)
        level = str(raw_item.get('level') or derived_level).strip()
        if level not in VALID_LEVELS:
            raise ValueError(f'supplement trap {oid} level 非法: {level}')
        facility = str(raw_item.get('facility') or classify_facility(oid, name, mib)).strip()
        if facility not in VALID_FACILITIES:
            raise ValueError(f'supplement trap {oid} facility 非法: {facility}')
        if 'cleared' in raw_item:
            cleared = bool(raw_item['cleared'])
        elif 'level' in raw_item:
            cleared = level == 'info' and derived_cleared
        else:
            cleared = derived_cleared
        meaning = str(raw_item.get('meaning', '')).strip() or name
        vars_list = [str(v).strip() for v in (raw_item.get('vars') or []) if str(v).strip()]
        item: dict = {
            'name': name,
            'mib': mib,
            'level': level,
            'facility': facility,
            'meaning': meaning,
            'vars': vars_list,
        }
        if cleared:
            item['cleared'] = True
        out_traps[oid] = item
        added_traps += 1

    added_nodes = 0
    for raw_oid, raw_node in data.get('nodes', {}).items():
        oid = raw_oid.strip().lstrip('.')
        if not OID_RE.match(oid):
            continue
        raw_enum = raw_node.get('enum')
        enum_map = {str(k).strip(): str(v).strip() for k, v in raw_enum.items()} if isinstance(raw_enum, dict) else {}
        if oid in out_nodes:
            if enum_map and not out_nodes[oid].get('enum'):
                out_nodes[oid]['enum'] = enum_map
            continue
        name = str(raw_node.get('name', '')).strip()
        if not name:
            continue
        item: dict = {'name': name, 'mib': str(raw_node.get('mib', '')).strip()}
        if enum_map:
            item['enum'] = enum_map
        out_nodes[oid] = item
        added_nodes += 1

    for raw_oid, vb in data.get('severity_varbinds', {}).items():
        oid = raw_oid.strip().lstrip('.')
        if OID_RE.match(oid) and oid not in severity_varbinds and isinstance(vb, dict):
            severity_varbinds[oid] = vb
    for raw_oid, name in data.get('reason_varbinds', {}).items():
        oid = raw_oid.strip().lstrip('.')
        if OID_RE.match(oid) and oid not in reason_varbinds and isinstance(name, str) and name.strip():
            reason_varbinds[oid] = name.strip()

    return added_traps, added_nodes


def build_alarms_kb(parsed_alarms: list[dict], legacy_traps: dict[str, dict]) -> tuple[dict, int]:
    grouped: dict[str, list[dict]] = {}
    for entry in parsed_alarms:
        grouped.setdefault(entry['oid'], []).append(entry)

    # 合并历史兼容与 V600 补充包中未出现在 V200R024C00 告警手册的条目，确保全量可查
    for oid, trap in legacy_traps.items():
        if oid in grouped:
            continue
        grouped[oid] = [{
            'oid': oid,
            'module': trap.get('mib', ''),
            'alarm_name': trap.get('name', ''),
            'sub_id': '',
            'alarm_id': oid,
            'severity': trap.get('level', ''),
            'alarm_type': '',
            'trap_template': '',
            'meaning': trap.get('meaning', ''),
            'parameters': [{'name': v, 'meaning': ''} for v in trap.get('vars', [])],
            'impact': '',
            'causes': [],
            'procedures': [],
            'reference': '',
        }]

    alarms_out: list[dict] = []
    modules: set[str] = set()
    variant_total = 0
    for oid in sorted(grouped, key=oid_key):
        items = grouped[oid]
        if items[0]['module']:
            modules.add(items[0]['module'])
        primary = dict(items[0])
        variants_raw = [it for it in items if it['sub_id']]
        if variants_raw:
            variants_raw.sort(key=lambda x: (0, int(x['sub_id'])) if x['sub_id'].isdigit() else (1, x['sub_id']))
            variant_total += len(variants_raw)
            primary['variants'] = [
                {
                    'sub_id': v['sub_id'],
                    'alarm_id': v['alarm_id'],
                    'severity': v['severity'],
                    'alarm_type': v['alarm_type'],
                    'trap_template': v['trap_template'],
                    'meaning': v['meaning'],
                    'parameters': v['parameters'],
                    'impact': v['impact'],
                    'causes': v['causes'],
                    'procedures': v['procedures'],
                    'reference': v['reference'],
                }
                for v in variants_raw
            ]
        alarms_out.append(primary)

    kb = {
        'schema_version': 1,
        'source': 'Huawei S300/S500/S2700/S5700/S6700 V200R024C00 Alarm Reference + huawei-alarms-v600-supplement.json',
        'module_count': len(modules),
        'alarm_count': len(alarms_out),
        'alarms': alarms_out,
    }
    return kb, variant_total


def write_deterministic_gz(path: Path, payload: dict) -> int:
    raw_json = (json.dumps(payload, ensure_ascii=False, indent=1) + '\n').encode('utf-8')
    buf = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(raw_json)
    data = buf.getvalue()
    path.write_bytes(data)
    return len(data)


def write_trap_ts(path: Path, sorted_traps: dict[str, dict], source_desc: str, added_traps: int) -> None:
    supplement_note = f'（含 V600 增量 +{added_traps} 条）' if added_traps > 0 else ''
    lines = [
        '/**',
        ' * 告警 Trap OID 词典（生成物，勿手改）',
        ' *',
        f' * 数据来源：{source_desc}{supplement_note}，全量 {len(sorted_traps)} 条。',
        ' * 生成脚本：scripts/mib/extract-huawei-knowledge.py（同一脚本同时生成后端',
        ' * backend-go/internal/snmpmib/huawei-alarms.json，两侧条目一一对应）。',
        ' *',
        ' * label 为清洗后的简短中文告警名（去除「该节点用来表示」等冗余前缀）；',
        f' * 原始含义超过 {LABEL_MAX} 字时截断为 label，完整表述保留在 detail。',
        ' *',
        ' * 注意：本词典只提供「这条告警是什么」的精确标识，不负责可读性。',
        ' * 官方含义有时比人话更晦涩（如 linkDown 的 ifOperStatus 表述），',
        ' * 故 translate.ts 中 OID 词典不覆盖正则规则的人话结果，仅作补充。',
        ' */',
        '',
        '/** 单条 Trap OID 释义 */',
        'export interface TrapOIDEntry {',
        '  /** 英文节点名，如 hwBoardFail —— 供专业人员核对与检索 */',
        '  name: string',
        '  /** 中文告警名（简短） */',
        '  label: string',
        '  /** 完整官方含义；仅当 label 为截断版时提供 */',
        '  detail?: string',
        '}',
        '',
        '/** 键为完整 OID。按 OID 数值序排列，便于查找与 diff */',
        'export const TRAP_OID_DICTIONARY: Readonly<Record<string, TrapOIDEntry>> = {',
    ]
    for oid, item in sorted_traps.items():
        label, detail = clean_label(oid, item['meaning'], item['name'])
        fields = f"name: {ts_string(item['name'])}, label: {ts_string(label)}"
        if detail:
            fields += f', detail: {ts_string(detail)}'
        lines.append(f'  {ts_string(oid)}: {{ {fields} }},')
    lines.append('}')
    lines.append('')
    path.write_text('\n'.join(lines), encoding='utf-8', newline='\n')


def write_vrp_modules_go(path: Path, modules: set[str]) -> None:
    lines = [
        '// Code generated by scripts/mib/extract-huawei-knowledge.py; DO NOT EDIT.',
        '',
        'package logs',
        '',
        '// vrpOfficialModuleFacilities 覆盖华为官方日志参考与告警参考全部模块到标准 facility 的映射。',
        '// 映射值严格约束在 system/interface/security/routing/switching/snmp/ssh 值域内。',
        'var vrpOfficialModuleFacilities = map[string]string{',
    ]
    for mod in sorted(modules):
        facility = OFFICIAL_MODULE_FACILITY_MAP.get(mod, 'system')
        lines.append(f'\t"{mod}": "{facility}",')
    lines.append('}')
    lines.append('')
    path.write_text('\n'.join(lines), encoding='utf-8', newline='\n')
    try:
        subprocess.run(['gofmt', '-w', str(path)], check=True, capture_output=True)
    except FileNotFoundError:
        pass


def resolve_inputs(docx_dir: Path) -> dict[str, list[Path]]:
    if not docx_dir.is_dir():
        raise FileNotFoundError(f'docx 目录不存在: {docx_dir}')
    grouped: dict[str, list[Path]] = {'mib': [], 'alarms': [], 'logs': []}
    for p in sorted(docx_dir.glob('*.docx'), key=lambda item: item.name):
        if p.name.startswith('~$') or not p.is_file():
            continue
        dtype = detect_docx_type(p)
        grouped[dtype].append(p)
    return grouped


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='华为 S 系列官方全量知识库抽取脚本')
    parser.add_argument('--docx-dir', type=Path, default=DEFAULT_DOCX_DIR, help='包含 4 份华为 .docx 的目录')
    parser.add_argument(
        '--supplement',
        type=Path,
        default=DEFAULT_SUPPLEMENT if DEFAULT_SUPPLEMENT.exists() else None,
        help='V600 增量补充 JSON 路径',
    )
    parser.add_argument('--no-supplement', action='store_true', help='禁用增量补充 JSON')
    parser.add_argument('--preserve-existing', dest='preserve_existing', action='store_true', default=True)
    parser.add_argument('--no-preserve-existing', dest='preserve_existing', action='store_false')
    parser.add_argument('--dry-run', action='store_true', help='仅解析并输出统计，不写入磁盘')
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        grouped = resolve_inputs(args.docx_dir)
    except (FileNotFoundError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    mib_catalog: dict[str, dict] = {}
    mib_traps: dict[str, dict] = {}
    raw_nodes: dict[str, dict] = {}
    name_to_oid: dict[str, str] = {}
    for p in grouped['mib']:
        parse_mib_docx(p, mib_catalog, mib_traps, raw_nodes, name_to_oid)

    parsed_alarms: list[dict] = []
    alarm_modules: set[str] = set()
    for p in grouped['alarms']:
        items, mods = parse_alarm_docx(p)
        parsed_alarms.extend(items)
        alarm_modules.update(mods)

    parsed_logs: list[dict] = []
    log_modules: set[str] = set()
    for p in grouped['logs']:
        items, mods = parse_log_docx(p)
        parsed_logs.extend(items)
        log_modules.update(mods)

    # 兼容基线初始化
    out_traps: dict[str, dict] = {}
    out_nodes: dict[str, dict] = {}
    severity_varbinds: dict[str, dict] = {}
    reason_varbinds: dict[str, str] = {}
    if args.preserve_existing and OUT_ALARMS_JSON.is_file():
        existing = json.loads(OUT_ALARMS_JSON.read_text(encoding='utf-8'))
        out_traps.update(existing.get('traps', {}))
        out_nodes.update(existing.get('nodes', {}))
        severity_varbinds.update(existing.get('severity_varbinds', {}))
        reason_varbinds.update(existing.get('reason_varbinds', {}))

    referenced: set[str] = set()
    for oid, entry in mib_traps.items():
        vars_list = extract_trap_vars(entry['vars_raw'])
        for v in vars_list:
            if v in name_to_oid:
                referenced.add(name_to_oid[v])
        if oid not in out_traps:
            level, cleared = classify_level(entry['name'])
            item: dict = {
                'name': entry['name'],
                'mib': entry['mib'],
                'level': level,
                'facility': classify_facility(oid, entry['name'], entry['mib']),
                'meaning': entry['meaning'],
                'vars': vars_list,
            }
            if cleared:
                item['cleared'] = True
            out_traps[oid] = item

    for entry in parsed_alarms:
        oid = entry['oid']
        if oid not in out_traps:
            level, cleared = classify_level(entry['alarm_name'])
            item = {
                'name': entry['alarm_name'],
                'mib': entry['module'],
                'level': level,
                'facility': classify_facility(oid, entry['alarm_name'], entry['module']),
                'meaning': entry['meaning'] or entry['alarm_name'],
                'vars': [p['name'] for p in entry['parameters'] if p['name'] and p['name'] != 'oid'],
            }
            if cleared:
                item['cleared'] = True
            out_traps[oid] = item

    for oid, node in raw_nodes.items():
        if oid not in out_nodes and (oid in referenced or node['mib'] in ALWAYS_INCLUDE_MIBS):
            item = {'name': node['name'], 'mib': node['mib']}
            if node['enum']:
                item['enum'] = node['enum']
            out_nodes[oid] = item
        name = node['name']
        enum = node['enum']
        is_notify = oid in referenced or node['access'] == 'accessible-for-notify' or oid.startswith('1.3.6.1.4.1.2011.5.25.180.1.')
        if name.endswith('Severity') and enum and set(enum.values()) <= SEVERITY_WORDS and is_notify:
            severity_varbinds.setdefault(oid, {'name': name, 'values': enum})
        if REASON_NAME_RE.search(name) and ('OCTET' in node['dtype'].upper() or 'DisplayString' in node['dtype']) \
                and (node['access'] == 'accessible-for-notify' or oid.startswith('1.3.6.1.4.1.2011.5.25.180.1.')):
            reason_varbinds.setdefault(oid, name)

    added_traps, added_nodes = 0, 0
    if not args.no_supplement and args.supplement is not None and args.supplement.is_file():
        added_traps, added_nodes = merge_supplement_into_legacy(
            args.supplement, out_traps, out_nodes, severity_varbinds, reason_varbinds
        )

    sorted_traps = {k: out_traps[k] for k in sorted(out_traps, key=oid_key)}
    sorted_nodes = {k: out_nodes[k] for k in sorted(out_nodes, key=oid_key)}

    mib_list = [mib_catalog[k] for k in sorted(mib_catalog, key=oid_key)]
    mib_modules = {n['mib'] for n in mib_list if n['mib']}
    mib_kb = {
        'schema_version': 1,
        'source': 'Huawei S300/S500/S2700/S5700/S6700 V200R024C00 MIB Reference',
        'module_count': len(mib_modules),
        'node_count': len(mib_list),
        'nodes': mib_list,
    }

    alarms_kb, variant_count = build_alarms_kb(parsed_alarms, sorted_traps)

    sorted_logs = sorted(parsed_logs, key=lambda x: (x['module'], x['mnemonic'], x['severity']))
    logs_kb = {
        'schema_version': 1,
        'source': 'Huawei S300/S500/S2700/S5700/S6700 V200R024C00 Log Reference',
        'module_count': len(log_modules),
        'log_count': len(sorted_logs),
        'logs': sorted_logs,
    }

    all_vrp_modules = log_modules | alarm_modules
    source_desc = '华为 S300/S500/S2700/S5700/S6700 V200R024C00 产品文档 + huawei-alarms-v600-supplement.json'

    if not args.dry_run:
        legacy_catalog = {
            'schema_version': 1,
            'source': source_desc,
            'generator': 'scripts/mib/extract-huawei-knowledge.py',
            'severity_varbinds': {k: severity_varbinds[k] for k in sorted(severity_varbinds, key=oid_key)},
            'reason_varbinds': {k: reason_varbinds[k] for k in sorted(reason_varbinds, key=oid_key)},
            'traps': sorted_traps,
            'nodes': sorted_nodes,
        }
        OUT_ALARMS_JSON.write_text(json.dumps(legacy_catalog, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
        mib_gz_bytes = write_deterministic_gz(OUT_MIB_GZ, mib_kb)
        alarms_gz_bytes = write_deterministic_gz(OUT_ALARMS_KB_GZ, alarms_kb)
        logs_gz_bytes = write_deterministic_gz(OUT_LOGS_KB_GZ, logs_kb)
        write_trap_ts(OUT_TRAP_TS, sorted_traps, source_desc, added_traps)
        write_vrp_modules_go(OUT_VRP_MODULES_GO, all_vrp_modules)
        print(
            f'mib_modules={len(mib_modules)} mib_nodes={len(mib_list)} ({mib_gz_bytes} B) | '
            f'official_alarms={len(parsed_alarms)} (variants={variant_count}) kb_alarms={len(alarms_kb["alarms"])} ({alarms_gz_bytes} B) | '
            f'log_modules={len(log_modules)} logs={len(sorted_logs)} ({logs_gz_bytes} B) | '
            f'legacy_traps={len(sorted_traps)} legacy_nodes={len(sorted_nodes)} | vrp_modules={len(all_vrp_modules)}'
        )
    else:
        print(
            f'[dry-run] mib_modules={len(mib_modules)} mib_nodes={len(mib_list)} | '
            f'official_alarms={len(parsed_alarms)} (variants={variant_count}) kb_alarms={len(alarms_kb["alarms"])} | '
            f'log_modules={len(log_modules)} logs={len(sorted_logs)} | '
            f'legacy_traps={len(sorted_traps)} legacy_nodes={len(sorted_nodes)} | vrp_modules={len(all_vrp_modules)}'
        )
    return 0


if __name__ == '__main__':
    sys.exit(main())
