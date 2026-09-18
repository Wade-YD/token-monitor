# dashboard-manual-refresh Specification

## Purpose
TBD - created by archiving change add-dashboard-manual-refresh. Update Purpose after archive.
## Requirements
### Requirement: 刷新按钮触发即时采集
仪表盘的刷新按钮（↻）被点击时，系统 SHALL 通过 IPC 请求主进程立即执行一次 usage 采集（采集器手动 tick），并在采集完成后重新拉取仪表盘历史数据渲染，使点击后呈现的数据反映本次采集结果。

#### Scenario: 本地模式点击刷新且采集成功
- **WHEN** 用户在仪表盘点击 ↻ 且主进程采集运行时处于活跃状态
- **THEN** 主进程执行一次手动采集，采集产生的新数据经既有推送链路（`dashboard:historyChanged`）或本次拉取返回到仪表盘并渲染

#### Scenario: 采集运行时不存在或已停止
- **WHEN** 手动 tick 请求到达时主进程采集运行时不存在或已停止
- **THEN** 主进程返回明确的未执行结果，仪表盘仍重新拉取当前历史快照渲染，不抛出未处理异常

### Requirement: 刷新过程视觉反馈
刷新按钮在刷新进行期间 SHALL 呈现反馈态（图标旋转动画且不可重复触发），并在刷新结束或超时后恢复可点击状态。

#### Scenario: 点击后进入反馈态
- **WHEN** 用户点击 ↻ 且刷新流程开始
- **THEN** 按钮图标进入旋转动画并进入禁用态，重复点击不产生并发刷新请求

#### Scenario: 刷新结束恢复
- **WHEN** 刷新流程完成（采集返回、拉取渲染结束或达到超时上限）
- **THEN** 按钮恢复静止图标与可点击状态

### Requirement: 刷新请求有界等待
手动刷新 SHALL 有超时上限：主进程采集未在时限内返回时，渲染进程结束等待并恢复按钮，不无限挂起；超时不回滚或清空当前已渲染数据。

#### Scenario: 主进程采集超时
- **WHEN** 主进程在超时上限内未返回采集结果
- **THEN** 仪表盘结束等待、按钮恢复可点击，界面保持最后已知良好数据

### Requirement: 不干扰既有自动刷新
手动刷新 MUST NOT 改变自动采集周期、既有 `dashboard:historyChanged` 自动推送刷新链路，以及 `refreshRunning/refreshQueued` 去抖语义。

#### Scenario: 定时采集推送与手动刷新并存
- **WHEN** 手动刷新等待期间主进程因周期采集推送了 `dashboard:historyChanged`
- **THEN** 仪表盘按既有逻辑响应推送刷新，不出现重复渲染冲突或数据回退

