## ADDED Requirements

### Requirement: ZCode 会话明细事件读取

系统 SHALL 为 ZCode 会话从本机 SQLite 库（`~/.zcode/cli/db/db.sqlite`）的 `message`/`part` 表读取逐条消息与部件，产出与会话明细视图一致的中性事件流：每条用户消息为一个 `prompt` 事件（含文本与时间戳），每条助手消息为一个 `turn` 事件（含 input/output/cacheRead/cacheWrite/reasoning/total token、去重工具名列表与时间戳）。

#### Scenario: 会话存在消息时产出事件流

- **WHEN** 用户点入一条有消息记录的 ZCode 会话
- **THEN** 明细视图按轮展示提问与回复，每轮显示 token 与该轮用到的工具名

#### Scenario: 成本按会话估算值比例分摊

- **WHEN** ZCode 会话进入明细视图（订阅制下 `message.cost` 恒为 0）
- **THEN** 各轮成本按该轮 token 占比从会话卡片的估算成本中分摊，合计与会话卡片一致

### Requirement: 明细可用性与降级

ZCode 会话行的可点入标记 SHALL 在 zcode 客户端加入明细分发后生效；ZCode 库缺失、损坏、驱动不可用或会话无消息时，点击 SHALL 静默不可用（`found: false`），不影响会话列表与 token 统计。

#### Scenario: 库缺失或会话无消息

- **WHEN** 本机无 `db.sqlite`，或该会话在 `message` 表中无记录
- **THEN** 会话行表现与接入前一致（无明细），不报错、不阻塞列表刷新

### Requirement: 只读访问

对 ZCode SQLite 库的明细查询 MUST 为只读（`readOnly` + `busy_timeout`），MUST NOT 写入库文件，MUST NOT 在会话列表刷新路径上引入阻塞式全表扫描（仅按 session id 点查）。

#### Scenario: ZCode 运行中查询不干扰

- **WHEN** ZCode CLI 正在写入（WAL 活跃）时用户点入 ZCode 会话
- **THEN** 查询以只读连接完成或忙时放弃，ZCode 自身零感知
