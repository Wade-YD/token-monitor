> **【已取代 · 仅作归档】**
>
> 这是变更 `harden-edge-auto-hide` 在**中档范围裁剪前**的原始任务清单（**52 项 / 9 组 / 3 个能力**）。
>
> - **来源**：OpenCode 会话 `ses_f5d58bb8fffeTYvUTV528ZYyxk` 的 write 工具调用载荷。
>   **它从未提交进 git** —— 裁剪发生在该变更的首次提交（`5c3d96b`）之前。
> - **取代者**：裁剪后的 38 项版本，位于
>   `TokenHub\openspec\changes\archive\2026-09-15-harden-edge-auto-hide\tasks.md`
> - **裁剪原因**：用户质疑「做一个贴边隐藏不该动这么多东西」。中档 = 止血
>   （坐标护栏 / 动画状态改截止时刻 / 崩溃兜底）+ 结构防腐（单一对账执行者），其余推迟。
> - **后续进展**：被推迟的项目**大多已由变更 `finalize-edge-auto-hide`（提交 `d729af5`）实现** ——
>   启动几何门控 `geometryReady`、窄条 9px→3px 的 frame 补偿、启动恢复不再覆盖用户尺寸、
>   `resize` 对账 `syncEdgeDockGeometry()`、可开关诊断、删除死代码 `edgeExpandedBoundsForSide`。
>   仍未做：`upstream-patch-maintenance` 正式化。
> - **保留价值**：这是「完整方案」的原始边界记录。想知道还剩哪些没做，对着它逐条核即可。
>
> ---
>
> （以下为原文，未作任何修改。）
>
> ## 1. 前置与基线

- [ ] 1.1 确认 fork 工作目录 `C:\Users\29871\AppData\Local\Temp\opencode\tm-fork` 存在、在分支 `feat/edge-auto-hide`、且工作树干净（`git status --short` 无输出）
- [ ] 1.2 记录基线：tag `v0.57.0`、commit `bbe07de`、发行包 SHA-256 `cd1732525f8c5445e14b62b84d44a572e16440569934feb6b922e995e7e0af94`（与 GitHub digest 逐位一致）；写入 `openspec/changes/harden-edge-auto-hide/` 下的基线记录
- [ ] 1.3 确认回退物存在：`C:\Users\29871\AppData\Local\Programs\Token Monitor\resources\app.asar.orig-backup`，大小 18,753,883 B
- [ ] 1.4 确认交付管道仍可用：解包目录 `...\Temp\opencode\asar-extracted` 存在（2173 个文件），`npx --yes @electron/asar` 可用
- [ ] 1.5 记录本次实测的 frame 偏移现象：Electron `getBounds()` 与 Win32 `GetWindowRect` 相差约（-6, -4）位置偏移、宽高外扩约（+12, +6），导致实际露出约 9px 而非 3px、触发带实际相当于 `y ∈ [-4, 8]`（仅记录，不追求修复）

## 2. 坐标护栏与动画状态（D1 / D2）

- [ ] 2.1 在 `src/electron/main.js` 的 edge 区域新增统一的几何写入出口 `setEdgeWindowPosition(x, y)`：先校验 `Number.isFinite(x) && Number.isFinite(y)`，非法则不调用 Electron API、写入护栏日志（含 `from`/`to` 原始值）并返回 `false`
- [ ] 2.2 把 `animateWindowPosition()` 的两处写入改为走该出口：`src/electron/main.js` 的 `edgeReducedMotion()` 瞬移分支，以及 `tick()` 内那一帧
- [ ] 2.3 `edgeAutoHideState` 的 `animating`（布尔）改为 `animatingUntil`（epoch 毫秒）；新增判定函数（如 `edgeIsAnimating()`）返回 `Date.now() < animatingUntil`
- [ ] 2.4 更新所有依赖该状态的判断点：轮询首行的「动画中即早退」、`trackEdgeExpandedBounds()` 的前置判断、以及 `syncEdgeAutoHideAvailability()` 中的引用
- [ ] 2.5 确认动画开始/结束分别置 `animatingUntil = Date.now() + duration` 与 `animatingUntil = 0`，且**不依赖**任何单一成功路径来清除
- [ ] 2.6 新增会话级降级开关：护栏一旦拒绝过任一帧，本会话内后续滑出/滑回改为瞬移（并记录一行日志）

## 3. 声明式目标态与对账（D3）

- [ ] 3.1 在 `edgeAutoHideState` 中新增 `desired`（`'hidden' | 'revealed' | null`）
- [ ] 3.2 改造 100ms 光标轮询：**只更新 `desired`**，不再直接调用 `collapseEdge()`/`expandEdge()` 移动窗口
- [ ] 3.3 新增对账执行器 `reconcileEdgeAutoHide()`：比较 `desired` 与 `mainWindow.getBounds()` 的实际位置，不一致则执行一次受护栏保护的移动，一致则不做任何事（幂等）
- [ ] 3.4 把现有的 1s 看门狗改为调用对账执行器；对账周期默认 1000ms（若体感过慢可下调至 250ms，需记录该取舍）
- [ ] 3.5 收起延迟改为「期望态切换 + 对账」驱动：光标离开后经 `EDGE_COLLAPSE_DELAY_MS`（200ms）把 `desired` 置为 `'hidden'`，实际移动由对账完成
- [ ] 3.6 删除或收拢 `setTimeout` 形式的 `collapseTimer` 及其多个清理点，确保不再存在「两条互相踩的链路」
- [ ] 3.7 保持 `expandEdge()` 的重装顺序与异常隔离（`scheduleEdgeAutoHide()` 在持久化之前、持久化包 try/catch），并确认改造后该保护仍必要或已被对账取代
- [ ] 3.8 确认收起判定**不含** `mainWindow.isFocused()` 门槛（`src/electron/main.js` 展开态判定与计时器回调两处）

