# 厂商 SNMP OID 映射表

本文档整理了各主流网络设备厂商的 SNMP OID 映射表，包括标准 MIB-II OID 和厂商私有 OID。

## 运行时来源说明

- 当前系统的**运行时 OID 数据源**已迁移到 `backend-go/internal/snmpmib/vendor-oids.json`
- 本文档现在主要用于**人工查阅、对照和补充资料整理**
- 如需新增或调整设备采集 / Trap / 探测使用的 OID，请优先修改：
  - `backend-go/internal/snmpmib/vendor-oids.json`
- 修改完成后，再视需要同步本文档，避免“代码实际行为”和“文档说明”出现双标准
- 方案落地说明请查看：
  - `docs/features/devices/snmp-mib-json-registry-implementation.md`
- 后续新增厂商与 OID 的维护规范请查看：
  - `docs/features/devices/snmp-mib-oid-maintenance-guide.md`
- 如需逐字段查看 `vendor-oids.json` 结构，请查看：
  - `docs/features/devices/snmp-mib-vendor-oids-json-reference.md`

## 目录

1. [标准 MIB-II OID](#标准-mib-ii-oid)
2. [Cisco OID](#cisco-oid)
3. [Huawei OID](#huawei-oid)
4. [H3C OID](#h3c-oid)
5. [Juniper OID](#juniper-oid)
6. [Arista OID](#arista-oid)
7. [Fortinet OID](#fortinet-oid)
8. [使用示例](#使用示例)

---

## 标准 MIB-II OID

这些 OID 是 RFC 1213 定义的标准 MIB-II，所有支持 SNMP 的设备都应该支持。

### 系统信息 (System Group)

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| sysDescr | 1.3.6.1.2.1.1.1.0 | DisplayString | 系统描述信息 |
| sysObjectID | 1.3.6.1.2.1.1.2.0 | OBJECT IDENTIFIER | 系统对象标识符 |
| sysUpTime | 1.3.6.1.2.1.1.3.0 | TimeTicks | 系统运行时间（1/100 秒） |
| sysContact | 1.3.6.1.2.1.1.4.0 | DisplayString | 系统联系人 |
| sysName | 1.3.6.1.2.1.1.5.0 | DisplayString | 系统名称 |
| sysLocation | 1.3.6.1.2.1.1.6.0 | DisplayString | 系统位置 |
| sysServices | 1.3.6.1.2.1.1.7.0 | INTEGER | 系统提供的服务 |

### 接口信息 (Interfaces Group)

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| ifNumber | 1.3.6.1.2.1.2.1.0 | INTEGER | 接口数量 |
| ifIndex | 1.3.6.1.2.1.2.2.1.1 | INTEGER | 接口索引 |
| ifDescr | 1.3.6.1.2.1.2.2.1.2 | DisplayString | 接口描述 |
| ifType | 1.3.6.1.2.1.2.2.1.3 | INTEGER | 接口类型 |
| ifMtu | 1.3.6.1.2.1.2.2.1.4 | INTEGER | 接口 MTU |
| ifSpeed | 1.3.6.1.2.1.2.2.1.5 | Gauge32 | 接口速率（bps） |
| ifPhysAddress | 1.3.6.1.2.1.2.2.1.6 | PhysAddress | 物理地址（MAC） |
| ifAdminStatus | 1.3.6.1.2.1.2.2.1.7 | INTEGER | 管理状态（1=up, 2=down） |
| ifOperStatus | 1.3.6.1.2.1.2.2.1.8 | INTEGER | 操作状态（1=up, 2=down） |
| ifInOctets | 1.3.6.1.2.1.2.2.1.10 | Counter32 | 接收字节数 |
| ifInUcastPkts | 1.3.6.1.2.1.2.2.1.11 | Counter32 | 接收单播包数 |
| ifInErrors | 1.3.6.1.2.1.2.2.1.14 | Counter32 | 接收错误包数 |
| ifOutOctets | 1.3.6.1.2.1.2.2.1.16 | Counter32 | 发送字节数 |
| ifOutUcastPkts | 1.3.6.1.2.1.2.2.1.17 | Counter32 | 发送单播包数 |
| ifOutErrors | 1.3.6.1.2.1.2.2.1.20 | Counter32 | 发送错误包数 |

### IP 信息 (IP Group)

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| ipForwarding | 1.3.6.1.2.1.4.1.0 | INTEGER | IP 转发状态 |
| ipInReceives | 1.3.6.1.2.1.4.3.0 | Counter32 | 接收的 IP 包数 |
| ipInDelivers | 1.3.6.1.2.1.4.9.0 | Counter32 | 成功投递的 IP 包数 |
| ipOutRequests | 1.3.6.1.2.1.4.10.0 | Counter32 | 发送的 IP 包数 |

### ICMP 信息 (ICMP Group)

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| icmpInMsgs | 1.3.6.1.2.1.5.1.0 | Counter32 | 接收的 ICMP 消息数 |
| icmpInErrors | 1.3.6.1.2.1.5.2.0 | Counter32 | 接收的 ICMP 错误数 |
| icmpOutMsgs | 1.3.6.1.2.1.5.14.0 | Counter32 | 发送的 ICMP 消息数 |

### TCP 信息 (TCP Group)

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| tcpActiveOpens | 1.3.6.1.2.1.6.5.0 | Counter32 | 主动打开的 TCP 连接数 |
| tcpPassiveOpens | 1.3.6.1.2.1.6.6.0 | Counter32 | 被动打开的 TCP 连接数 |
| tcpCurrEstab | 1.3.6.1.2.1.6.9.0 | Gauge32 | 当前建立的 TCP 连接数 |
| tcpInSegs | 1.3.6.1.2.1.6.10.0 | Counter32 | 接收的 TCP 段数 |
| tcpOutSegs | 1.3.6.1.2.1.6.11.0 | Counter32 | 发送的 TCP 段数 |

---

## Cisco OID

Cisco 企业 OID 前缀：`1.3.6.1.4.1.9`

### CPU 和内存

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| avgBusy5 | 1.3.6.1.4.1.9.2.1.56.0 | INTEGER | 5 秒平均 CPU 使用率（%） |
| avgBusy1 | 1.3.6.1.4.1.9.2.1.57.0 | INTEGER | 1 分钟平均 CPU 使用率（%） |
| avgBusy5min | 1.3.6.1.4.1.9.2.1.58.0 | INTEGER | 5 分钟平均 CPU 使用率（%） |
| ciscoMemoryPoolUsed | 1.3.6.1.4.1.9.9.48.1.1.1.5.1 | Gauge32 | 已使用内存（字节） |
| ciscoMemoryPoolFree | 1.3.6.1.4.1.9.9.48.1.1.1.6.1 | Gauge32 | 空闲内存（字节） |

### 环境监控

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| ciscoEnvMonTemperatureStatusValue | 1.3.6.1.4.1.9.9.13.1.3.1.3 | Gauge32 | 温度值（摄氏度） |
| ciscoEnvMonFanState | 1.3.6.1.4.1.9.9.13.1.4.1.3 | INTEGER | 风扇状态 |
| ciscoEnvMonSupplyState | 1.3.6.1.4.1.9.9.13.1.5.1.3 | INTEGER | 电源状态 |

### 接口扩展

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| ifHCInOctets | 1.3.6.1.2.1.31.1.1.1.6 | Counter64 | 接收字节数（64位） |
| ifHCOutOctets | 1.3.6.1.2.1.31.1.1.1.10 | Counter64 | 发送字节数（64位） |
| ifHighSpeed | 1.3.6.1.2.1.31.1.1.1.15 | Gauge32 | 接口速率（Mbps） |

### BGP

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| cbgpPeerState | 1.3.6.1.4.1.9.9.187.1.2.5.1.3 | INTEGER | BGP 邻居状态 |
| cbgpPeerAdminStatus | 1.3.6.1.4.1.9.9.187.1.2.5.1.4 | INTEGER | BGP 邻居管理状态 |

---

## Huawei OID

Huawei 企业 OID 前缀：`1.3.6.1.4.1.2011`

说明：

- 已运行时接入：CPU、内存、温度
- 已运行时接入（返回摘要 + 持久化 tags）：BGP 邻居摘要、光模块诊断摘要
- 已纳入 `backend-go/internal/snmpmib/vendor-oids.json -> catalog.huawei`：
  接口速率、BGP、PoE、光模块诊断、环境扩展状态

### CPU 和内存

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hwEntityCpuUsage | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5 | INTEGER | CPU 使用率（%） |
| hwEntityMemUsage | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7 | INTEGER | 内存使用率（%） |
| hwEntityMemSize | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.10 | INTEGER | 内存大小（KB） |

### 环境监控

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hwEntityTemperature | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.11 | INTEGER | 温度值（摄氏度） |
| hwEntityOperStatus | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.2 | INTEGER | 实体运行状态 |
| hwEntityFanState | 1.3.6.1.4.1.2011.5.25.31.1.1.10.1.7 | INTEGER | 风扇状态 |
| hwEntityPowerState | 1.3.6.1.4.1.2011.5.25.31.1.1.11.1.3 | INTEGER | 电源状态 |
| hwEntityVoltage | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.14 | INTEGER | 实体当前电压 |

### 接口扩展

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hwIfMonitorInputRate | 1.3.6.1.4.1.2011.5.25.41.1.7.1.1.8 | Gauge32 | 接口输入实时速率（bps） |
| hwIfMonitorOutputRate | 1.3.6.1.4.1.2011.5.25.41.1.7.1.1.10 | Gauge32 | 接口输出实时速率（bps） |

### BGP

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hwBgpPeerState | 1.3.6.1.4.1.2011.5.25.177.1.1.2.1.5 | INTEGER | BGP 对等体状态 |
| hwBgpPeerFsmEstablishedTime | 1.3.6.1.4.1.2011.5.25.177.1.1.2.1.7 | Gauge32 | BGP 会话已建立时长 |

### PoE

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hwPoePortConsumingPower | 1.3.6.1.4.1.2011.6.3.18.1.4.1.6 | INTEGER | PoE 端口当前功耗 |
| hwPoePortPeakPower | 1.3.6.1.4.1.2011.6.3.18.1.4.1.7 | INTEGER | PoE 端口峰值功耗 |
| hwPoePortVoltage | 1.3.6.1.4.1.2011.6.3.18.1.4.1.8 | OCTET STRING | PoE 端口输出电压 |
| hwPoePortCurrent | 1.3.6.1.4.1.2011.6.3.18.1.4.1.9 | OCTET STRING | PoE 端口输出电流 |

### 光模块诊断

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hwEntityOpticalVoltage | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.17 | INTEGER | 光模块供电电压 |
| hwEntityOpticalCurrent | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.18 | INTEGER | 光模块偏置电流 |
| hwEntityOpticalRxPower | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.19 | INTEGER | 光模块接收光功率 |
| hwEntityOpticalTxPower | 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.20 | INTEGER | 光模块发送光功率 |

---

## H3C OID

H3C 企业 OID 前缀：`1.3.6.1.4.1.25506`

说明：

- 已运行时接入：CPU、内存、温度
- 已运行时接入（返回摘要 + 持久化 tags）：BGP 邻居摘要、光模块诊断摘要
- 已纳入 `backend-go/internal/snmpmib/vendor-oids.json -> catalog.h3c`：
  BGP4V2、PoE 功率目录、实体电压/功耗、光模块诊断

### CPU 和内存

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hh3cEntityExtCpuUsage | 1.3.6.1.4.1.25506.2.6.1.1.1.1.6 | INTEGER | CPU 使用率（%） |
| hh3cEntityExtMemUsage | 1.3.6.1.4.1.25506.2.6.1.1.1.1.8 | INTEGER | 内存使用率（%） |
| hh3cEntityExtMemSize | 1.3.6.1.4.1.25506.2.6.1.1.1.1.10 | INTEGER | 内存大小（字节） |

### 环境监控

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hh3cEntityExtTemperature | 1.3.6.1.4.1.25506.2.6.1.1.1.1.12 | INTEGER | 温度值（摄氏度） |
| hh3cFanState | 1.3.6.1.4.1.25506.8.35.9.1.2.1.2 | INTEGER | 风扇状态 |
| hh3cPowerState | 1.3.6.1.4.1.25506.8.35.9.1.1.1.2 | INTEGER | 电源状态 |
| hh3cEntityExtCurrentPower | 1.3.6.1.4.1.25506.2.6.1.3.1.1.3 | Gauge32 | 实体当前功耗（mW） |
| hh3cEntityExtCurrentVoltage | 1.3.6.1.4.1.25506.2.6.1.3.1.1.4 | Gauge32 | 实体当前电压（mV） |

### BGP

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hh3cBgp4V2PeerLastErrorCodeReceived | 1.3.6.1.4.1.25506.2.183.1.1.1.2 | OCTET STRING | BGP 对等体最近一次收到的错误码 |
| hh3cBgp4V2PeerState | 1.3.6.1.4.1.25506.2.183.1.1.1.3 | INTEGER | BGP 对等体状态 |

### PoE

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hh3cMainGuaranteedPowerRemaining | 1.3.6.1.4.1.25506.2.14.2.1.4 | Gauge32 | 主 PSE 剩余保障功率（W） |
| hh3cPsePortPeakPower | 1.3.6.1.4.1.25506.2.14.1.1.3 | INTEGER | PoE 端口峰值功率配置 |

### 光模块诊断

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| hh3cTransceiverBiasCurrent | 1.3.6.1.4.1.25506.18.2.1.1.2 | Gauge32 | 光模块偏置电流（0.1uA） |
| hh3cTransceiverVoltage | 1.3.6.1.4.1.25506.18.2.1.1.4 | Gauge32 | 光模块工作电压（0.1mV） |
| hh3cTransceiverCurTXPower | 1.3.6.1.4.1.25506.18.2.1.1.5 | Gauge32 | 光模块当前发光功率（0.1uW） |
| hh3cTransceiverCurRXPower | 1.3.6.1.4.1.25506.18.2.1.1.6 | Gauge32 | 光模块当前收光功率（0.1uW） |

---

## Juniper OID

Juniper 企业 OID 前缀：`1.3.6.1.4.1.2636`

### CPU 和内存

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| jnxOperatingCPU | 1.3.6.1.4.1.2636.3.1.13.1.8 | Gauge32 | CPU 使用率（%） |
| jnxOperatingBuffer | 1.3.6.1.4.1.2636.3.1.13.1.11 | Gauge32 | 内存使用率（%） |
| jnxOperatingDRAMSize | 1.3.6.1.4.1.2636.3.1.13.1.10 | INTEGER | 内存大小（MB） |

### 环境监控

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| jnxOperatingTemp | 1.3.6.1.4.1.2636.3.1.13.1.7 | Gauge32 | 温度值（摄氏度） |

### BGP

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| jnxBgpM2PeerState | 1.3.6.1.4.1.2636.5.1.1.2.1.1.1.2 | INTEGER | BGP 邻居状态 |
| jnxBgpM2PeerStatus | 1.3.6.1.4.1.2636.5.1.1.2.1.1.1.3 | INTEGER | BGP 邻居状态 |

---

## Arista OID

Arista 企业 OID 前缀：`1.3.6.1.4.1.30065`

### CPU 和内存

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| aristaCpuUtilization | 1.3.6.1.4.1.30065.3.1.1.1.3 | Gauge32 | CPU 使用率（%） |
| aristaMemoryUtilization | 1.3.6.1.4.1.30065.3.1.2.1.3 | Gauge32 | 内存使用率（%） |

---

## Fortinet OID

Fortinet 企业 OID 前缀：`1.3.6.1.4.1.12356`

### CPU 和内存

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| fgSysCpuUsage | 1.3.6.1.4.1.12356.101.4.1.3.0 | Gauge32 | CPU 使用率（%） |
| fgSysMemUsage | 1.3.6.1.4.1.12356.101.4.1.4.0 | Gauge32 | 内存使用率（%） |
| fgSysMemCapacity | 1.3.6.1.4.1.12356.101.4.1.5.0 | Gauge32 | 内存容量（KB） |

### 防火墙会话

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| fgSysSesCount | 1.3.6.1.4.1.12356.101.4.1.8.0 | Gauge32 | 当前会话数 |
| fgSysSesRate | 1.3.6.1.4.1.12356.101.4.1.11.0 | Gauge32 | 会话建立速率 |

### VPN

| 名称 | OID | 数据类型 | 说明 |
|------|-----|----------|------|
| fgVpnTunnelUpCount | 1.3.6.1.4.1.12356.101.12.2.2.1.1 | INTEGER | VPN 隧道数量 |

---

## 使用示例

### 示例 1：查询 Cisco 设备 CPU 使用率

```bash
# 使用 snmpget 命令
snmpget -v2c -c public 192.168.1.1 1.3.6.1.4.1.9.2.1.56.0

# 使用 snmpwalk 命令
snmpwalk -v2c -c public 192.168.1.1 1.3.6.1.4.1.9.2.1
```

### 示例 2：在模板中配置 SNMP 检查项

```json
{
  "id": "cpu-usage",
  "name": "CPU 使用率",
  "type": "snmp",
  "category": "performance",
  "weight": 8,
  "config": {
    "oid": "1.3.6.1.4.1.9.2.1.56.0",
    "timeout": 5,
    "unit": "%",
    "threshold": {
      "warning": 80,
      "critical": 90
    }
  },
  "enabled": true
}
```

### 示例 3：批量查询接口信息

```python
from pysnmp.hlapi import *

# 查询所有接口描述
for (errorIndication,
     errorStatus,
     errorIndex,
     varBinds) in nextCmd(SnmpEngine(),
                          CommunityData('public'),
                          UdpTransportTarget(('192.168.1.1', 161)),
                          ContextData(),
                          ObjectType(ObjectIdentity('1.3.6.1.2.1.2.2.1.2'))):
    if errorIndication:
        print(errorIndication)
        break
    elif errorStatus:
        print('%s at %s' % (errorStatus.prettyPrint(),
                            errorIndex and varBinds[int(errorIndex) - 1][0] or '?'))
        break
    else:
        for varBind in varBinds:
            print(' = '.join([x.prettyPrint() for x in varBind]))
```

---

## 注意事项

1. **OID 版本差异**
   - 不同设备型号和软件版本可能使用不同的 OID
   - 建议使用 OID 测试工具验证

2. **SNMP 版本**
   - SNMPv1/v2c：使用团体字符串认证
   - SNMPv3：支持加密和认证，更安全

3. **性能考虑**
   - 避免频繁查询大量 OID
   - 使用 SNMP bulk 操作提高效率
   - 合理设置超时时间

4. **安全建议**
   - 使用只读团体字符串
   - 限制 SNMP 访问源 IP
   - 优先使用 SNMPv3
   - 定期更换团体字符串

---

## 相关文档

- [SNMP MIB JSON Registry 落地实施说明](../features/devices/snmp-mib-json-registry-implementation.md)
- [SNMP MIB OID 新增厂商维护指南](../features/devices/snmp-mib-oid-maintenance-guide.md)
- [vendor-oids.json 字段逐项参考](../features/devices/snmp-mib-vendor-oids-json-reference.md)
- [模板配置指南](../template-configuration-guide.md)
- [最佳实践文档](../template-best-practices.md)
- [API 文档](../api/readme.md)

---

## 参考资料

- [RFC 1213 - MIB-II](https://tools.ietf.org/html/rfc1213)
- [Cisco SNMP Object Navigator](https://snmp.cloudapps.cisco.com/Support/SNMP/do/BrowseOID.do)
- [Net-SNMP Documentation](http://www.net-snmp.org/docs/)

---

## 支持

如有问题或建议，请联系技术支持团队。
