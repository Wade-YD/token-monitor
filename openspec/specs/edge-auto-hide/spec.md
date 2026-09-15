# edge-auto-hide Specification

## Purpose
TBD - created by archiving change harden-edge-auto-hide. Update Purpose after archive.
## Requirements
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

滑出状态下窗口 MUST 保持进入停靠时的宽高不变，仅改变位置，使约 3px（`EDGE_VISIBLE_PX`）仍位于屏幕内。系统 MUST NOT 通过缩小窗口尺寸来实现隐藏。Windows 上窗口外框相对 Electron bounds 存在 DWM 不可见边框外扩（实测左/右/底各 6px、顶 0px），`top`/`left`/`right` 停靠的隐藏坐标 MUST 向屏外方向额外补偿该外扩（`EDGE_WIN32_FRAME_OVERHANG_PX`），使 **Win32 外框口径**下实际露出的窄条宽度收敛到约 `EDGE_VISIBLE_PX`；`bottom` 停靠由屏幕下边缘自身裁切露出部分，MUST NOT 补偿。

#### Scenario: Sliding out from the top edge
- **WHEN** 窗口（宽 W、高 H）停靠在 `top` 并触发隐藏（win32）
- **THEN** 窗口尺寸仍为 W×H，纵向位置变为 `area.y + 3 - H - 6`，Win32 外框底边落在 `area.y + 3`

#### Scenario: Sliding out from the bottom edge
- **WHEN** 窗口（宽 W、高 H）停靠在 `bottom` 并触发隐藏
- **THEN** 窗口尺寸仍为 W×H，纵向位置为 `area.y + area.height - 3`（不补偿）

#### Scenario: Sliding out from the left edge
- **WHEN** 窗口（宽 W、高 H）停靠在 `left` 并触发隐藏（win32）
- **THEN** 窗口尺寸仍为 W×H，横向位置变为 `area.x + 3 - W - 6`，纵向位置保持不变

#### Scenario: Sliding out from the right edge
- **WHEN** 窗口（宽 W、高 H）停靠在 `right` 并触发隐藏（win32）
- **THEN** 窗口尺寸仍为 W×H，横向位置变为 `area.x + area.width - 3 + 6`，纵向位置保持不变

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

#### Scenario: Startup restore MUST preserve the created window size
- **WHEN** 启动恢复隐藏态时，保存的 `hiddenBounds` 宽高与 `windowBounds` 派生的创建尺寸不一致
- **THEN** 系统 MUST 只应用保存的隐藏坐标，窗口保持创建时的宽高，不得用旧尺寸覆盖用户最后的 resize 结果

#### Scenario: Startup restore MUST recompute the hidden coordinates with the current formula
- **WHEN** 启动恢复时保存的 `hiddenBounds` 坐标由旧版本公式算出（如未含 frame 补偿）
- **THEN** 系统 MUST 以当前公式从 `saved.expandedBounds` 重算隐藏坐标并用于定位与持久化，不得原样信任旧坐标

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

### Requirement: Window focus MUST NOT by itself reveal a hidden docked window

唤出 MUST 且只能由光标触发区命中引起。窗口获得焦点（含启动后的自动聚焦）MUST NOT 触发滑出；该窗口可长期持有焦点，focus 驱动的唤出会在启动时弹出刚恢复的隐藏窗口，并曾在原生层产生一次 `setPosition` 拒收。

#### Scenario: Startup auto-focus keeps the window hidden
- **WHEN** 应用以 `edge` 模式启动并恢复隐藏态，窗口 show 后自动获得焦点，光标不在触发区
- **THEN** 窗口保持隐藏，且 `%TEMP%\token-monitor-edge-error.log` 中不出现本次启动产生的 geometry-guard 拒收

#### Scenario: Cursor trigger still reveals a focused window
- **WHEN** 窗口处于隐藏态且持有焦点，光标移入触发区
- **THEN** 窗口正常滑回展开位置

### Requirement: Docked geometry MUST follow window resizes while hidden

窗口处于隐藏停靠态时若被外部改变尺寸（显示器/DPI 变化或程序性 resize），系统 MUST 依据新尺寸重算展开与隐藏几何、同步 `settings.edgeAutoHideBounds`，并把窗口移到新隐藏位置，使露出窄条宽度保持约 `EDGE_VISIBLE_PX`。重算 MUST 仅调位置、不与用户拖拽冲突（展开态不做该对账）。

#### Scenario: Resized while hidden
- **WHEN** 窗口停靠 `top` 隐藏态，高度从 H1 被改为 H2
- **THEN** 窗口被移到按 H2 重算的隐藏位置，窄条宽度仍约 3px，且 `settings.edgeAutoHideBounds` 的两组 bounds 均更新为 H2

#### Scenario: Resized while expanded
- **WHEN** 窗口停靠展开态，用户拖动边框改尺寸
- **THEN** 系统不强行贴边（避免与拖拽打架）；下次收起与启动恢复均使用新尺寸

### Requirement: Edge auto-hide diagnostics MUST be opt-in

诊断日志 MUST 默认完全关闭；仅当 `settings.edgeAutoHideDebug === true` 或环境变量 `TOKEN_MONITOR_EDGE_DEBUG=1` 时，把决策过程（轮询命中、收起武装、对账、滑出/收起进出、resize 对账、启动恢复、护栏上下文）追加写入 `%TEMP%\token-monitor-edge-debug.log`。错误日志（`token-monitor-edge-error.log`）的既有语义 MUST NOT 依赖诊断开关。

#### Scenario: Diagnostics disabled by default
- **WHEN** 用户未开启诊断开关并正常使用贴边功能
- **THEN** 不产生 `token-monitor-edge-debug.log`，应用行为与无诊断版本完全一致

#### Scenario: Diagnostics enabled captures a hide/show cycle
- **WHEN** 开启诊断开关后执行一轮「唤出 → 收起」
- **THEN** `token-monitor-edge-debug.log` 中出现该轮的触发命中、expand 与 collapse 记录

### Requirement: Resizing a docked expanded window MUST NOT trigger collapse

展开停靠态下，用户调整窗口大小期间系统 MUST NOT 收起窗口。收起的「光标在窗口内」保持测试 MUST 带**交互边距**（`EDGE_INTERACTION_MARGIN_PX`，约 10px）：光标停在 resize 边框上时位于 Win32 外框、在 Electron 矩形之外约 6px，MUST 被视为「在使用窗口」。同时，观察到原生 resize 活动后的短宽限期（约 700ms）内 MUST NOT 武装收起计时器，已武装的计时器到点时 MUST 否决翻转。隐藏态的触发区 MUST NOT 应用该边距（触发区必须保持窄）。

#### Scenario: Cursor resting on the bottom resize border
- **WHEN** 窗口停靠 `top` 展开态，光标停在窗口底边框上（Electron 矩形外约 3~6px）且无 resize 活动持续超过收起延迟
- **THEN** 窗口保持展开，不进入收起流程

#### Scenario: Actively resizing keeps the window revealed
- **WHEN** 用户抓住边框连续调整尺寸（`resize` 事件连续到达），光标随边框移动
- **THEN** 拖拽全程及最后一次 resize 后的宽限期内窗口均保持展开，不滑出

#### Scenario: Cursor truly away still collapses
- **WHEN** 光标离开窗口矩形与交互边距、且宽限期已过
- **THEN** 系统按既有延迟收起，行为与未加边距时一致

