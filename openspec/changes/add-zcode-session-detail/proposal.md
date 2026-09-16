## Why

会话明细视图（点「>」看逐轮对话）目前只有 opencode / claude / codex / dsh / reasonix 可用，ZCode 会话行不可点入。根因与标题问题同构：明细消费的中性事件结构只有 opencode 实现了 `readSessionEvents`。而 ZCode 库的 `message`/`part` 表与 OpenCode 几乎同构（同样的 `data` JSON：role/tokens/cost/time；part 的 type/text/tool），复用成本很低。

## What Changes

- 新增 `readSessionEvents(sessionId, deps)` 到 `src/shared/providers/zcode/sessionMetadata.js`：从 ZCode SQLite 的 `message`/`part` 表产出中性事件流（prompt / turn：tokens、tools、时间戳），只读连接，失败静默返回 `found: false`
- `src/shared/sessionDetail.js` 增加 `readZcodeSessionDetail` 分发：按轮分组后用 `distributeCost` 按比例分摊会话估算成本（ZCode 订阅制下 `message.cost` 恒 0，按量分摊才能与会话卡片口径一致）
- 渲染层两处白名单（行交互 affordance + 点击处理）加入 `zcode`
- 测试：fixture DB 覆盖事件产出、分组、成本分摊、库缺失/损坏降级；app.js 白名单源码契约

## Capabilities

### New Capabilities

- `zcode-session-detail`: ZCode 会话可点入查看逐轮明细（提问、回复、工具、每轮 token），数据只读取自本机 ZCode SQLite 库，失败静默降级为不可点入

### Modified Capabilities

<!-- 无：zcode-session-titles 规格只管标题，明细是独立能力 -->
