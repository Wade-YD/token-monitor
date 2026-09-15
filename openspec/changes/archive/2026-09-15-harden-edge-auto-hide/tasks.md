## 1. 落地前确认

- [x] 1.1 确认 fork `C:\Users\29871\AppData\Local\Temp\opencode\tm-fork` 在分支 `feat/edge-auto-hide`、工作树干净；记录当前 HEAD 与基线（上游 `v0.57.0` / `bbe07de`）
- [x] 1.2 确认回退物存在：`...\Programs\Token Monitor\resources\app.asar.orig-backup`，大小 18,753,883 B
- [x] 1.3 确认交付管道仍可用：`...\Temp\opencode\asar-extracted` 存在，`npx --yes @electron/asar` 可用

## 2. 坐标护栏与动画状态（D1 / D2 / D5）

- [x] 2.1 新增统一的几何写入出口 `setEdgeWindowPosition(x, y)`：先校验 `Number.isFinite(x) && Number.isFinite(y)`；非法则不调用 Electron API、写入护栏日志（含 `from`/`to` 原始值）并返回 `false`
- [x] 2.2 把 `animateWindowPosition()` 的两处写入改走该出口：`edgeReducedMotion()` 的瞬移分支，以及 `tick()` 内的那一帧
- [x] 2.3 会话级降级：护栏一旦拒绝过任一帧，本会话内后续滑出/滑回改为瞬移，并记录一行
- [x] 2.4 `edgeAutoHideState.animating`（布尔）改为 `animatingUntil`（epoch 毫秒）；新增判定函数 `edgeIsAnimating()` 返回 `Date.now() < animatingUntil`
- [x] 2.5 更新全部依赖点（轮询首行的「动画中早退」、`trackEdgeExpandedBounds()`、`syncEdgeAutoHideAvailability()`），并确认动画开始/结束分别置 `animatingUntil`，不依赖任何单一成功路径清除

## 3. 声明式目标态与单一对账执行者（D3）

- [x] 3.1 新增 `edgeAutoHideState.desired`（`'hidden' | 'revealed' | null`）
- [x] 3.2 改造 100ms 光标轮询：只更新 `desired`，不再直接移动窗口
- [x] 3.3 新增对账执行器 `reconcileEdgeAutoHide()`：比较 `desired` 与 `mainWindow.getBounds()` 实际位置，不一致才执行一次受护栏保护的移动，一致则不做任何事（幂等）
- [x] 3.4 把 1s 看门狗改为调用对账执行器，周期 1000ms
- [x] 3.5 收起延迟改由「`desired` 切换 + 对账」驱动：光标离开经 `EDGE_COLLAPSE_DELAY_MS`（200ms）后把 `desired` 置为 `'hidden'`
- [x] 3.6 收拢或删除 `setTimeout` 形式的 `collapseTimer` 及其多点清理，确保不再存在两条互相踩的链路
- [x] 3.7 确认收起判定**不含** `mainWindow.isFocused()` 门槛（展开态判定与计时器回调两处），并确认 `expandEdge()` 的重装顺序与异常隔离在改造后仍成立（或被对账取代）

## 4. 主进程崩溃兜底（D6）

- [x] 4.1 安装 `process.on('uncaughtException')`：把时间戳与 stack 追加到 `%APPDATA%\Token Monitor\edge-errors.log`
- [x] 4.2 处理器内复位 edge 状态（`animatingUntil = 0`、清计时器、保留 `desired`），使下一轮对账能自愈
- [x] 4.3 确认处理器**不 re-throw**（否则 Electron 仍会弹模态框），在代码注释中写明该取舍；且日志写入失败不得再抛异常

## 5. 测试

- [x] 5.1 更新 `tests/electron/edgeAutoHide.test.js`，覆盖新增纯逻辑（对账所需的目标位置计算、`EDGE_COLLAPSE_DELAY_MS` / `EDGE_ANIMATION_DURATION_MS` 语义）
- [x] 5.2 新增「动画状态自动失效」测试：注入非有限坐标后，判定函数在至多一个动画时长后返回假
- [x] 5.3 新增「护栏拒绝非有限坐标」测试：断言非法值不产生几何写入调用
- [x] 5.4 运行 `node --test tests/electron/edgeAutoHide.test.js tests/electron/windowBehavior.test.js tests/electron/tray.test.js`，三者全部 exit=0（纯 Node，无需 `node_modules`）
- [x] 5.5 对所有改动的 `.js` 文件执行 `node --check`

## 6. 交付与验证

- [x] 6.1 打包并替换：改动文件覆盖进 `asar-extracted` → `npx --yes @electron/asar pack` → 覆盖 `resources\app.asar`（**替换前再确认一次 1.2 的备份存在**）
- [x] 6.2 验证脚本识别主窗口时 MUST 用「尺寸最接近 `windowBounds`」并**排除 `#32770` 对话框**；MUST 先把 `windowBounds` 放到目标边以构造前置状态（窗口不在边缘时「未隐藏」是正确行为，不得判为缺陷）
- [x] 6.3 断言连续 **≥5 轮**「唤出 → 收起」循环（覆盖「首轮通过、后续失效」这一真实失效形态）
- [x] 6.4 断言全程不存在标题为 `Error`、类为 `#32770` 的可见窗口（本次漏检，导致崩溃与「不收起」未被第一时间分离）
- [x] 6.5 断言触发区沿边约束的反例：光标在同一屏幕边缘、沿边方向远离窗口跨度时**不得唤出**
- [x] 6.6 断言持久化隔离：`settings.windowBounds` 不含隐藏坐标；`settings.edgeAutoHideBounds` 存在且结构完整
- [x] 6.7 全部断言通过；若仍出现护栏拒绝或崩溃，回读护栏日志记录的 `from`/`to`，并把答案写入 `design.md` 的 Open Questions

## 7. 提交与留档

- [x] 7.1 在 fork 的 `feat/edge-auto-hide` 分支提交本次修复，提交信息写明三个要点（坐标护栏 / 截止时刻 / 单一对账）
- [x] 7.2 把补丁与验证脚本从系统临时目录另存到持久位置（例如 `D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-patch\`），并核对可重新取回
- [x] 7.3 提交 TokenHub 仓库里的本变更产物（含本次对 tasks/design/proposal/specs 的范围调整），提交后再执行 `openspec validate harden-edge-auto-hide --strict` 确认通过

## 8. 本次明确不做（推迟到后续变更）

- [x] 8.1 诊断开关（`edgeAutoHideDebug` / `TM_EDGE_DEBUG`）—— 本次只保留异常路径的常开记录
- [x] 8.2 删除死代码 `edgeExpandedBoundsForSide`（未被调用且把 `x` 硬编码为 0）
- [x] 8.3 `upstream-patch-maintenance` 能力（记基线文档化、补丁可重放流程、三层回退的正式化）
- [x] 8.4 把验证夹具做成可复用的正式脚本（本次仍是一次性脚本）
- [x] 8.5 frame 偏移（Electron `getBounds()` 与 Win32 `GetWindowRect` 相差约（-6, -4）、宽高外扩约（+12, +6），实际露出约 9px）—— 仅记录，不修
