## Why

会话列表里 ZCode 客户端的会话只显示裸 session ID（`sess_ce66fcdc-…`），用户无法分辨哪条对应哪个工作会话；而 OpenCode 会话能显示真实标题（如「工作台项目探索梳理」）。原因：token-monitor 的会话标题解析器注册表（`src/shared/sessionMetadata.js` 的 `SESSION_METADATA_RESOLVERS`）只有 claude / codex / opencode / droid / kimi / dsh 六家，没有 zcode。而 ZCode 自己在 `~/.zcode/cli/db/db.sqlite` 的 `session` 表里存了 `title`（含 `title_source`、`parent_id`），数据现成可读。

## What Changes

- 新增 `src/shared/providers/zcode/sessionMetadata.js`：只读查询 ZCode 的 SQLite 库（`node:sqlite`，`readOnly` + `busy_timeout`，复用 opencode 解析器已验证的模式），把 `session.title` 映射为会话行标题
- 在 `src/shared/sessionMetadata.js` 注册表注册 `['zcode', { resolve, retryAfterTimestampFallback: true }]`
- 子代理会话（`sess_subagent_agent_*`，`parent_id` 非空）：标题显示为「↳ 父会话标题」，而非其提示词原文
- DB 缺失 / 查询失败 / 标题为空时静默回退到现有裸 ID 展示（不得影响 token 统计本身）
- 测试：新增 fixture DB 驱动的解析器测试（标题、无标题、子代理、DB 缺失、坏 DB 五类场景）

## Capabilities

### New Capabilities

- `zcode-session-titles`: ZCode 客户端会话在 token-monitor 会话列表中显示真实标题（含子代理会话的父会话归属），数据源为本机 ZCode CLI 的 SQLite 会话库，只读访问且失败静默降级

### Modified Capabilities

<!-- 无：现有 7 个能力规格（edge-auto-hide 等）的需求均不受影响，本变更只新增能力 -->
