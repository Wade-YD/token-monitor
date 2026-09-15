# Design: hide-idle-zai-cash-row

## Context

GLM 栏的三段信息来自三个并行车道（`fetchZaiLimits`）：订阅配额（quota/limit →
5-hour/Weekly 两条 bars）、现金钱包（query-customer-account-report → Balance 行 +
本地增量计算的 Spend 行）、ZCode 计划（本地登录）。订阅用户的现金车道永远为零。

## Goals / Non-Goals

- Goals: 订阅用户不再看到恒零的现金行；按量用户与「现金在用」状态不受影响。
- Non-Goals: 不做设置开关（个人构建，规则本身已自适应）；不改 Spend 的本地记账逻辑。

## Decisions

### D1 隐藏条件 = 「订阅窗口存在」∧「现金全零」
`amount === 0 && !todaySpend && !monthSpend && usage.windows.length > 0` 时隐藏
（不追加 credits 窗口、`balance` 置 null）。
- **为什么用「窗口存在」而不是 `plan` 字符串**：windows 是渲染的实际依据，且配额
  接口失败时 windows 为空 → 行恢复显示（此时 Balance 是唯一信息，不该藏）。
- **为什么不含 `allTimeSpend`**：界面只显示 Today/Month；有历史消费但本周期为零
  的行依然是噪音。跟踪数据在 store 里不受影响。
- **否决**设置开关：规则自适应（有现金/有消费自动显示），开关只增加维护面。

### D2 记账照跑，只藏显示
`zcodeRecordCumulativeSpend` 在隐藏判定之前照常调用（基线与增量继续写入
`zai-balance.json`），保证「未来出现现金消费 → monthSpend > 0 → 行自动回归」，
且历史累计不因隐藏而断档。

## Risks / Trade-offs

- 上游 rebase 时该处可能冲突：行为级测试（3 个新用例）钉住偏离意图，冲突时以测试为准。
- 「充值但从未消费」的用户会看到 Balance ¥X（>0）——信息为真，不属噪音。

## Migration Plan

无持久化迁移；`zai-balance.json` 结构不变。交付管道复用，overlay 清单 +1 文件。

## Open Questions

- 无。
