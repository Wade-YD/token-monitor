## ADDED Requirements

### Requirement: Docking is determined by the nearest screen edge

当窗口处于 `edge` 模式且被移动到某条屏幕边缘附近（阈值 12px）时，系统 SHALL 将其判定为停靠在该边；若不在任何边缘阈值内，SHALL 判定为不停靠并保持普通浮动。停靠判定 MUST 基于窗口当前所在显示器（`displayForBounds`），且 Windows 上 MUST 以物理屏 `display.bounds` 为参照（而非 `workArea`），否则任务栏所在的那条边会被算错。

#### Scenario: Window released near the top edge
- **WHEN** 用户在 `edge` 模式下把窗口拖到距屏幕上边缘 12px 以内并松手
- **THEN** 系统判定停靠边为 `top`，并在光标离开后按 `top` 的几何滑出

#### Scenario: Window released away from every edge
- **WHEN** 用户在 `edge` 模式下把窗口拖到屏幕中部（距四边均超过 12px）
- **THEN** 系统判定为不停靠，窗口既不隐藏也不滑动，且已记住的停靠边被清除

#### Scenario: Window parked mid-screen in edge mode
- **WHEN** 应用以 `edge` 模式启动，而持久化的窗口位置在屏幕中部
- **THEN** 窗口保持可见且不自动隐藏（这是正确行为，不得被当作缺陷）

### Requirement: Hidden state leaves a thin visible strip and MUST NOT resize the window

滑出状态下窗口 MUST 保持进入停靠时的宽高不变，仅改变位置，使约 3px（`EDGE_VISIBLE_PX`）仍位于屏幕内。系统 MUST NOT 通过缩小窗口尺寸来实现隐藏。

#### Scenario: Sliding out from the top edge
- **WHEN** 窗口（宽 W、高 H）停靠在 `top` 并触发隐藏
- **THEN** 窗口尺寸仍为 W×H，纵向位置变为 `area.y + 3 - H`

#### Scenario: Sliding out from the left edge
- **WHEN** 窗口（宽 W、高 H）停靠在 `left` 并触发隐藏
- **THEN** 窗口尺寸仍为 W×H，横向位置变为 `area.x + 3 - W`，纵向位置保持不变

### Requirement: The reveal trigger MUST be constrained along the docked edge

触发区 MUST 垂直于停靠边延伸约 12px（`EDGE_TRIGGER_PERPENDICULAR_TOLERANCE`，因露出的窄条只有约 3px 高，容差过小会几乎无法唤出），并且 MUST 沿停靠边方向限制在窗口自身的跨度内、两端各留约 8px（`EDGE_TRIGGER_ALONG_PADDING`）。**仅凭「光标位于那条屏幕边缘」MUST NOT 构成触发。**

#### Scenario: Cursor on the same screen edge but far from the window span
- **WHEN** 窗口停靠在 `top`、跨度覆盖 `x ∈ [a, b]`，而光标位于同一上边缘但 `x` 落在 `[a − 8, b + 8]` 之外
- **THEN** 窗口保持隐藏，不得唤出

#### Scenario: Cursor inside the window span at the edge
- **WHEN** 窗口停靠在 `top`，光标位于上边缘且 `x ∈ [a + 8, b − 8]`
- **THEN** 窗口滑回展开位置

### Requirement: Reveal and re-hide MUST form a repeatable cycle

光标进入触发区时系统 SHALL 将窗口滑回展开位置；光标离开窗口与触发区后 SHALL 在延迟后重新滑出。该循环 MUST 可重复执行，不得在若干轮之后失效。

#### Scenario: Second and subsequent cycles
- **WHEN** 「隐藏 → 唤出 → 光标移开」连续执行 5 轮
- **THEN** 每一轮都完整经历「唤出」与「重新隐藏」，且窗口最终位置与首轮的隐藏位置一致

#### Scenario: Cursor leaves the window while it is expanded
- **WHEN** 窗口已展开且光标移出窗口范围与触发区
- **THEN** 系统在延迟后重新滑出，且不依赖窗口是否拥有焦点

### Requirement: The collapse decision MUST NOT be gated on window focus

收起判定 MUST NOT 以 `mainWindow.isFocused()` 为条件。理由：该窗口可获取焦点且会长期持有焦点，以焦点为门槛会使收起永远无法发生；光标位置检查（光标是否落在窗口矩形内）已足够表达「用户正在操作时不要收起」。

