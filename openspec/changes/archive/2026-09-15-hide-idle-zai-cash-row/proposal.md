# Proposal: hide-idle-zai-cash-row

## Why

用户是 GLM Coding Plan（订阅制）用户，token-monitor 的 GLM 栏里
「Balance ¥0.00 / Spend Today ¥0.00 · Month ¥0.00」**永远是零**——这两行展示的是
智谱账户的**现金钱包**（按量计费，`availableBalance`），订阅用量不经过它，
对订阅用户是永久性无效显示。

## What Changes

在 `src/shared/providers/zai/limits.js` 的 console-key 车道加一条展示规则：

**当订阅窗口存在（套餐生效）且现金信息全为零（`amount === 0` 且 `todaySpend`、
`monthSpend` 均为 0）时，不输出 Balance 行、不输出 Spend 行。**

保留展示的情形（行仍然有意义时）：
- 现金余额 > 0（充过值）
- 今日或本月有现金消费（>0）
- 没有任何订阅窗口（纯按量用户，Balance 是他们的主信息）

Spend 的本地累计跟踪（`zcodeRecordCumulativeSpend` → `zai-balance.json`）**照常运行**，
因此「某天开始产生现金消费 → 行自动回来」的语义不受隐藏影响。

## Impact

- **specs**：新增能力 `zai-balance-row`（1 需求 / 3 场景）。
- **代码**：`src/shared/providers/zai/limits.js`（一处）、`tests/shared/zaiLimits.test.js`
  （改 1 个既有用例的余额值 + 新增 3 个用例）。
- **交付**：交付脚本 overlay 清单加入该文件（9 个文件）；其余管道与回退不变。
- **与上游的刻意偏离**：上游注释称「零余额 + 有效套餐是合法中间态」而保留显示；
  本补丁为个人构建，选择对订阅用户隐藏噪音行，行为级测试钉住该偏离以便未来 rebase 时保留。
