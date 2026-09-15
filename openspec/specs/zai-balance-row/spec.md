# zai-balance-row Specification

## Purpose
TBD - created by archiving change hide-idle-zai-cash-row. Update Purpose after archive.
## Requirements
### Requirement: The idle cash row MUST hide behind an active subscription

当订阅配额窗口存在（套餐生效）且现金钱包全零（余额为 0 且今日、本月现金消费均为 0）时，GLM 栏 MUST NOT 渲染 Balance 行与 Spend 行；现金信息任一非零、或订阅窗口不存在（纯按量用户、配额接口失败）时，MUST 照常渲染。Spend 的本地累计跟踪 MUST 与显示无关地持续运行。

#### Scenario: Subscription user with an untouched wallet
- **WHEN** 套餐窗口（5-hour/Weekly）存在，现金余额为 0 且无现金消费记录
- **THEN** GLM 栏只渲染套餐窗口，不出现 Balance/Spend

#### Scenario: Cash enters the picture and the row returns
- **WHEN** 现金余额大于 0，或今日/本月现金消费大于 0
- **THEN** Balance/Spend 行照常渲染并显示真实数值

#### Scenario: Cash-only or quota-failed users keep the row
- **WHEN** 配额接口没有返回任何订阅窗口，但余额接口可用
- **THEN** Balance/Spend 行照常渲染（此时它是唯一信息）

