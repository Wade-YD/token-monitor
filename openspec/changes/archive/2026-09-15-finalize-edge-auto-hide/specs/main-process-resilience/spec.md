## ADDED Requirements

### Requirement: No guarded geometry write before the window is first shown

edge 功能内经 `setEdgeWindowPosition` 的窗口几何写入 MUST 在窗口首次 `show` 之前跳过（就绪门控），且跳过 MUST NOT 置位会话级动画降级（`guardTripped`）——「窗口尚未显示」不是错误，不得让一次启动期的写入损失整场动画。

#### Scenario: Startup produces no guard rejection and keeps tweening
- **WHEN** 应用以 `edge` 模式启动并恢复隐藏态，启动期间任何 edge 代码路径尝试移动窗口
- **THEN** `%TEMP%\token-monitor-edge-error.log` 不出现本次启动产生的拒收记录，后续滑出/滑回仍播放补间动画
