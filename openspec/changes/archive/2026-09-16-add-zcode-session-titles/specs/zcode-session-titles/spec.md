## ADDED Requirements

### Requirement: ZCode 会话标题解析

系统 SHALL 为 ZCode 客户端的会话解析人类可读标题：从本机 ZCode CLI 的 SQLite 会话库（`~/.zcode/cli/db/db.sqlite`，`session` 表）按 session id 读取 `title` 字段，并填充到会话行的 `sessionTitle`。

#### Scenario: 会话在 ZCode 库中有标题

- **WHEN** 会话列表渲染一条 ZCode 会话，且其 id 在 ZCode `session` 表中存在、`title` 非空
- **THEN** 该会话行显示该 `title`，而非裸 session id

#### Scenario: 会话无标题或不在库中

- **WHEN** 会话 id 不在 ZCode 库中，或对应行 `title` 为空
- **THEN** 该会话行回退到现有展示（客户端名 + 模型 + 裸 session id），不报错、不产生空标题

### Requirement: 子代理会话显示父会话归属

对于 ZCode 库中 `parent_id` 非空的子代理会话，系统 SHALL 以「↳ + 父会话标题」作为其显示标题；父会话标题不可得时 SHALL 回退到该会话自身的标题或裸 id。

#### Scenario: 子代理会话归属展示

- **WHEN** 一条 `sess_subagent_agent_*` 会话的 `parent_id` 指向一个有标题的父会话
- **THEN** 该会话行标题显示为「↳ <父会话标题>」，且不同父会话的子代理可区分

### Requirement: 只读且失败静默降级

对 ZCode SQLite 库的访问 MUST 为只读（`readOnly` 打开 + `busy_timeout`），且 MUST NOT 影响 token 统计主流程：库文件不存在、数据库损坏、驱动不可用（非支持平台或 `node:sqlite` 缺失）时，解析器 SHALL 返回空结果集，会话列表照常渲染。

#### Scenario: ZCode 库不存在或损坏

- **WHEN** 本机不存在 `db.sqlite`，或文件存在但查询抛出异常
- **THEN** token-monitor 的会话列表与 token 统计完全不受影响，仅 ZCode 会话无标题

#### Scenario: 查询不阻塞、不写库

- **WHEN** ZCode CLI 正在运行（WAL 模式、库处于活跃写入状态）时 token-monitor 刷新会话数据
- **THEN** 解析器以只读连接完成查询（忙时受 `busy_timeout` 约束后放弃），对 ZCode 自身零写入
