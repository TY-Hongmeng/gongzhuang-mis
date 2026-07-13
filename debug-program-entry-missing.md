# Debug Session: program-entry-missing

## Status
- [OPEN]

## Symptom
- 程序录入页面看似已录入数据，但重新打开后之前输入的数据不存在。
- 用户怀疑后端数据库未真正保存成功。

## Expected
- 程序录入自动保存后，刷新页面或重新进入页面，数据仍然存在于后端数据库。

## Scope
- 页面：`src/pages/ProgramEntry.tsx`
- 接口：`POST /api/tooling/program-entries/batch`
- 后端：`api/routes/tooling.ts`
- 迁移：`supabase/migrations/20260608_create_program_entries.sql`

## Hypotheses
- H1: 前端实际上没有成功发出保存请求，界面只更新了本地状态。
- H2: 请求发到了后端，但后端写库失败，前端没有拿到明确失败反馈。
- H3: 表 `program_entries` 已创建，但写入了不同环境或不同库，导致当前页面读不到。
- H4: 自动保存触发时机有问题，行状态未满足完整条件，导致实际上没有执行持久化。
- H5: 保存成功了，但程序录入页没有实现“回显已存数据”，所以重开页面看起来像丢失。

## Evidence Plan
- 给程序录入前端保存链路加运行时日志。
- 给后端 `/program-entries/batch` 接口加运行时日志。
- 复现一次录入并核对：前端请求 -> 后端接收 -> 数据库写入结果。

## Notes
- 在拿到运行时证据前，不修改业务逻辑。
