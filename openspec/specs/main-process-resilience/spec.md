# main-process-resilience Specification

## Purpose
TBD - created by archiving change harden-edge-auto-hide. Update Purpose after archive.
## Requirements
### Requirement: Uncaught main-process exceptions MUST be recorded without a modal dialog

主进程 MUST 安装全局未捕获异常处理器。异常 MUST 被追加写入一个持久日志文件（包含时间戳与 stack）。处理器 MUST NOT 让 Electron 弹出模态错误框 —— 本应用是常驻后台挂件，模态框会打断用户且无法自愈。处理器 MUST NOT 静默丢弃异常。

#### Scenario: An exception escapes a timer callback
- **WHEN** 定时器回调中抛出未捕获异常
- **THEN** 异常与 stack 被写入日志文件，用户界面上不出现模态错误框，应用继续运行

#### Scenario: Log file is not writable
- **WHEN** 日志文件无法写入
- **THEN** 写入失败本身不得再抛出异常或导致功能中断

### Requirement: A wedged feature state MUST self-heal

当内部状态与窗口实际几何不一致时，系统 MUST 能通过对账自行纠正，MUST NOT 依赖任何单次成功路径来解除卡死。任何「进行中」类的状态标志 MUST 具备随时间自动失效的语义。

#### Scenario: State says hidden but the window is expanded
- **WHEN** 期望态为「隐藏」而窗口实际处于展开位置超过一个对账周期
- **THEN** 系统重新执行滑出，使窗口回到隐藏位置

#### Scenario: A stale in-flight marker
- **WHEN** 某个「动画进行中」标记因中断而未被清除
- **THEN** 该标记在至多一个动画时长后自动失效，功能恢复

### Requirement: Feature isolation MUST allow disabling without a rebuild

每个新引入的功能 MUST 能在不重新打包应用的前提下被关停（通过配置或设置项）。某一功能发生不可恢复的故障时，MUST NOT 影响应用其余部分的可用性。

#### Scenario: Disabling the feature
- **WHEN** 用户把该功能的配置开关关掉
- **THEN** 功能停止生效，应用其余部分继续保持可用，且不需要替换任何构建产物

### Requirement: No guarded geometry write before the window is first shown

edge 功能内经 `setEdgeWindowPosition` 的窗口几何写入 MUST 在窗口首次 `show` 之前跳过（就绪门控），且跳过 MUST NOT 置位会话级动画降级（`guardTripped`）——「窗口尚未显示」不是错误，不得让一次启动期的写入损失整场动画。

#### Scenario: Startup produces no guard rejection and keeps tweening
- **WHEN** 应用以 `edge` 模式启动并恢复隐藏态，启动期间任何 edge 代码路径尝试移动窗口
- **THEN** `%TEMP%\token-monitor-edge-error.log` 不出现本次启动产生的拒收记录，后续滑出/滑回仍播放补间动画

