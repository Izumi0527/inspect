#!/usr/bin/env python3
"""从华为 S 系列产品文档（MIB 参考 docx）抽取全部告警（Trap）定义与相关 MIB 节点，
生成后端知识库 JSON 与前端 Trap OID 词典 TS。

用法（在项目根目录执行）：
    python scripts/mib/extract-huawei-alarms.py [docx 路径]

默认 docx：docs/vendor/S300, S500, S2700, S5700, S6700 产品文档_20260803 094100.docx
输出：
    backend-go/internal/snmpmib/huawei-alarms.json
    frontend/src/lib/plain-language/trap-oids.ts

脚本只依赖标准库；两次运行输出完全一致（键按 OID 数值排序）。
级别判定规则见 CLEARED_RE / CRITICAL_RE，设施判定见 FACILITY_NAME_RULES / FACILITY_MIB_RULES，便于审阅与调整。
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DOCX = ROOT / 'docs' / 'vendor' / 'S300, S500, S2700, S5700, S6700 产品文档_20260803 094100.docx'
OUT_JSON = ROOT / 'backend-go' / 'internal' / 'snmpmib' / 'huawei-alarms.json'
OUT_TS = ROOT / 'frontend' / 'src' / 'lib' / 'plain-language' / 'trap-oids.ts'

MIB_HEADING = re.compile(r'^1\.\d+ ([A-Za-z0-9-]+MIB)$')
# 表头有「节点名称/节点」「最大访问权限/访问权限/实现规格」乃至英文等变体，只按第 1、3 列判定表类型
TRAP_VAR_HEADERS = ('绑定变量', 'Binding Variable')
NODE_TYPE_HEADER = '数据类型'
OID_RE = re.compile(r'^\d+(\.\d+)+$')
IDENT_RE = re.compile(r'[A-Za-z][A-Za-z0-9]+')
ENUM_RE = re.compile(r'([A-Za-z][A-Za-z0-9_-]*)\s*[(（]\s*(\d+)\s*[)）]')

# 这些 MIB 的全部节点都进入 nodes（它们是告警绑定变量的主要来源，且体量可控）
ALWAYS_INCLUDE_MIBS = {
    'IF-MIB', 'ENTITY-MIB', 'HUAWEI-BASE-TRAP-MIB', 'HUAWEI-ENTITY-TRAP-MIB',
    'HUAWEI-ALARM-MIB', 'NOTIFICATION-LOG-MIB', 'HUAWEI-INFOCENTER-MIB',
}

# ---- 级别判定（按顺序命中即止）------------------------------------------------
# 恢复/清除类先判（hwCardInvalidResume 是恢复而非故障）→ info 且 cleared=true；
# `(?<![Ii]n)Valid` 只认 Valid 不认 Invalid。NearlyExpired 是预警不是失效，不进 critical。
CLEARED_RE = re.compile(
    r'Resume|Recover|Restore|Clear|Normal|Online|Insert|Connect(?!ion)|Established|Success'
    r'|Completed|Enabled|(?<![Ii]n)Valid|Full$|Up$|On$|Close$|Login$|Logout$',
)
CRITICAL_RE = re.compile(
    r'Fail|Fault|Fatal|Invalid|Unusable|DyingGasp|PowerOff|Storm|Attack|Exhaust|Overload'
    r'|Broken|ProcessExit|Reboot|(?<!Nearly)Expire|Insufficient|AllMemberDown|TotalLinkLoss'
    r'|Temp\w*(Alarm|Rising|Falling)|(Fan|Power|Psu|Battery)\w*(Remove|Absent|Invalid)',
)

# ---- 设施判定 ---------------------------------------------------------------
# 值域：system/interface/security/routing/switching/snmp/ssh + hardware/configuration
# （后两者只影响告警分类，日志入库时由 normalizeFacility 折回 system）。
FACILITY_NAME_RULES = [
    ('hardware', re.compile(r'Temp|Fan|Power|Psu|Board|Card|Optical|Chassis|Volt|Humid|Battery|Rps|Lcd|Cmu|Entity(?!Ext)|Sensor|Fog|Gate|Unstable')),
    ('security', re.compile(r'Login|Logout|Auth|Password|Attack|Acl|Portal|Radius|Tacacs|Spoof|Wids|Snooping|Snp|Arp|Dhcp|Nac|Dot1x|8021x|Ipsg|Pki|Ssl|Ipsec|Secure|Quiet')),
    ('system', re.compile(r'Cpu|CPU|Mem(?!ber)|Memory|Flash|Storage|Patch|Upgrade|License|Gtl|Clock|Ntp|Ptp|Config|Reboot|Restart|Process')),
    ('interface', re.compile(r'Port|Link|Lacp|Trunk|Duplex|Ifnet|If[A-Z]|Interface|Optical|Lldp|Dldp|Efm|Cfm|Poe')),
]
FACILITY_MIB_RULES = [
    ('interface', ('IF-MIB', 'HUAWEI-IF-EXT-MIB', 'EtherLike-MIB', 'LAG-MIB', 'HUAWEI-PORT-MIB', 'HUAWEI-LLDP-MIB', 'LLDP-MIB',
                   'LLDP-EXT-DOT1-MIB', 'LLDP-EXT-DOT3-MIB', 'HUAWEI-DLDP-MIB', 'HUAWEI-ETHOAM-MIB', 'HUAWEI-E-TRUNK-MIB',
                   'HUAWEI-POE-MIB', 'HUAWEI-ERRORDOWN-MIB', 'HUAWEI-LDT-MIB', 'HUAWEI-RUMNG-MIB')),
    ('switching', ('BRIDGE-MIB', 'P-BRIDGE-MIB', 'Q-BRIDGE-MIB', 'HUAWEI-MSTP-MIB', 'HUAWEI-L2VLAN-MIB', 'HUAWEI-L2MAM-MIB',
                   'HUAWEI-L2IF-MIB', 'HUAWEI-STACK-MIB', 'HUAWEI-ERPS-MIB', 'HUAWEI-RRPP-MIB', 'HUAWEI-VBST-MIB',
                   'HUAWEI-MFLP-MIB', 'HUAWEI-SEP-MIB', 'HUAWEI-QINQ-MIB', 'HUAWEI-GARP-APP-MIB', 'HUAWEI-SWITCH-L2MAM-EXT-MIB',
                   'HUAWEI-XQoS-MIB', 'HUAWEI-HGMP-MIB', 'HUAWEI-UNIMNG-MIB', 'HUAWEI-MFF-MIB', 'HUAWEI-ISOLATE-MIB')),
    ('routing', ('BGP4-MIB', 'HUAWEI-BGP-VPN-MIB', 'OSPF-MIB', 'OSPF-TRAP-MIB', 'HUAWEI-OSPFV2-MIB', 'HUAWEI-OSPFV3-MIB',
                 'ISIS-MIB', 'RIPv2-MIB', 'HUAWEI-RIPV2-EXT-MIB', 'HUAWEI-RM-EXT-MIB', 'HUAWEI-BFD-MIB',
                 'HUAWEI-BFD-CONFIG-TRAP-MIB', 'VRRP-MIB', 'VRRPV3-MIB', 'HUAWEI-VRRP-EXT-MIB', 'HUAWEI-MPLS-EXTEND-MIB',
                 'HUAWEI-MPLSLDP-MIB', 'HUAWEI-MPLSLSR-EXT-MIB', 'HUAWEI-MPLSOAM-MIB', 'HUAWEI-LSP-PING-TRACE-TRAP-MIB',
                 'HUAWEI-L2VPN-MIB', 'HUAWEI-VPLS-EXT-MIB', 'HUAWEI-VPLS-TNL-MIB', 'HUAWEI-PWE3-MIB', 'HUAWEI-PWE3-TNL-MIB',
                 'HUAWEI-KOMPELLA-MIB', 'HUAWEI-CCC-MIB', 'HUAWEI-TUNNEL-TE-MIB', 'HUAWEI-RSVPTE-MIB', 'HUAWEI-VXLAN-MIB',
                 'HUAWEI-IPV6-MIB', 'IPV6-MIB', 'IP-MIB', 'IP-FORWARD-MIB', 'HUAWEI-GTSM-MIB', 'HUAWEI-MSDP-MIB', 'MSDP-MIB',
                 'HUAWEI-VPN-DIAGNOSTICS-MIB', 'HUAWEI-MULTICAST-MIB', 'HUAWEI-IPMCAST-MIB', 'IPMCAST-MIB', 'HUAWEI-MGMD-STD-MIB',
                 'MGMD-STD-MIB', 'HUAWEI-PIM-STD-MIB', 'HUAWEI-PIM-BSR-MIB', 'PIM-STD-MIB', 'PIM-BSR-MIB',
                 'MPLS-FTN-STD-MIB', 'MPLS-L3VPN-STD-MIB', 'MPLS-LDP-GENERIC-STD-MIB', 'MPLS-LDP-STD-MIB', 'MPLS-LSR-STD-MIB',
                 'MPLS-TE-STD-MIB', 'HUAWEI-L2VC-STATISTIC-MIB')),
    ('security', ('HUAWEI-AAA-MIB', 'HUAWEI-ACL-MIB', 'HUAWEI-SECURITY-MIB', 'HUAWEI-SECURITY-PKI-MIB', 'HUAWEI-SECURITY-IPSEC-MIB',
                  'HUAWEI-DHCP-SNOOPING-MIB', 'HUAWEI-DHCPS-MIB', 'HUAWEI-DHCPR-MIB', 'HUAWEI-MAC-AUTHEN-MIB', 'HUAWEI-PORTAL-MIB',
                  'HUAWEI-HWTACACS-MIB', 'HUAWEI-BRAS-RADIUS-MIB', 'HUAWEI-BRAS-SRVCFG-EAP-MIB', 'HUAWEI-BRAS-SRVCFG-STATICUSER-MIB',
                  'HUAWEI-USA-MIB', 'HUAWEI-USC-MIB', 'SAVI-MIB', 'HUAWEI-WLAN-WIDS-SERVICE-MIB', 'HUAWEI-ETHARP-MIB',
                  'HUAWEI-TCP-MIB', 'HUAWEI-DAD-MIB', 'HUAWEI-DIE-MIB')),
    ('snmp', ('SNMPv2-MIB', 'SNMP-FRAMEWORK-MIB', 'SNMP-MPD-MIB', 'SNMP-NOTIFICATION-MIB', 'SNMP-TARGET-MIB',
              'SNMP-USER-BASED-SM-MIB', 'SNMP-VIEW-BASED-ACM-MIB', 'HUAWEI-SNMP-EXT-MIB', 'HUAWEI-ALARM-MIB',
              'HUAWEI-ALARM-RELIABILITY-MIB', 'NOTIFICATION-LOG-MIB', 'RMON-MIB', 'RMON2-MIB')),
    ('ssh', ('HUAWEI-SSH-MIB', 'HUAWEI-HTTP-MIB', 'HUAWEI-TFTPC-MIB')),
    ('hardware', ('HUAWEI-ENTITY-TRAP-MIB', 'HUAWEI-ENTITY-EXTENT-MIB', 'ENTITY-MIB', 'HUAWEI-BASE-TRAP-MIB',
                  'HUAWEI-ENERGYMNGT-MIB', 'HUAWEI-DC-TRAP-MIB', 'HUAWEI-DEVICE-MIB')),
    ('configuration', ('HUAWEI-CONFIG-MAN-MIB', 'HUAWEI-EASY-OPERATION-MIB', 'HUAWEI-DATASYNC-MIB', 'HUAWEI-AUTODIAGNOSE-MIB')),
]
# SNMPv2 通用 Trap 逐条钉死，与注册表 trap.overrides 一致
GENERIC_TRAP_FACILITY = {
    '1.3.6.1.6.3.1.1.5.1': 'system', '1.3.6.1.6.3.1.1.5.2': 'system',
    '1.3.6.1.6.3.1.1.5.3': 'interface', '1.3.6.1.6.3.1.1.5.4': 'interface',
    '1.3.6.1.6.3.1.1.5.5': 'security', '1.3.6.1.6.3.1.1.5.6': 'snmp',
}

SEVERITY_WORDS = {'cleared', 'indeterminate', 'critical', 'major', 'minor', 'warning'}
REASON_NAME_RE = re.compile(r'Reason(Descr|Info)?$')
LABEL_MAX = 24
LABEL_PREFIXES = ('该节点用来表示', '该节点标识', '该节点表示', '该告警表示', '该trap表示', '该Trap表示')
# 「当 X 时触发告警」「X，产生告警」之类的框架套话：剥掉后剩下的 X 才是告警名
LABEL_SUFFIX_RE = re.compile(
    r'[，,]?(?:并|且|同时)?(?:会|将|则)?(?:触发|产生|出发|发出|上报|发送)(?:该|此|一条)?(?:告警信息|告警|trap|Trap|TRAP|通知|信息)$')
# 高频标准 Trap 的人工精修名称（官方含义是整段协议描述，不适合做标题）
LABEL_OVERRIDES = {
    '1.3.6.1.6.3.1.1.5.1': '设备冷启动',
    '1.3.6.1.6.3.1.1.5.2': '设备热启动',
    '1.3.6.1.6.3.1.1.5.3': '链路断开',
    '1.3.6.1.6.3.1.1.5.4': '链路恢复',
    '1.3.6.1.6.3.1.1.5.5': 'SNMP 认证失败',
}


def para_text(p) -> str:
    parts = []
    for node in p.iter():
        if node.tag == W + 't' and node.text:
            parts.append(node.text)
        elif node.tag == W + 'tab':
            parts.append('\t')
        elif node.tag == W + 'br':
            parts.append('\n')
    return ''.join(parts)


def iter_blocks(docx: Path):
    """流式产出 ('p', text) 与 ('tbl', rows) 两种块；表格内段落不单独产出。"""
    z = zipfile.ZipFile(docx)
    with z.open('word/document.xml') as f:
        depth = 0
        for event, el in ET.iterparse(f, events=('start', 'end')):
            if event == 'start':
                if el.tag == W + 'tbl':
                    depth += 1
                continue
            if el.tag == W + 'tbl':
                depth -= 1
                if depth == 0:
                    rows = []
                    for tr in el.iter(W + 'tr'):
                        cells = []
                        for tc in tr.findall(W + 'tc'):
                            cells.append(' '.join(para_text(p).strip() for p in tc.iter(W + 'p')).strip())
                        rows.append(cells)
                    yield 'tbl', rows
                    el.clear()
            elif el.tag == W + 'p' and depth == 0:
                text = para_text(el).strip()
                if text:
                    yield 'p', text
                el.clear()


def parse_enum(dtype: str) -> dict[str, str]:
    if not dtype or '..' in dtype and '(' in dtype and '{' not in dtype:
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


def oid_key(oid: str):
    return tuple(int(x) for x in oid.split('.'))


def clean_label(oid: str, meaning: str, name: str) -> tuple[str, str | None]:
    """返回 (label, detail)。detail 仅在 label 不再是完整官方含义时给出。"""
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
        # 「X，当 Y」剥掉套话后残留的条件从句没有信息量
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
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def main() -> int:
    docx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DOCX
    if not docx.exists():
        print(f'docx 不存在: {docx}', file=sys.stderr)
        return 1

    traps: dict[str, dict] = {}
    nodes: dict[str, dict] = {}
    name_to_oid: dict[str, str] = {}
    cur_mib = None
    for kind, payload in iter_blocks(docx):
        if kind == 'p':
            m = MIB_HEADING.match(payload)
            if m:
                cur_mib = m.group(1)
            continue
        rows = payload
        if not rows or len(rows[0]) < 4:
            continue
        header = [c.strip() for c in rows[0][:4]]
        if header[0] != 'OID':
            continue
        if header[2] in TRAP_VAR_HEADERS and header[3] != '最大访问权限':
            for cells in rows[1:]:
                if len(cells) < 4 or not OID_RE.match(cells[0]):
                    continue
                oid = cells[0]
                name = re.sub(r'\s+', '', cells[1])
                if oid in traps or not name:
                    continue
                traps[oid] = {
                    'name': name,
                    'mib': cur_mib or '',
                    'vars_raw': cells[2],
                    'meaning': cells[3].strip(),
                }
        elif header[2] == NODE_TYPE_HEADER:
            for cells in rows[1:]:
                if len(cells) < 4 or not OID_RE.match(cells[0]):
                    continue
                oid = cells[0]
                name = re.sub(r'\s+', '', cells[1])
                if oid in nodes or not name:
                    continue
                nodes[oid] = {
                    'name': name,
                    'mib': cur_mib or '',
                    'enum': parse_enum(cells[2]),
                    'access': cells[3].strip().lower(),
                    'dtype': cells[2],
                }
                name_to_oid.setdefault(name, oid)

    # 绑定变量名 → 引用节点集合
    referenced: set[str] = set()
    for entry in traps.values():
        raw = entry.pop('vars_raw')
        names: list[str] = []
        if '：' in raw:
            names = re.findall(r'([A-Za-z][A-Za-z0-9]+)：', raw)
        if not names:
            names = [t for t in IDENT_RE.findall(raw) if t not in ('NA', 'N', 'A', 'None')]
        seen: list[str] = []
        for n in names:
            if n not in seen:
                seen.append(n)
        entry['vars'] = seen
        for n in seen:
            oid = name_to_oid.get(n)
            if oid:
                referenced.add(oid)

    out_nodes: dict[str, dict] = {}
    for oid, node in nodes.items():
        if oid in referenced or node['mib'] in ALWAYS_INCLUDE_MIBS:
            item = {'name': node['name'], 'mib': node['mib']}
            if node['enum']:
                item['enum'] = node['enum']
            out_nodes[oid] = item

    severity_varbinds: dict[str, dict] = {}
    reason_varbinds: dict[str, str] = {}
    for oid, node in nodes.items():
        name = node['name']
        enum = node['enum']
        is_notify_var = oid in referenced or node['access'] == 'accessible-for-notify'             or oid.startswith('1.3.6.1.4.1.2011.5.25.180.1.')
        if name.endswith('Severity') and enum and set(enum.values()) <= SEVERITY_WORDS and is_notify_var:
            severity_varbinds[oid] = {'name': name, 'values': enum}
        if REASON_NAME_RE.search(name) and ('OCTET' in node['dtype'].upper() or 'DisplayString' in node['dtype']) \
                and (node['access'] == 'accessible-for-notify' or oid.startswith('1.3.6.1.4.1.2011.5.25.180.1.')):
            reason_varbinds[oid] = name

    out_traps: dict[str, dict] = {}
    for oid in sorted(traps, key=oid_key):
        entry = traps[oid]
        level, cleared = classify_level(entry['name'])
        facility = classify_facility(oid, entry['name'], entry['mib'])
        item = {
            'name': entry['name'],
            'mib': entry['mib'],
            'level': level,
            'facility': facility,
            'meaning': entry['meaning'],
            'vars': entry['vars'],
        }
        if cleared:
            item['cleared'] = True
        out_traps[oid] = item

    catalog = {
        'schema_version': 1,
        'source': docx.name,
        'generator': 'scripts/mib/extract-huawei-alarms.py',
        'severity_varbinds': {k: severity_varbinds[k] for k in sorted(severity_varbinds, key=oid_key)},
        'reason_varbinds': {k: reason_varbinds[k] for k in sorted(reason_varbinds, key=oid_key)},
        'traps': out_traps,
        'nodes': {k: out_nodes[k] for k in sorted(out_nodes, key=oid_key)},
    }
    OUT_JSON.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')

    lines = [
        '/**',
        ' * 告警 Trap OID 词典（生成物，勿手改）',
        ' *',
        f' * 数据来源：华为《{docx.stem}》「告警节点详细描述」章节，全量 {len(out_traps)} 条。',
        ' * 生成脚本：scripts/mib/extract-huawei-alarms.py（同一脚本同时生成后端',
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
    for oid, item in out_traps.items():
        label, detail = clean_label(oid, item['meaning'], item['name'])
        fields = f"name: {ts_string(item['name'])}, label: {ts_string(label)}"
        if detail:
            fields += f", detail: {ts_string(detail)}"
        lines.append(f"  {ts_string(oid)}: {{ {fields} }},")
    lines.append('}')
    lines.append('')
    OUT_TS.write_text('\n'.join(lines), encoding='utf-8', newline='\n')

    print(f'traps={len(out_traps)} nodes={len(out_nodes)} severity_varbinds={len(severity_varbinds)} '
          f'reason_varbinds={len(reason_varbinds)}')
    print(f'json -> {OUT_JSON.relative_to(ROOT)} ({OUT_JSON.stat().st_size // 1024} KB)')
    print(f'ts   -> {OUT_TS.relative_to(ROOT)} ({OUT_TS.stat().st_size // 1024} KB)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
