# 巡检模板 API 文档

本文档描述巡检模板管理相关的 REST API 接口。

## 基础信息

- **Base URL**: `http://localhost:8000/api/v1`
- **认证方式**: Bearer Token
- **Content-Type**: `application/json`

## 认证

所有 API 请求都需要在 Header 中包含认证 Token：

```
Authorization: Bearer <your_token>
```

---

## API 端点

### 1. 获取模板列表

获取巡检模板列表，支持分页、排序和筛选。

**请求**

```
GET /inspection/templates
```

**查询参数**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认 1 |
| page_size | integer | 否 | 每页数量，默认 20 |
| sort | string | 否 | 排序字段，默认 created_at |
| order | string | 否 | 排序方向，asc 或 desc，默认 desc |
| vendor | string | 否 | 按厂商筛选 |
| device_type | string | 否 | 按设备类型筛选 |
| category | string | 否 | 按分类筛选 |
| is_default | boolean | 否 | 按是否内置筛选 |
| search | string | 否 | 搜索关键词（名称或描述） |

**响应示例**

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "items": [
      {
        "id": 1,
        "name": "Cisco 路由器标准巡检",
        "description": "适用于 Cisco 路由器的标准巡检模板",
        "category": "network",
        "device_types": {
          "vendors": ["Cisco"],
          "device_types": ["router"]
        },
        "check_items_count": 15,
        "is_default": true,
        "is_active": true,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "page_size": 20
  }
}
```

---

### 2. 获取模板详情

获取指定模板的完整信息，包括所有检查项配置。

**请求**

```
GET /inspection/templates/:id
```

**路径参数**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | integer | 是 | 模板 ID |

**响应示例**

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "id": 1,
    "name": "Cisco 路由器标准巡检",
    "description": "适用于 Cisco 路由器的标准巡检模板",
    "category": "network",
    "device_types": {
      "vendors": ["Cisco"],
      "device_types": ["router"]
    },
    "check_items": [
      {
        "id": "cpu-usage",
        "name": "CPU 使用率",
        "description": "检查 CPU 使用率",
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
    ],
    "is_default": true,
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### 3. 创建模板

创建新的巡检模板。

**请求**

```
POST /inspection/templates
```

**请求体**

```json
{
  "name": "自定义路由器巡检",
  "description": "自定义的路由器巡检模板",
  "category": "network",
  "device_types": {
    "vendors": ["Cisco"],
    "device_types": ["router"]
  },
  "check_items": [
    {
      "id": "cpu-usage",
      "name": "CPU 使用率",
      "type": "snmp",
      "category": "performance",
      "weight": 8,
      "config": {
        "oid": "1.3.6.1.4.1.9.2.1.56.0",
        "threshold": {
          "warning": 80,
          "critical": 90
        }
      },
      "enabled": true
    }
  ],
  "is_active": true
}
```

**响应示例**

```json
{
  "code": 200,
  "message": "创建成功",
  "data": {
    "id": 101,
    "name": "自定义路由器巡检",
    ...
  }
}
```

**错误响应**

```json
{
  "code": 400,
  "message": "验证失败",
  "errors": [
    {
      "field": "name",
      "message": "模板名称不能为空"
    }
  ]
}
```

---

### 4. 更新模板

更新指定模板的配置。

**请求**

```
PUT /inspection/templates/:id
```

**路径参数**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | integer | 是 | 模板 ID |

**请求体**

与创建模板相同，但所有字段都是可选的。

**响应示例**

```json
{
  "code": 200,
  "message": "更新成功",
  "data": {
    "id": 101,
    "name": "自定义路由器巡检（已更新）",
    ...
  }
}
```

**错误响应**

```json
{
  "code": 403,
  "message": "不允许修改内置模板"
}
```

---

### 5. 删除模板

删除指定的模板。

**请求**

```
DELETE /inspection/templates/:id
```

**路径参数**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | integer | 是 | 模板 ID |

**响应示例**

```json
{
  "code": 200,
  "message": "删除成功"
}
```

**错误响应**

```json
{
  "code": 403,
  "message": "不允许删除内置模板"
}
```

---

### 6. 复制模板

复制指定模板创建新模板。

**请求**

```
POST /inspection/templates/:id/copy
```

**路径参数**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | integer | 是 | 源模板 ID |

**请求体**

```json
{
  "name": "新模板名称"
}
```

如果不提供名称，系统会自动在原名称后添加"（副本）"后缀。

**响应示例**

```json
{
  "code": 200,
  "message": "复制成功",
  "data": {
    "id": 102,
    "name": "Cisco 路由器标准巡检（副本）",
    "is_default": false,
    ...
  }
}
```

---

### 7. 导出模板

导出模板配置为 JSON 文件。

**请求**

```
GET /inspection/templates/:id/export
```

**路径参数**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | integer | 是 | 模板 ID |

**响应**

返回 JSON 文件下载，Content-Type 为 `application/json`。

---

### 8. 导入模板

从 JSON 文件导入模板配置。

**请求**

```
POST /inspection/templates/import
```

**请求体**

使用 `multipart/form-data` 格式：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| file | file | 是 | JSON 配置文件 |
| overwrite | boolean | 否 | 是否覆盖同名模板，默认 false |

**响应示例**

```json
{
  "code": 200,
  "message": "导入成功",
  "data": {
    "id": 103,
    "name": "导入的模板",
    ...
  }
}
```

**错误响应**

```json
{
  "code": 400,
  "message": "配置文件格式错误"
}
```

---

### 9. 测试 OID

测试 SNMP OID 是否可以正常查询。

**请求**

```
POST /inspection/templates/test-oid
```

**请求体**

```json
{
  "device_id": 1,
  "oid": "1.3.6.1.2.1.1.3.0"
}
```

**响应示例**

成功：

```json
{
  "code": 200,
  "message": "测试成功",
  "data": {
    "success": true,
    "value": "12345",
    "type": "INTEGER"
  }
}
```

失败：

```json
{
  "code": 200,
  "message": "测试失败",
  "data": {
    "success": false,
    "message": "连接超时"
  }
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 使用示例

### cURL 示例

```bash
# 获取模板列表
curl -X GET "http://localhost:8000/api/v1/inspection/templates?page=1&page_size=20" \
  -H "Authorization: Bearer <your_token>"

# 创建模板
curl -X POST "http://localhost:8000/api/v1/inspection/templates" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试模板",
    "device_types": {
      "vendors": ["Cisco"],
      "device_types": ["router"]
    },
    "check_items": [],
    "is_active": true
  }'

# 复制模板
curl -X POST "http://localhost:8000/api/v1/inspection/templates/1/copy" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "复制的模板"}'
```

### JavaScript 示例

```javascript
// 获取模板列表
const response = await fetch('http://localhost:8000/api/v1/inspection/templates', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
})
const data = await response.json()

// 创建模板
const response = await fetch('http://localhost:8000/api/v1/inspection/templates', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: '测试模板',
    device_types: {
      vendors: ['Cisco'],
      device_types: ['router'],
    },
    check_items: [],
    is_active: true,
  }),
})
const data = await response.json()
```

---

## 相关文档

- [模板配置指南](../template-configuration-guide.md)
- [最佳实践](../template-best-practices.md)
- [厂商 OID 映射表](../vendor-oid-mapping.md)

---

## 支持

如有问题或建议，请联系技术支持团队。
