## Why

为第三方 Electron 应用 token-monitor 新增的「贴边自动隐藏折叠」模式（第 4 种 `windowBehavior`）目前**会在运行中让主进程崩溃，并让功能永久瘫痪**：动画补间里的 `mainWindow.setPosition(x, y, false)`（补丁后 `src/electron/main.js:2304`）收到非有限的 `y`，抛出 `TypeError: Error processing argument at index 1, conversion failure from`，Electron 弹出模态错误框；同时 `edgeAutoHideState.animating` 这个布尔标志被永久卡在 `true`，而光标轮询首行就 `if (… animating) return;` 早退 —— 窗口**再也不收起**。

这不是偶发：实测第 1 轮「隐藏→唤出→收起」循环通过，第 2、3 轮全部卡在展开态。对一个后台挂件而言，「弹错误框 + 功能永久失效」是不可接受的失效模式。

必须现在处理，因为该功能**已经交付进已安装应用**（`app.asar` 已被替换为带补丁的版本），用户随时会用到它。

## What Changes

**本次范围 = 中档：止血（护栏 + 截止时刻 + 崩溃兜底）＋ 结构防腐（单一对账执行者）。**

- **坐标护栏**：edge 功能内所有窗口几何写入统一走一个校验函数；任何非有限坐标**不得**进入 Electron 原生 API，改为记录 `from`/`to` 原始值并跳过该帧（使下一次发生即可自证根因）。
- **动画标志改为截止时刻**：`edgeAutoHideState.animating`（布尔）→ `animatingUntil`（epoch 毫秒）。异常或中断都不可能再把它永久卡住，最坏在动画时长后自动失效。这是本次最关键的一条 —— 它一类消灭了「布尔标志卡死导致功能永久瘫痪」。
- **收起/展开改为声明式目标态 + 单一执行者**：引入期望态 `'hidden' | 'revealed'`；100ms 光标轮询只负责**决定**期望态，不再直接移动窗口；1s 看门狗负责**对账**（期望态 vs `mainWindow.getBounds()` 实际值），不一致就纠正。把现在两条互相踩的脆弱链路收敛为「一个决策 + 一个执行」。
- **动画降级**：护栏一旦拒绝过任一帧，本会话内后续滑出/滑回降为瞬移（顺滑度换稳定性）。
- **主进程崩溃兜底**：安装 `process.on('uncaughtException')` 处理器，把异常写入日志文件、复位 edge 状态、**不弹模态错误框**。后台挂件弹框不可接受，这一取舍须在代码注释中写明。
- **验证补齐**：本次验证 MUST 显式覆盖这次**漏掉**的两项检查 —— 检测主进程错误框、以及在「窗口本就不该停靠」时不得把「未隐藏」误判为缺陷。

### 本次明确不做（见 `tasks.md` 第 8 组）

- 可开关的诊断日志（本次只保留异常路径的常开记录）
- 删除死代码 `edgeExpandedBoundsForSide`
- `upstream-patch-maintenance` 能力（补丁维护纪律的正式化）
- 把验证夹具做成可复用的正式脚本（本次仍为一次性脚本）
- 修复 Electron `getBounds()` 与 Win32 `GetWindowRect` 之间的 frame 偏移（仅记录）

## Capabilities

### New Capabilities

- `edge-auto-hide`: 贴边自动隐藏折叠模式的运行时行为 —— 停靠判定、隐藏几何（只挪不缩、保留细窄条）、触发区（沿边方向必须限制在窗口自身跨度内）、唤出与收起时序、持久化隔离（隐藏几何不得污染 `windowBounds`）、尊重 `reduceMotion`、非有限坐标不得进入原生 API、动画不得把状态卡死、收起决策不得以焦点为门槛。
- `main-process-resilience`: 作为后台挂件的主进程健壮性 —— 未捕获异常必须落盘记录且**不得弹模态框**、卡死状态必须能自愈、功能必须能在不重新打包的前提下被关停。

### Modified Capabilities

无。本变更不修改 `openspec/specs/` 下任何既有能力的「需求」级行为（`credential-storage-hardening`、`glm-coding-plan-monitor` 均不受影响）。

## Impact

- **被改代码**：token-monitor 的 fork（`C:\Users\29871\AppData\Local\Temp\opencode\tm-fork`，分支 `feat/edge-auto-hide`，基线 `v0.57.0`）。主要落在 `src/electron/main.js`（edge 状态机与动画）、`src/electron/edgeAutoHide.js`（死代码清理与可能的几何修正）、以及新增的验证脚本与文档。
- **交付面**：已安装应用 `C:\Users\29871\AppData\Local\Programs\Token Monitor\resources\app.asar`（需重新打包替换）；回退物 `app.asar.orig-backup`（18,753,883 B）已存在。
- **测试**：`tests/electron/edgeAutoHide.test.js`（281 行，现有）与 `tests/electron/windowBehavior.test.js`、`tests/electron/tray.test.js` 必须保持通过；纯 Node 运行，不需要 `node_modules`。
- **不影响的**：TokenHub 仓库（本变更只在其 `openspec/` 下落档）；token-monitor 的凭证存储与设置结构；现有三种窗口模式（`floating` / `normal` / `desktop`）。
- **上游风险**：token-monitor 升级会覆盖 `app.asar`，补丁须重新应用 —— 由 `upstream-patch-maintenance` 能力约束。
