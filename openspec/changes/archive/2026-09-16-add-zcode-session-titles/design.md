## Context

- token-monitor 会话列表的标题来自 `src/shared/sessionMetadata.js` 的按客户端解析器注册表 `SESSION_METADATA_RESOLVERS`（claude / codex / opencode / droid / kimi / dsh），每家解析器约定：入参 `(Set<sessionId>, context)`，返回 `Map<bareSessionId, {startedAt?, lastUsedAt?, title?}>`；核心流程取 `meta.title` 填 `row.sessionTitle`（sessionMetadata.js ~L110）。
- 注册表无 `zcode` 条目 → ZCode 会话回退裸 id 展示。
- ZCode CLI 本机数据：`~/.zcode/cli/db/db.sqlite`（WAL 模式，活跃写入中），`session` 表含 `id / title / parent_id / time_created / time_updated`；子代理会话 id 形如 `sess_subagent_agent_*`，其 `title` 是提示词原文，`parent_id` 指向父会话。已实测截图内 5 个会话 id 全部命中。
- opencode 解析器（`src/shared/providers/opencode/session.js`）已确立同构先例：`node:sqlite` + `readOnly: true` + `PRAGMA busy_timeout=250` + `deps.sqlite` 测试缝，生产验证可用。应用打包内 `node:sqlite` 可用（Electron 内置 Node ≥ 22）。

## Goals / Non-Goals

**Goals:**

- ZCode 会话在会话列表显示 `session.title`；子代理显示「↳ 父会话标题」
- 只读、零写入、失败静默降级，绝不影响 token 统计主流程
- 纯 Node 测试（临时 fixture DB），与现有 per-provider 测试范式一致
- 交付走既有链路（覆盖 11 文件 → pack → 换装 → 运行时验证）

**Non-Goals:**

- 不读取 `message`/`part` 等大表，不做会话内容分析
- 不改 OpenCode / 其他客户端的解析行为
- 不做上游 PR（本机 fork 补丁链自用）
- 不解决 ZCode 子代理标题本身是提示词的问题（显示层截断/归属化即可）

## Decisions

1. **新文件 `src/shared/providers/zcode/sessionMetadata.js`，注册表加一行** —— 与 claude/kimi/codex 等每客户端一文件的既有结构一致；`['zcode', { resolve, retryAfterTimestampFallback: true }]`（标题可能晚于 tokscale 首次暴露会话 id 出现，与 opencode 同策略）。
2. **驱动 = `node:sqlite`（DatabaseSync readOnly），懒加载 + `deps.sqlite` 缝** —— 复用 opencode 模式：应用内已验证可用；测试注入内存实现或临时文件 DB，不依赖本机 ZCode 安装。备选 better-sqlite3 被否：引入新原生依赖、破坏纯 Node 测试链路。
3. **DB 路径 = `path.join(os.homedir(), '.zcode', 'cli', 'db', 'db.sqlite')`，`deps.dbPaths` 可注入** —— 与实测布局一致；不用 `discoverDbPaths` 式多候选发现（ZCode 布局单一、稳定）。
4. **子代理标题 = `'\u21b3 ' + 父标题`（↳ 前缀），一条 SQL 自联查取出** —— 父标题不可得（父不在库/无标题）时回退自身 title，再回退无 title（裸 id）。展示层零改动，语义放在解析器内。
5. **查询按 id 集合分批 `IN`，单连接单次解析** —— 与其他解析器同形；`busy_timeout=250ms` 忙时放弃本轮，下轮刷新重试（`retryAfterTimestampFallback: true` 保证迟到标题最终可见）。
6. **失败面全部吞掉** —— require 失败 / 打开失败 / 查询抛错一律返回空 Map；与「会话统计永不因标题挂掉」的既有约定一致。

## Risks / Trade-offs

- **ZCode 升级改 schema**（表名/列名变化）→ 解析器静默空结果，回退裸 id；影响面仅标题。缓解：查询限定所需列，schema 断言失败即降级。
- **92MB 活跃库上的读放大** → 只按 id 点查 + busy_timeout，单轮 <10ms；每刷新周期至多一次。
- **sqlite 文件锁竞争（Windows）** → `readOnly` + WAL 下读写不互斥，风险极低；busy_timeout 兜底。
- **父标题本身也难辨认时 ↳ 链不展开多级**（只取一层）——够用；多级归属留待真实需求出现。