## 4. 主进程崩溃兜底（D6）

- [ ] 4.1 安装 `process.on('uncaughtException')` 处理器：把时间戳与 stack 追加到 `%APPDATA%\Token Monitor\edge-errors.log`
- [ ] 4.2 处理器内复位 edge 相关状态（`animatingUntil = 0`、清计时器、保留 `desired`），使下一轮对账能自愈
- [ ] 4.3 确认处理器**不 re-throw**（re-throw 会再次触发 Electron 模态框），并在代码注释与 `design.md` 里写明该取舍
- [ ] 4.4 确认日志写入本身失败时不会再抛异常（写入包 try/catch）

## 5. 诊断开关（D7）

- [ ] 5.1 新增开关：`settings.json` 的 `edgeAutoHideDebug`（默认 `false`），或环境变量 `TM_EDGE_DEBUG=1`（二者取或）
- [ ] 5.2 开关开启时输出决策追踪：每个轮询周期的 `desired`、`hidden`、停靠判定、`bounds`、对账结论
- [ ] 5.3 确认默认配置下**不产生**逐周期日志
- [ ] 5.4 确认护栏拒绝日志是**唯一常开**的诊断输出（仅异常路径触发）

## 6. 清理与修正（D8）

- [ ] 6.1 确认 `src/electron/edgeAutoHide.js` 的 `edgeExpandedBoundsForSide` 无调用点，且 `tests/electron/edgeAutoHide.test.js` 未把它当作公开 API 断言
- [ ] 6.2 按上一步结论处理：删除该函数与其测试，或改为使用 `area.x` 与沿边位置的正当实现
- [ ] 6.3 修正与实现不符的注释：`src/electron/main.js` 中「and the window is not focused」一类已过时的描述（焦点门槛已移除）
- [ ] 6.4 全量 `node --check` 所有改动的 `.js` 文件

## 7. 测试

- [ ] 7.1 更新 `tests/electron/edgeAutoHide.test.js`，覆盖新增/变更的纯逻辑：对账所需的目标位置计算、`EDGE_COLLAPSE_DELAY_MS` 与 `EDGE_ANIMATION_DURATION_MS` 的语义
- [ ] 7.2 新增针对「动画状态自动失效」的测试：注入一个非有限坐标后，判定函数在至多一个动画时长后返回假
- [ ] 7.3 新增针对「护栏拒绝非有限坐标」的测试：断言非法值不产生写入调用
- [ ] 7.4 运行 `node --test tests/electron/edgeAutoHide.test.js tests/electron/windowBehavior.test.js tests/electron/tray.test.js`，三者全部 exit=0（纯 Node，无需 `node_modules`）
- [ ] 7.5 若第 6.2 步删除了导出成员，确认 `tests/electron/windowBehavior.test.js:24-56` 的 profile deepEqual 与源码正则契约断言仍然通过

## 8. 交付与验证（D9）

- [ ] 8.1 编写验证脚本（固化本次奏效的方法）：读 Win32 窗口矩形 + 程序化移动光标 + 断言
- [ ] 8.2 脚本 MUST 用「尺寸最接近 `windowBounds`」识别主窗口，并**排除 `#32770` 对话框**（避免把 Electron 内部对话框当主窗口）
- [ ] 8.3 脚本 MUST 显式断言全程不存在标题为 `Error`、类为 `#32770` 的可见窗口
- [ ] 8.4 脚本 MUST 先构造前置状态（把 `windowBounds` 放到目标边）；若窗口不在任何边附近，MUST NOT 把「未隐藏」判为缺陷
- [ ] 8.5 脚本 MUST 连续断言 ≥5 轮「唤出 → 收起」循环（覆盖「首轮通过、后续失效」这一真实失效形态）
- [ ] 8.6 脚本 MUST 断言触发区沿边约束的反例：光标在同一屏幕边缘、沿边方向远离窗口跨度时**不得唤出**
- [ ] 8.7 脚本 MUST 断言持久化隔离：`settings.windowBounds` 不含隐藏坐标，`settings.edgeAutoHideBounds` 存在且结构完整
- [ ] 8.8 打包并替换：把改动文件覆盖进 `asar-extracted` → `npx --yes @electron/asar pack` → 覆盖 `resources\app.asar`（**替换前再确认一次 1.3 的备份存在**）
- [ ] 8.9 运行 8.1 的脚本至全绿（≥5 轮 + 无错误框 + 持久化断言），并保存原始输出
- [ ] 8.10 若仍出现护栏拒绝或崩溃，回读护栏日志中记录的 `from`/`to`，把该答案写入 `design.md` 的 Open Questions
- [ ] 8.11 在 fork 提交改动，并在提交信息中写明本次修复的三个要点（护栏、截止时刻、对账）

## 9. 留档与回退

- [ ] 9.1 把补丁与验证脚本从系统临时目录另存到持久位置（例如 `D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-patch\`），并核对可重新取回
- [ ] 9.2 写一份重新应用补丁的操作说明：基线 tag → `git apply` → 跑测试 → 打包 → 替换 → 跑验证 → 回退办法
- [ ] 9.3 确认三层回退路径可用并记录：① 把 `windowBehavior` 改回 `floating`（零风险停用）② 用 `app.asar.orig-backup` 覆盖（回到官方构建）③ `git checkout 9da4de1` 后重新打包（回到本次修复前的补丁版本）
- [ ] 9.4 运行 `openspec validate harden-edge-auto-hide --strict` 通过
- [ ] 9.5 在本变更的 `design.md` 中回填「`y` 根因」的最终答案（若 8.10 已获得），或明确记录为仍未定位
