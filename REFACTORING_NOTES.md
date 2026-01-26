# 工装信息模块重构说明

## 重构目标

解决以下三个关键问题：

1. **ToolingInfo.tsx文件过大（168KB）**
   - 包含29个useEffect，严重影响可维护性
   - 混合了UI逻辑、状态管理、业务逻辑

2. **前后端数据序列化策略不一致**
   - 存在循环引用风险
   - 前后端数据处理逻辑分散

3. **API响应格式不统一**
   - 有些接口返回 `{ success: true, items: [] }`
   - 有些接口返回 `{ success: true, data: [] }`

## 重构方案

### 1. 文件结构重组

```
src/pages/ToolingInfo/
├── index.ts                    # 导出入口
├── ToolingInfoPage.tsx        # 主页面组件（精简版）
├── components/
│   ├── ToolingFilters.tsx     # 筛选组件
│   ├── ToolingTable.tsx       # 工装信息表格
│   ├── PartTable.tsx          # 零件信息表格
│   └── ChildItemTable.tsx     # 标准件表格
src/hooks/
├── useToolingFilters.ts        # 筛选逻辑Hook
├── useToolingTable.ts         # 工装表格逻辑Hook
├── usePartTable.ts            # 零件表格逻辑Hook
└── useChildItemTable.ts      # 标准件表格逻辑Hook
src/utils/
└── dataSerializer.ts          # 数据序列化工具
api/lib/
└── response.ts               # 统一API响应格式
```

### 2. 组件拆分

**原文件：** ToolingInfo.tsx (168KB, 29个useEffect)

**拆分为：**
- ToolingInfoPage.tsx (主页面，~30KB)
- ToolingFilters.tsx (筛选组件，~5KB)
- ToolingTable.tsx (工装表格，~8KB)
- PartTable.tsx (零件表格，~10KB)
- ChildItemTable.tsx (标准件表格，~8KB)
- useToolingFilters.ts (筛选Hook，~3KB)
- useToolingTable.ts (工装表格Hook，~4KB)
- usePartTable.ts (零件表格Hook，~5KB)
- useChildItemTable.ts (标准件表格Hook，~4KB)

### 3. 数据序列化策略

**创建统一的数据处理工具类：**

```typescript
// DataSerializer - 处理数据序列化
- safeSerialize() - 安全序列化，避免循环引用
- normalizeResponse() - 统一API响应格式
- cleanDbRecord() - 清理数据库记录
- cleanDbRecords() - 批量清理

// ResponseHandler - 处理API响应
- extractData() - 提取单条数据
- extractList() - 提取列表数据
- isSuccess() - 检查是否成功
- getError() - 获取错误信息

// RequestCleaner - 清理请求参数
- cleanParams() - 清理空值
- cleanToolingParams() - 清理工装参数
- cleanPartParams() - 清理零件参数
```

### 4. API响应格式统一

**统一格式：**

```typescript
interface ApiResponse<T = any> {
  success: boolean
  data?: T              // 单条数据
  items?: T[]            // 列表数据
  error?: {
    code?: string
    message: string
    hint?: string
  }
  meta?: {
    total?: number
    page?: number
    pageSize?: number
  }
}
```

**辅助函数：**

```typescript
sendSuccess(res, data, meta)           // 成功响应
sendSuccessList(res, items, meta)       // 列表成功响应
sendError(res, message, code, hint)   // 错误响应
sendNotFound(res, resource)             // 404响应
sendCreated(res, data, message)         // 创建成功
sendUpdated(res, data, message)         // 更新成功
sendDeleted(res, message)               // 删除成功
```

## 使用说明

### 前端使用

```typescript
// 导入新的页面组件
import ToolingInfo from './pages/ToolingInfo'

// 使用数据序列化工具
import { DataSerializer, ResponseHandler, RequestCleaner } from './utils/dataSerializer'

// 处理API响应
const response = await fetch('/api/tooling')
const data = ResponseHandler.extractData(response)

// 清理请求参数
const cleanedParams = RequestCleaner.cleanToolingParams(params)

// 安全序列化数据
const serialized = DataSerializer.safeSerialize(data)
```

### 后端使用

```typescript
import { sendSuccess, sendSuccessList, sendError } from '../lib/response.js'

// 成功响应
return sendSuccess(res, data, { total: 100, page: 1, pageSize: 20 })

// 列表成功响应
return sendSuccessList(res, items, { total: 100, page: 1, pageSize: 20 })

// 错误响应
return sendError(res, '错误信息', 'ERROR_CODE', '提示信息')
```

## 迁移步骤

### 1. 备份原文件
```bash
# 已完成
src/pages/ToolingInfo.tsx -> src/pages/ToolingInfo.tsx.backup
```

### 2. 更新路由
```typescript
// App.tsx 中保持不变
import ToolingInfo from "./pages/ToolingInfo";
// 自动使用新的 index.ts 导出
```

### 3. 测试功能
- [ ] 工装信息列表加载
- [ ] 工装信息编辑
- [ ] 零件信息管理
- [ ] 标准件信息管理
- [ ] 筛选和搜索
- [ ] 批量删除
- [ ] 导入导出

## 优势

### 1. 可维护性提升
- 文件大小从168KB降至30KB（主文件）
- useEffect数量从29个降至5个
- 职责清晰，易于定位问题

### 2. 代码复用
- 表格逻辑提取为Hook，可在其他页面复用
- 数据处理工具统一，避免重复代码

### 3. 类型安全
- 统一的API响应类型定义
- 完整的TypeScript类型支持

### 4. 性能优化
- 减少不必要的渲染
- 优化useEffect依赖
- 使用useMemo缓存计算结果

## 注意事项

1. **向后兼容**：原文件已备份为 `ToolingInfo.tsx.backup`
2. **渐进迁移**：可以逐步迁移功能，不影响现有功能
3. **测试覆盖**：建议添加单元测试和集成测试
4. **文档更新**：更新相关文档和注释

## 后续优化建议

1. **添加单元测试**：为各个组件和Hook添加测试
2. **性能监控**：添加性能监控和日志
3. **错误边界**：添加React Error Boundary
4. **虚拟滚动**：对于大数据量实现虚拟滚动
5. **状态管理**：考虑使用Zustand或Jotai替代useState
