# session-list-sort Specification

## Purpose
TBD - created by archiving change add-session-sort-toggle. Update Purpose after archive.
## Requirements
### Requirement: 会话列表排序模式可切换

主面板会话视图 SHALL 提供排序切换控件，支持两种模式：`recent`（最近活跃降序，默认，现行行为）与 `tokens`（当前周期 token 降序）。切换后 SHALL 立即重排当前列表。

#### Scenario: 切换到 Token 模式

- **WHEN** 用户在会话视图点击排序控件切换到 Token 模式
- **THEN** 会话行立即按当前周期 token 从大到小重排，最近活跃时间不再参与排序

#### Scenario: 切回最近模式

- **WHEN** 用户切回「最近」模式
- **THEN** 列表恢复现行排序：最后活跃时间降序，token / 成本 / 名称依次作平局裁决

### Requirement: 排序选择持久化

排序模式 SHALL 持久化到 settings（`sessionSortMode`），重启后保留；键缺失或值非法时 SHALL 回退 `recent`。

#### Scenario: 重启后保留选择

- **WHEN** 用户选择 Token 模式后重启应用
- **THEN** 会话视图仍按 Token 模式排序；设置值损坏时静默回退 `recent`

### Requirement: 控件仅在会话视图显示

排序控件 SHALL 仅在主面板 breakdown 为会话模式时显示，其他视图与窗口（如仪表盘）不受影响。

#### Scenario: 非会话视图不显示

- **WHEN** 用户切换到客户端 / 模型等其他 breakdown 视图
- **THEN** 排序控件隐藏，排序设置保留不丢失

