# [OPEN] Debug Session: tooling-work-hours-400

## 1. 症状
- 工装信息模块展开子表后，`工艺路线 / 加工时长 / 加工金额 / 加工总额` 仍可能显示为空或为 `0`。
- 浏览器日志显示 `/api/tooling/work-hours/aggregates` 返回 `500`。
- 服务端内部访问 Supabase `work_hours` 时出现 `400 Bad Request`。

## 2. 期望
- 子表按零件盘存编号稳定显示 `工艺路线 / 加工时长 / 加工金额`。
- 父表稳定显示 `加工总额 / 材料总额`。
- 页面展开和计算过程顺畅，不因多余请求或回退逻辑导致卡顿。

## 3. 初始假设
- H1: `/work-hours/aggregates` 对 Supabase 的 `.in(...)` 查询参数格式或长度触发了 `400`，导致整批工时聚合失败。
- H2: 工时聚合接口同时查 `inventory_no` 与 `part_inventory_number` 的策略过重，某个字段或数据类型与当前表结构不匹配。
- H3: 前端对子表三列与父表两列采用了多套来源和回退逻辑，接口一旦失败就出现空白或 `0`，没有稳定主数据源。
- H4: 展开子表时的请求、防抖、缓存、二次校准逻辑重复叠加，导致一次展开触发多轮无效计算，影响流畅度。
- H5: `工艺路线` 的展示与工时聚合结果耦合过深，即使零件表已有 `process_route` 也会被缓存/闭包逻辑影响。

## 4. 证据采集计划
- 先定位 `/work-hours/aggregates` 的服务端执行路径与 Supabase 查询语句。
- 仅添加调试埋点，记录入参、分批、字段、Supabase 错误体与返回规模。
- 复现一次展开子表流程，采集 pre-fix 运行证据。
- 基于证据收敛到单一数据源与最小必要计算链路，再实施修复。

## 5. 当前状态
- 状态: 已完成 pre-fix 证据收敛并实施首轮修复，待用户做 post-fix 验证。

## 6. Pre-fix 证据
- E1: 浏览器控制台直接出现 `vendor-supabase... work_hours ... 400`，说明页面在浏览器侧直连 Supabase，而不只是调用后端。
- E2: `src/utils/api.ts` 中 `fetchWithFallback()` 在静态部署/非本地后端场景会把 `/api/tooling/work-hours/aggregates` 路由到 `handleClientSideApi()`。
- E3: `src/pages/WorkHours.tsx` 提交工时时使用的主键是 `part_inventory_number`，并非父表 `inventory_no`。
- E4: `src/utils/api.ts` 的工时聚合分支 pre-fix 同时查询 `inventory_no` 与 `part_inventory_number`，且没有像其它模块那样为 `work_hours` 做安全回退。
- E5: `src/pages/ToolingInfo.tsx` pre-fix 在工时聚合失败后仍会按空 `workHoursAmountData` 重新汇总父表，导致 `加工总额` 被覆盖成 `0`；子表 `加工金额` 也只认实时聚合，不认已存的 `process_amount`。
- E6: 直接复现 Supabase REST：
  - `part_inventory_number=in.(LJ26070301,LJ26070302)` 返回 `200`
  - `inventory_no=in.(LJ26070301,LJ26070302)` 返回 `400`
  - 错误体为 `column work_hours.inventory_no does not exist`

## 7. 假设结论
- H1: 已确认。客户端聚合查询链路确实会触发 Supabase `400`。
- H2: 已确认。`inventory_no` 在工装信息模块聚合中不是必要键，继续查询它只会增加失败面和请求量。
- H3: 已确认。子表金额与父表总额存在“实时聚合唯一来源”，接口失败就整列退化为空。
- H4: 已确认。展开子表存在立即加载与防抖加载双重触发，且还带上父表盘存号，存在冗余请求。
- H5: 部分成立。`工艺路线` 本身不是这次 `400` 的根因，但应与工时聚合解耦看待。

## 8. 已实施修复
- R1: `src/utils/api.ts` 的客户端工时聚合改为只按 `part_inventory_number` 查询 `work_hours`，去掉对 `inventory_no` 的冗余依赖。
- R2: `api/routes/tooling.ts` 的后端工时聚合同步改为只按 `part_inventory_number` 聚合，前后端口径统一。
- R3: `src/pages/ToolingInfo.tsx` 子表 `加工金额` 改为“实时聚合优先，`process_amount` 兜底”。
- R4: `src/pages/ToolingInfo.tsx` 父表 `加工总额` 改为汇总子表的已解析金额，不再被空聚合结果覆盖成 `0`。
- R5: `src/pages/ToolingInfo.tsx` 展开子表的工时拉取只收集零件盘存号，并在立即拉取后写入去重键，避免紧接着再触发一轮重复防抖请求。
- R6: `src/utils/api.ts` 运行时强制 `/api/tooling/work-hours/aggregates` 只走后端，不再让工装信息模块在浏览器侧直连 Supabase 聚合。
- R7: `src/pages/ToolingInfo.tsx` 删除未参与显示的 `workHoursProcessAmountData` 状态、未使用的批量保存函数以及多余调试日志，减少无效渲染与控制台噪音。
- R8: 回滚 R6 的过度限制，恢复静态环境下 `/api/tooling/work-hours/aggregates` 的客户端回退；本地后端环境仍优先走后端。
- R9: 修复 `src/utils/api.ts` 中 `/refresh-totals` 客户端实现把新算出的 `material_total` 又覆盖回旧值的问题。
- R10: `src/pages/ToolingInfo.tsx` 在本地校准父表总额后立即调用 `/save-totals-direct` 落库，避免刷新后又回到旧的 `0/null`。