#### Scenario: Window holds focus and the cursor is elsewhere
- **WHEN** 窗口处于展开态、持有焦点，且光标位于窗口范围之外
- **THEN** 窗口仍然重新滑出

### Requirement: No animation may permanently disable auto-hide

表示「动画进行中」的状态 MUST 采用随时间自动失效的形式（如截止时刻），MUST NOT 采用只能由特定成功路径清除的布尔标志。任何异常、提前返回或中断都 MUST NOT 使自动隐藏功能永久失效。

#### Scenario: An animation frame throws
- **WHEN** 补间的某一帧抛出异常
- **THEN** 动画状态在至多一个动画时长后自动失效，后续轮次仍能正常唤出与收起

#### Scenario: Poll observes an in-flight animation
- **WHEN** 光标轮询在动画进行期间触发
- **THEN** 该轮不做移动，但动画结束后轮询恢复决策，不产生永久停滞

### Requirement: Non-finite coordinates MUST NOT reach native window APIs

edge 功能内所有窗口几何写入 MUST 经过统一校验；当任一坐标不是有限数时，系统 MUST 跳过该次写入而非调用 Electron 原生 API，并 MUST 记录当时的 `from`/`to` 全量值以便定位根因。系统 MUST NOT 以静默兜底（如 `Number(x) || 0`）的方式把错误坐标写入。

#### Scenario: A frame computes a non-finite target
- **WHEN** 补间计算出非有限的 `x` 或 `y`
- **THEN** 不调用 `setPosition`，窗口不发生移动，且日志中出现被拒的 `from`/`to` 原始值

#### Scenario: Repeated rejections
- **WHEN** 同一会话中护栏已拒绝过任一帧
- **THEN** 该会话内后续的滑出/滑回降级为瞬移，不再执行补间

### Requirement: Hidden geometry MUST NOT pollute the persisted normal bounds

滑出状态下的窗口坐标 MUST NOT 被写入 `settings.windowBounds`。隐藏几何 MUST 单独持久化（`settings.edgeAutoHideBounds`，含 `side`、`expandedBounds`、`hiddenBounds`），使下次启动能恢复到隐藏态而不是被判定为「窗口在屏外」而丢弃坐标。

#### Scenario: Bounds persisted while hidden
- **WHEN** 窗口处于滑出状态且系统触发一次坐标持久化
- **THEN** `settings.windowBounds` 仍是展开态的坐标，隐藏坐标只出现在 `settings.edgeAutoHideBounds`

#### Scenario: Restoring a remembered dock on startup
- **WHEN** 应用以 `edge` 模式启动且 `settings.edgeAutoHideBounds` 存在且其几何仍能匹配到当前显示器
- **THEN** 窗口直接停在隐藏位置且不播放动画；若几何无法匹配任何显示器，则忽略该记录并保持可见

### Requirement: Reduced motion MUST be honored

当应用的 `reduceMotion` 设置（取值 `system` / `on` / `off`，经 `src/electron/motionPreference.js` 的 `shouldReduceMotion` 判定）表示应减少动效时，滑出与滑回 MUST 直接改变位置而不播放补间动画。

#### Scenario: Reduced motion enabled
- **WHEN** 有效动效偏好为「减少」且窗口需要滑出
- **THEN** 窗口一次性移动到隐藏位置，不产生中间帧

### Requirement: Auto-hide MUST be disableable without rebuilding the application

功能 MUST 可通过把 `settings.json` 的 `windowBehavior` 改为任意非 `edge` 值而停用，且停用后窗口 SHALL 回到对应的普通行为。切离 `edge` 模式时，系统 MUST 清除已记住的停靠信息（`settings.edgeAutoHideBounds`），且 MUST NOT 把窗口遗留在屏外。

#### Scenario: Switching away from edge mode
- **WHEN** 窗口处于隐藏态时把 `windowBehavior` 改为 `floating`
- **THEN** 窗口先回到展开位置，随后按 `floating` 行为显示，且 `settings.edgeAutoHideBounds` 被移除

#### Scenario: Unknown mode value in settings
- **WHEN** `settings.json` 中的 `windowBehavior` 为未知值
- **THEN** 应用回退为 `floating` 且不报错
