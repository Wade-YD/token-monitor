## Context

- 明细分发（`src/shared/sessionDetail.js` `readSessionDetail`）：按 client 分发到各解析器，产出 `{ found, client, sessionId, period, exchanges, totals }`；opencode 路径 = `readOpenCodeSessionDetail`（`readSessionEvents` → `groupEvents` → `filterExchangesByPeriod` → `sumRealCost`）。
- 渲染层两处硬编码白名单：`app.js` ~L2305（行交互 affordance `['claude','codex','opencode','dsh']`）与 ~L12977（点击处理 client 白名单）。
- ZCode 库 `message`(id/session_id/time_created/data[role,cost,tokens{total,input,output,reasoning,cache{read,write}},time]) 与 `part`(message_id/type/text/tool) 与 opencode 同构；tool 名在 `data.tool`，token 路径 `$.tokens.cache.read/write` 成立。`message.cost` 订阅制恒 0。

## Goals / Non-Goals

**Goals:**

- ZCode 会话行可点入，逐轮展示 prompt / turn（tokens、工具、时间）
- 成本口径与会话卡片一致：`distributeCost` 按轮 token 占比分摊估算成本
- 只读、点查、失败静默；纯 Node fixture DB 测试

**Non-Goals:**

- 不展示 reasoning 全文 / 工具输出正文（与其他客户端同粒度：工具名列表）
- 不做全量预扫描或跨会话检索
- 不改 opencode / claude / codex 的明细路径

## Decisions

1. **`readSessionEvents` 放进现有 `providers/zcode/sessionMetadata.js`**——复用其 sqlite 懒加载、`openDb`、路径解析与测试缝，不新建文件；导出 `readSessionEvents`。
2. **SQL 与 opencode 的 MESSAGES_SQL/PARTS_SQL 同形**——`json_extract` 路径在 ZCode 库上逐列验证过（role/tokens/cost/time.created、part 的 type/text/tool）；ZCode 单库单路径，无 opencode 的多候选发现循环。
3. **成本用 `distributeCost`（按轮占比分摊会话估算成本），不用 opencode 的 `sumRealCost`**——ZCode `message.cost` 订阅制恒 0，直接求和会显示 ¥0，与会话卡片对不上；分摊后合计 = 卡片估算值。备选「显示真实 0 成本」被否：用户已确认关注估算口径。
4. **渲染层只改两处白名单数组**（affordance + 点击），不引入新的 capability 标志——reasonix 式的 `sessionDetailAvailable` 探测是为「运行时才知道可不可读」设计的，zcode 是静态能力，硬编码与其余四家一致。
5. **`part` 过滤沿用 opencode 语义**：text → prompt/正文聚合，tool → 工具名去重；`reasoning`/`step-start` 部件忽略（明细粒度与其他客户端一致）。

## Risks / Trade-offs

- **ZCode 改 schema**（表/列/JSON 路径变化）→ 查询抛错被吞、`found:false` 回退不可点入；影响面仅明细。
- **超大 会话的瞬时渲染内存**（数万 part 行）→ 与 opencode 明细同量级、点入才读、离开即弃；不设新缓存。
- **分摊成本为估算值**——与 Claude/Codex 路径同口径（其成本本就是估算），已在 UI 语义内。
