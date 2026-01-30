-- ==========================================
-- 完整内置巡检模板数据脚本
-- ==========================================
-- 功能: 为六个主流网络设备厂商创建内置巡检模板
-- 厂商: Cisco、Huawei、H3C、Juniper、Arista、Fortinet
-- 设备类型: router (路由器)、switch (交换机)、firewall (防火墙)
-- 检查项类别: health (设备健康)、performance (网络性能)、compliance (配置合规)、security (安全)、routing (路由协议)
-- 幂等性: 使用 ON CONFLICT DO NOTHING 确保可重复执行
-- ==========================================

BEGIN;

-- ==========================================
-- Cisco 设备模板 (路由器、交换机、防火墙)
-- ==========================================

-- Cisco 路由器标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Cisco 路由器标准巡检',
  '适用于 Cisco 路由器的标准巡检模板，包含设备健康、网络性能、配置合规、安全和路由协议检查',
  'network',
  '{"vendors": ["Cisco"], "device_types": ["router"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.9.9.109.1.1.1.1.7", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid_used": "1.3.6.1.4.1.9.9.48.1.1.1.5", "oid_free": "1.3.6.1.4.1.9.9.48.1.1.1.6", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "temperature", "name": "温度检查", "description": "监控设备温度", "type": "snmp", "category": "health", "weight": 8, "config": {"oid": "1.3.6.1.4.1.9.9.13.1.3.1.3", "timeout": 5, "unit": "°C", "threshold": {"warning": 60, "critical": 75}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "ospf_neighbors", "name": "OSPF 邻居状态检查", "description": "验证 OSPF 邻居关系", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "show ip ospf neighbor", "timeout": 10, "parsePattern": "FULL"}, "enabled": true},
    {"id": "bgp_sessions", "name": "BGP 会话状态检查", "description": "验证 BGP 会话状态", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "show ip bgp summary", "timeout": 10, "parsePattern": "Established"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Cisco 交换机标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Cisco 交换机标准巡检',
  '适用于 Cisco 交换机的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'network',
  '{"vendors": ["Cisco"], "device_types": ["switch"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.9.9.109.1.1.1.1.7", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid_used": "1.3.6.1.4.1.9.9.48.1.1.1.5", "oid_free": "1.3.6.1.4.1.9.9.48.1.1.1.6", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "port_security", "name": "端口安全配置检查", "description": "验证接入层端口安全功能", "type": "ssh", "category": "security", "weight": 8, "config": {"command": "show port-security", "timeout": 10, "parsePattern": "Secure"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Cisco 防火墙标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Cisco 防火墙标准巡检',
  '适用于 Cisco ASA/Firepower 防火墙的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'security',
  '{"vendors": ["Cisco"], "device_types": ["firewall"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.9.9.109.1.1.1.1.7", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "connection_count", "name": "连接数检查", "description": "监控防火墙当前连接数", "type": "ssh", "category": "performance", "weight": 9, "config": {"command": "show conn count", "timeout": 10, "parsePattern": "(\\d+)\\s+in\\s+use"}, "enabled": true},
    {"id": "acl_config", "name": "ACL 规则检查", "description": "验证访问控制列表配置", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "show access-list", "timeout": 10, "parsePattern": "access-list"}, "enabled": true},
    {"id": "failover_status", "name": "高可用状态检查", "description": "检查防火墙高可用状态", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "show failover", "timeout": 10, "parsePattern": "Active|Standby"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ==========================================
-- Huawei 设备模板 (路由器、交换机、防火墙)
-- ==========================================

-- Huawei 路由器标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Huawei 路由器标准巡检',
  '适用于 Huawei 路由器的标准巡检模板，包含设备健康、网络性能、配置合规、安全和路由协议检查',
  'network',
  '{"vendors": ["Huawei"], "device_types": ["router"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2011.6.3.5.1.1.2", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "ospf_neighbors", "name": "OSPF 邻居状态检查", "description": "验证 OSPF 邻居关系", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "display ospf peer", "timeout": 10, "parsePattern": "Full"}, "enabled": true},
    {"id": "bgp_sessions", "name": "BGP 会话状态检查", "description": "验证 BGP 会话状态", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "display bgp peer", "timeout": 10, "parsePattern": "Established"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Huawei 交换机标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Huawei 交换机标准巡检',
  '适用于 Huawei 交换机的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'network',
  '{"vendors": ["Huawei"], "device_types": ["switch"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2011.6.3.5.1.1.2", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "port_security", "name": "端口安全配置检查", "description": "验证接入层端口安全功能", "type": "ssh", "category": "security", "weight": 8, "config": {"command": "display port-security", "timeout": 10, "parsePattern": "enable"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Huawei 防火墙标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Huawei 防火墙标准巡检',
  '适用于 Huawei USG 防火墙的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'security',
  '{"vendors": ["Huawei"], "device_types": ["firewall"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "session_count", "name": "会话数检查", "description": "监控防火墙当前会话数", "type": "ssh", "category": "performance", "weight": 9, "config": {"command": "display firewall session statistics", "timeout": 10, "parsePattern": "Current\\s+sessions:\\s+(\\d+)"}, "enabled": true},
    {"id": "security_policy", "name": "安全策略检查", "description": "验证安全策略配置", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "display security-policy rule all", "timeout": 10, "parsePattern": "security-policy"}, "enabled": true},
    {"id": "hrp_status", "name": "双机热备状态检查", "description": "检查防火墙双机热备状态", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "display hrp state", "timeout": 10, "parsePattern": "active|standby"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ==========================================
-- H3C 设备模板 (路由器、交换机、防火墙)
-- ==========================================

-- H3C 路由器标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'H3C 路由器标准巡检',
  '适用于 H3C 路由器的标准巡检模板，包含设备健康、网络性能、配置合规、安全和路由协议检查',
  'network',
  '{"vendors": ["H3C"], "device_types": ["router"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.25506.2.6.1.1.1.1.6", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.25506.2.6.1.1.1.1.8", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "ospf_neighbors", "name": "OSPF 邻居状态检查", "description": "验证 OSPF 邻居关系", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "display ospf peer", "timeout": 10, "parsePattern": "Full"}, "enabled": true},
    {"id": "bgp_sessions", "name": "BGP 会话状态检查", "description": "验证 BGP 会话状态", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "display bgp peer", "timeout": 10, "parsePattern": "Established"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- H3C 交换机标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'H3C 交换机标准巡检',
  '适用于 H3C 交换机的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'network',
  '{"vendors": ["H3C"], "device_types": ["switch"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.25506.2.6.1.1.1.1.6", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.25506.2.6.1.1.1.1.8", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "port_security", "name": "端口安全配置检查", "description": "验证接入层端口安全功能", "type": "ssh", "category": "security", "weight": 8, "config": {"command": "display port-security", "timeout": 10, "parsePattern": "enable"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- H3C 防火墙标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'H3C 防火墙标准巡检',
  '适用于 H3C SecPath 防火墙的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'security',
  '{"vendors": ["H3C"], "device_types": ["firewall"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.25506.2.6.1.1.1.1.6", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "session_count", "name": "会话数检查", "description": "监控防火墙当前会话数", "type": "ssh", "category": "performance", "weight": 9, "config": {"command": "display firewall session statistics", "timeout": 10, "parsePattern": "Current\\s+sessions:\\s+(\\d+)"}, "enabled": true},
    {"id": "security_policy", "name": "安全策略检查", "description": "验证安全策略配置", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "display security-policy", "timeout": 10, "parsePattern": "security-policy"}, "enabled": true},
    {"id": "ha_status", "name": "高可用状态检查", "description": "检查防火墙高可用状态", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "display hrp state", "timeout": 10, "parsePattern": "Master|Backup"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ==========================================
-- Juniper 设备模板 (路由器、交换机、防火墙)
-- ==========================================

-- Juniper 路由器标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Juniper 路由器标准巡检',
  '适用于 Juniper 路由器的标准巡检模板，包含设备健康、网络性能、配置合规、安全和路由协议检查',
  'network',
  '{"vendors": ["Juniper"], "device_types": ["router"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2636.3.1.13.1.8", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2636.3.1.13.1.11", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "ospf_neighbors", "name": "OSPF 邻居状态检查", "description": "验证 OSPF 邻居关系", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "show ospf neighbor", "timeout": 10, "parsePattern": "Full"}, "enabled": true},
    {"id": "bgp_sessions", "name": "BGP 会话状态检查", "description": "验证 BGP 会话状态", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "show bgp summary", "timeout": 10, "parsePattern": "Establ"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Juniper 交换机标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Juniper 交换机标准巡检',
  '适用于 Juniper 交换机的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'network',
  '{"vendors": ["Juniper"], "device_types": ["switch"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2636.3.1.13.1.8", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2636.3.1.13.1.11", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "port_security", "name": "端口安全配置检查", "description": "验证接入层端口安全功能", "type": "ssh", "category": "security", "weight": 8, "config": {"command": "show configuration ethernet-switching-options port-security", "timeout": 10, "parsePattern": "mac-limit"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Juniper 防火墙标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Juniper 防火墙标准巡检',
  '适用于 Juniper SRX 防火墙的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'security',
  '{"vendors": ["Juniper"], "device_types": ["firewall"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.2636.3.1.13.1.8", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "session_count", "name": "会话数检查", "description": "监控防火墙当前会话数", "type": "ssh", "category": "performance", "weight": 9, "config": {"command": "show security flow statistics", "timeout": 10, "parsePattern": "Active\\s+sessions:\\s+(\\d+)"}, "enabled": true},
    {"id": "security_policy", "name": "安全策略检查", "description": "验证安全策略配置", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "show security policies", "timeout": 10, "parsePattern": "policy"}, "enabled": true},
    {"id": "chassis_cluster", "name": "集群状态检查", "description": "检查防火墙集群状态", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "show chassis cluster status", "timeout": 10, "parsePattern": "primary|secondary"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ==========================================
-- Arista 设备模板 (路由器、交换机、防火墙)
-- ==========================================

-- Arista 路由器标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Arista 路由器标准巡检',
  '适用于 Arista 路由器的标准巡检模板，包含设备健康、网络性能、配置合规、安全和路由协议检查',
  'network',
  '{"vendors": ["Arista"], "device_types": ["router"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.30065.3.1.1.2.1.1.1.3", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.30065.3.1.1.2.1.1.1.4", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "ospf_neighbors", "name": "OSPF 邻居状态检查", "description": "验证 OSPF 邻居关系", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "show ip ospf neighbor", "timeout": 10, "parsePattern": "FULL"}, "enabled": true},
    {"id": "bgp_sessions", "name": "BGP 会话状态检查", "description": "验证 BGP 会话状态", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "show ip bgp summary", "timeout": 10, "parsePattern": "Established"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Arista 交换机标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Arista 交换机标准巡检',
  '适用于 Arista 交换机的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'network',
  '{"vendors": ["Arista"], "device_types": ["switch"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.30065.3.1.1.2.1.1.1.3", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.30065.3.1.1.2.1.1.1.4", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "port_security", "name": "端口安全配置检查", "description": "验证接入层端口安全功能", "type": "ssh", "category": "security", "weight": 8, "config": {"command": "show port-security", "timeout": 10, "parsePattern": "Enabled"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Arista 防火墙标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Arista 防火墙标准巡检',
  '适用于 Arista 设备防火墙功能的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'security',
  '{"vendors": ["Arista"], "device_types": ["firewall"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.30065.3.1.1.2.1.1.1.3", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.30065.3.1.1.2.1.1.1.4", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "acl_config", "name": "ACL 规则检查", "description": "验证访问控制列表配置", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "show ip access-lists", "timeout": 10, "parsePattern": "IP\\s+access\\s+list"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ==========================================
-- Fortinet 设备模板 (路由器、交换机、防火墙)
-- ==========================================

-- Fortinet 路由器标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Fortinet 路由器标准巡检',
  '适用于 Fortinet FortiGate 路由模式的标准巡检模板，包含设备健康、网络性能、配置合规、安全和路由协议检查',
  'network',
  '{"vendors": ["Fortinet"], "device_types": ["router"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.12356.101.4.1.3", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.12356.101.4.1.4", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "ospf_neighbors", "name": "OSPF 邻居状态检查", "description": "验证 OSPF 邻居关系", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "get router info ospf neighbor", "timeout": 10, "parsePattern": "Full"}, "enabled": true},
    {"id": "bgp_sessions", "name": "BGP 会话状态检查", "description": "验证 BGP 会话状态", "type": "ssh", "category": "routing", "weight": 9, "config": {"command": "get router info bgp summary", "timeout": 10, "parsePattern": "Established"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Fortinet 交换机标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Fortinet 交换机标准巡检',
  '适用于 Fortinet FortiSwitch 的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'network',
  '{"vendors": ["Fortinet"], "device_types": ["switch"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.12356.106.4.1.3", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.12356.106.4.1.4", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "interface_status", "name": "接口状态检查", "description": "检查关键接口运行状态", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.2.1.2.2.1.8", "timeout": 5, "expectedValue": "1"}, "enabled": true},
    {"id": "port_security", "name": "端口安全配置检查", "description": "验证接入层端口安全功能", "type": "ssh", "category": "security", "weight": 8, "config": {"command": "show switch port-security", "timeout": 10, "parsePattern": "enable"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Fortinet 防火墙标准巡检模板
INSERT INTO inspection_templates (
  name, description, category, device_types, check_items, 
  is_default, is_active, created_at, updated_at
) VALUES (
  'Fortinet 防火墙标准巡检',
  '适用于 Fortinet FortiGate 防火墙的标准巡检模板，包含设备健康、网络性能、配置合规和安全检查',
  'security',
  '{"vendors": ["Fortinet"], "device_types": ["firewall"]}'::jsonb,
  '[
    {"id": "cpu_usage", "name": "CPU 使用率检查", "description": "监控设备 CPU 使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.12356.101.4.1.3", "timeout": 5, "unit": "%", "threshold": {"warning": 70, "critical": 85}}, "enabled": true},
    {"id": "memory_usage", "name": "内存使用率检查", "description": "监控设备内存使用率", "type": "snmp", "category": "health", "weight": 10, "config": {"oid": "1.3.6.1.4.1.12356.101.4.1.4", "timeout": 5, "unit": "%", "threshold": {"warning": 75, "critical": 90}}, "enabled": true},
    {"id": "session_count", "name": "会话数检查", "description": "监控防火墙当前会话数", "type": "snmp", "category": "performance", "weight": 9, "config": {"oid": "1.3.6.1.4.1.12356.101.4.1.8", "timeout": 5, "unit": "sessions"}, "enabled": true},
    {"id": "firewall_policy", "name": "防火墙策略检查", "description": "验证防火墙策略配置", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "show firewall policy", "timeout": 10, "parsePattern": "edit"}, "enabled": true},
    {"id": "ha_status", "name": "高可用状态检查", "description": "检查防火墙高可用状态", "type": "ssh", "category": "security", "weight": 9, "config": {"command": "get system ha status", "timeout": 10, "parsePattern": "Master|Slave"}, "enabled": true}
  ]'::jsonb,
  true, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

COMMIT;

-- ==========================================
-- 模板创建完成
-- ==========================================
-- 总计创建了 18 个内置巡检模板:
-- - Cisco: 路由器、交换机、防火墙 (3个)
-- - Huawei: 路由器、交换机、防火墙 (3个)  
-- - H3C: 路由器、交换机、防火墙 (3个)
-- - Juniper: 路由器、交换机、防火墙 (3个)
-- - Arista: 路由器、交换机、防火墙 (3个)
-- - Fortinet: 路由器、交换机、防火墙 (3个)
--
-- 每个模板包含核心检查项:
-- - 设备健康: CPU、内存使用率监控
-- - 网络性能: 接口状态检查
-- - 安全检查: 端口安全、策略配置
-- - 路由协议: OSPF、BGP状态 (仅路由器)
-- - 高可用: 集群/热备状态 (仅防火墙)
-- ==========================================