# Proposal: finalize-edge-auto-hide

## Why

贴边自动隐藏（`harden-edge-auto-hide` 归档后）核心闭环已可用，但遗留 6 项已知问题，其中 3 项用户可直接感知：

1. **每次启动都损失整场动画**：启动时 `focus` 处理器对刚恢复隐藏态的窗口调用 `expandEdge()`，
   产生一次原生 `setPosition` 拒收（日志 `native setPosition rejected a finite position`），
   护栏随即将会话级 `guardTripped` 置位——之后所有滑出/滑回都退化为瞬移。
2. **露出的窄条是 9px 而非设计的 3px**：实测 Win32 外框相对 Electron bounds 在左/右/底各外扩 6px、顶为 0；
   `top`/`left`/`right` 停靠的隐藏位置未补偿该外扩。
3. **重启后窗口尺寸回退**：停靠期间用户改了窗口尺寸，`settings.edgeAutoHideBounds` 不同步；
   启动恢复路径用保存的旧宽高整包 `setBounds`，把用户最后拖出的尺寸盖掉。

另有 3 项工程债：死代码 `edgeExpandedBoundsForSide`（含多显示器下的错误硬编码）、
排障探针被删导致下次诊断要重插、隐藏期间窗口被外部改尺寸（显示器/DPI 变化）后窄条宽度漂移。

## What Changes

- **聚焦不再唤出**：`win.on('focus')` 移除 `expandEdge()`；唤出唯一入口是光标触发区（符合既有规格的触发区语义，并消除启动弹出的竞态）。
- **几何写入就绪门控**：新增 `geometryReady`（首次 `show` 置位）；`setEdgeWindowPosition` 在就绪前直接跳过且不触发护栏降级。
- **启动恢复只挪位置**：恢复隐藏态时保留窗口创建尺寸（取自 `windowBounds`），只应用保存的隐藏坐标，不再整包 `setBounds` 盖掉尺寸。
- **frame 偏移补偿**：`edgeHiddenBounds` 在 win32 上对 `top`/`left`/`right` 停靠额外外移 6px（`bottom` 停靠由屏幕边自身裁切，精确无需补偿）。
- **resize 对账**：新增 `syncEdgeDockGeometry()` 挂在 `resized` 事件上——隐藏态被改尺寸时重算隐藏位置并同步 `settings.edgeAutoHideBounds`。
- **诊断开关**：`settings.edgeAutoHideDebug === true` 或环境变量 `TOKEN_MONITOR_EDGE_DEBUG=1` 时，
  决策日志（轮询命中/收起武装/对账/恢复/护栏上下文）写入 `%TEMP%\token-monitor-edge-debug.log`；默认零输出。
- **死代码清理**：删除 `edgeExpandedBoundsForSide` 及其导出。

## Impact

- **specs**：`edge-auto-hide`（3 处 MODIFIED / 3 处 ADDED）、`main-process-resilience`（1 处 ADDED）。
- **代码**：`src/electron/edgeAutoHide.js`、`src/electron/main.js`、`tests/electron/edgeAutoHide.test.js`。
- **不做**（沿用上一变更的中档范围裁剪）：tray/UI 诊断开关（settings 键 + 环境变量已满足）、
  `upstream-patch-maintenance` 正式化、`bottom` 停靠的补偿（本就精确）、多显示器动态 overhang 测量。
