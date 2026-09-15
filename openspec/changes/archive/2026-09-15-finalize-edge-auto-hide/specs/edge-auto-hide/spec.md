## MODIFIED Requirements

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

## ADDED Requirements

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
