## Context

**目标应用**：token-monitor（第三方 Electron 应用，MIT，v0.57.0）。我们通过「fork 里开发 → 只把改动的 JS 重新打包成 `app.asar` → 替换已安装应用里的那一个」的方式交付，因为它的 `app.asar` **未启用完整性校验**（实测 exe 中 `sha256:<64hex>` 出现 0 次、`asarIntegrity` 字符串不存在）。

**已交付的内容**：第 4 种窗口模式 `edge`（贴边自动隐藏折叠）。隐藏态**只挪位置不改尺寸**，滑出屏幕只留约 3px；光标进入窄条区域滑回。`src/electron/main.js` 相对 v0.57.0 增加约 362 行，`src/electron/edgeAutoHide.js` 新增 220 行。

**已修掉的三个缺陷**（均靠运行时探针找到，静态推理零命中）：
1. `expandEdge()` 完成回调里 `persistWindowBounds(...)` 排在 `scheduleEdgeAutoHide()` **之前** —— 前者抛错则轮询永不重装。
2. `win.on('focus')` 先 `stopEdgeAutoHideTimers()`，且只在 `hidden` 分支重装 —— 启动 `show()` 拿焦点时 `hidden=false`，轮询被永久杀死。
3. 收起判定里的 `|| mainWindow.isFocused()` 门槛 —— 该窗口长期持有焦点，导致收起计时器**从未被装上**。

**当前致命缺陷**：动画补间 `mainWindow.setPosition(x, y, false)`（`src/electron/main.js:2304`，位于 `animateWindowPosition` 的 `tick()` 内）收到非有限 `y`，抛 `TypeError: Error processing argument at index 1, conversion failure from`，Electron 弹模态框。**关键参数特征**：报错在 index **1**（`y`）而非 index 0（`x`）⇒ 说明 `eased` 与 `duration` 正常、`x` 是合法数，**只有 y 通道非有限** —— 出问题的对象「有 x 但 y 不合法」。已核实：`main.js` 引用的 8 个 `edgeAutoHideApi.*` 成员**全部有导出**；`expandedBounds` 的 5 个赋值点全部溯源到完整对象（`mainWindow.getBounds()` / settings JSON / 传入值）。**根因尚未定位到具体字段**，候选是 `edgeHiddenBounds` 的 `top` 分支 `y: Number(area.y) + EDGE_VISIBLE_PX - height` 中某个输入为 `undefined`，或 `display` 对象异常。

**连带效应（解释了全部现象）**：`animating = true` 在补间开始前乐观置位，只在 `tick()` 的成功分支清除 ⇒ **任何异常都把 `animating` 永久卡在 `true`** ⇒ 轮询首行 `if (… animating) return;` 永远早退 ⇒ 窗口永不收起。实测：第 1 轮循环通过，第 2、3 轮全部卡死。

**验证方法学教训**：本次决定性证据全部来自「让程序自己打印决策过程」的手法（读 Win32 窗口矩形 + 程序化移动光标 + 写决策日志）。相反，我的静态推理连续误判三次（含一次把 Electron 常驻的无标题空 `#32770` 对话框当成「应用仍然坏着」、一次用错误的 hwnd 比较得出「焦点不是元凶」、一次把「窗口从未移动过」的假通过当成好消息）。

## Goals / Non-Goals

**Goals:**
- 让「隐藏 → 唤出 → 收起」循环**可重复地**正确，连续多轮不失效。
- 从结构上消灭「布尔标志卡死导致功能永久瘫痪」这一整类失效（而非只补当前这一处）。
- 未捕获异常**不得**以模态错误框的形式暴露给用户；后台挂件必须静默记录并尽量自愈。
- 任何非法坐标**在进入 Electron 原生 API 之前**被拦住，并留下足以自证根因的现场数据。
- 保留用户明确要的观感：窗口自身的细窄条滑出/滑回。
- 把这次的验证手法固化成可重跑的脚本，并把这次**漏掉**的检查补上。

**Non-Goals:**
- **不改上游 token-monitor 的代码库、不提 PR**（用户此前已决定不走上游路线）。
- **不改变隐藏/唤出的机制**（仍用「只挪不缩」；不改为缩放或重建窗口，见 D4）。
- **不追求精确修复 frame 偏移的几何差异**：实测 Electron `getBounds()` 与 Win32 `GetWindowRect` 存在约（-6, -4）偏移、宽高外扩约（+12, +6），导致实际露出约 9px 而非 3px、触发带实际相当于 `y ∈ [-4, 8]`。此差异可接受，只做记录，不为此重写几何层。
- 不处理多显示器下 `winfo`/`screen` 只在主屏判定的边缘情形（现有代码已用 `displayForBounds` 实时取屏，够用）。
- 不动 TokenHub 仓库的代码（本变更只在其中落档）。

## 本次范围裁剪（中档）

用户在方案评审时指出「做一个贴边隐藏不该动这么多东西」，并核对了本设计的三个体量来源：① 功能本身（1 个纯函数模块 + 4 处行为点）；② 宿主应用把「显示方式」枚举硬编码在 5 处（约 26 行，属**面广活不多**）；③ **编排者自己的选择**（手写 60fps 补间、改用"挪出屏幕"、以及一堆流程保险）。

据此确定本变更为**中档**：

**在范围内**：D1（坐标护栏）、D2（动画状态改截止时刻）、D3（声明式目标态 + 单一对账执行者）、D4（保留只挪不缩）、D5 的**降级部分**（护栏拒绝过即本会话转瞬移）、D6（崩溃兜底不弹框）。

**推迟到后续变更**：D7（诊断开关）、D8（删死代码）、D9 的**正式化部分**（可复用夹具脚本）。原因：D1 让崩溃无害、D2 让卡死不可能，二者已足以消除本次的失效模式；D7/D8 是工程整洁度，不影响可用性。

**已从本变更移除的能力**：原计划的 `upstream-patch-maintenance`（补丁维护纪律的正式化：基线留档、补丁可重放流程、三层回退的文档化）。其**最小必要部分**保留为一个任务（把补丁从系统临时目录另存到持久位置），因为 fork 位于 `%TEMP%`，丢失补丁的代价高于留档成本。

**为什么该裁剪是安全的**：第 1 轮循环本就通过（隐藏→唤出→收起全对），说明状态机本身是通的；第 2、3 轮失败的**唯一已知原因**是补间崩溃 → `animating` 卡死 → 轮询空转。D1 让崩溃不再发生，D2 让即使发生也不卡死。中档的改动是完整方案的**子集**，不会白做 —— 若 D1+D2 之后仍不绿，再升到完整方案。

## Decisions

### D1. 坐标护栏：所有几何写入统一出口，非法即拒绝

新增单一出口函数（例如 `setEdgeWindowPosition(x, y)`），内部先做 `Number.isFinite(x) && Number.isFinite(y)` 校验，非法则**不调用** Electron API，改为把 `from`/`to` 原样写入诊断日志并返回 `false`。`animateWindowPosition` 的补间帧与 `edgeReducedMotion()` 的瞬移分支都走它。

**为什么不是只包一层 try/catch**：异常抛出会让补间**半途中断**，窗口停在随机中间位置（比不动更糟）；且 Electron 会把未捕获异常升级为模态框。护栏把「崩溃」降级为「跳过一帧并留证据」。

**备选（已否决）**：只在最外层 try/catch（治不了半途中断）；对坐标做 `Number(x) || 0` 之类的静默兜底（会把错误位置默默写进去，比拒绝更危险）。

### D2. `animating` 布尔 → `animatingUntil` 截止时刻

`edgeAutoHideState.animatingUntil: number`（epoch ms）；判定改为 `Date.now() < edgeAutoHideState.animatingUntil`。动画开始置 `Date.now() + duration`，结束置 `0`。

**为什么**：布尔标志是「单点写入、多点依赖」，任何跳过清理的路径都会让它永久卡死 —— 这正是本次瘫痪的机制。截止时刻**天然自愈**：即使某个异常路径完全没跑清理，最多一个动画时长后判定自动转假。这是本设计里**最重要的一条**，它一类消灭了本次的失效模式。

**备选（已否决）**：布尔 + `try/finally`（比现在好，但进程级崩溃或提前 return 路径仍可能绕过；而截止时刻天然免疫）。

### D3. 声明式目标态 + 单一执行者（收敛两条链路）

引入 `edgeAutoHideState.desired: 'hidden' | 'revealed' | null`：

```
100ms 光标轮询  ──只做一件事──▶  决定 desired（依据触发区命中 / 光标是否离开）
                                        │
1s 对账看门狗  ──唯一的执行者──▶  比较 desired 与 mainWindow.getBounds()
                                  不一致 ⇒ 启动一次受护栏保护的移动
                                  一致 ⇒ 什么都不做
```

**为什么**：现在的失效是「两条互相踩的链路」（轮询 + `setTimeout` 收起计时器，两者都被多个路径 `stopEdgeAutoHideTimers()` 清掉）。把「决定」与「执行」分开后，执行者只有一个、且幂等；任何一次中断都只是「下一轮对账时重新发现不一致并纠正」，不构成永久失效。

**代价**：收起延迟由「200ms 精确计时」变为「最坏约 1.2s」。**这是有意的取舍** —— 用约 1 秒的延迟换掉一整类永久失效，对后台挂件是划算的。若体验不可接受，可把对账周期降到 250ms（代价是空闲时每秒 4 次 `getBounds()`，可忽略）。

**备选（已否决）**：继续给两条链路补重装调用（这正是过去三轮的做法，每次都只修一处、又冒出下一处）。

### D4. 保留「只挪不缩」的机制，不改为缩放/重建窗口

**备选 A（用户曾提及的观感来源）**：窗口滑出屏幕只留细窄条 —— 采纳。
**备选 B（已否决）**：照抄它自己 `floatingBubble` 的 `replaceMainWindow(collapsedBounds)` + `floatingBubbleWindowChrome`（`hasShadow:false` / `thickFrame:false`）。否决理由：① 要绕过 `WINDOW_LIMITS.minWidth = 240`；② 极小窗口的 DWM 圆角/阴影渲染问题会回来；③ **观感会变**（收起后是「贴边把手/图标」，不是用户要的「窗口自身的细窄条」）。它更「正统」，但牺牲的正是用户点单的那个效果。

### D5. 动画降级策略：可自动放弃动画

保留 180ms 三次缓出补间，但加降级开关：**一旦护栏拒绝过任一帧（说明动画期几何不可信），本会话内永久降级为瞬移**，并写一条日志。理由是「顺滑度换稳定性」对一个后台挂件成立。

**备选（已否决）**：直接删掉动画（在还没弄清 `y` 根因前就把可观测面砍掉，不利于定位）；或保持动画无条件运行（本次崩溃的来源就是它）。

### D6. 主进程崩溃兜底：记录而不弹框

安装 `process.on('uncaughtException')`：把异常（含 stack）追加到 `%APPDATA%\Token Monitor\edge-errors.log`；若异常发生在 edge 功能内，则复位 edge 状态（`animatingUntil = 0`、`desired` 保持、清计时器），使下一轮对账能自愈；**不 re-throw**（re-throw 会再次触发 Electron 的模态框）。

**取舍必须写明**：吞掉未捕获异常有掩盖真实缺陷的风险。可接受的原因是：① 这是一个常驻后台挂件，模态框会打断用户且无法自愈；② 异常**并非静默丢失** —— 它被持久化到文件；③ 已有的 `tokenhub`/`token-monitor` 日志体系可人工查阅。

**备选（已否决）**：保持 Electron 默认（弹框）—— 一个后台挂件弹错误框不可接受；或只 `console.error`（打包应用无控制台，等于丢弃）。

### D7. 诊断必须可按开关启用，而不是永驻交付物

新增设置项（例如 `settings.json` 的 `edgeAutoHideDebug`，或环境变量 `TM_EDGE_DEBUG=1`），默认关闭。开启时输出本次调查用的决策追踪：每个轮询 tick 的 `desired`/`hidden`/`band`/`bounds`、对账结果、护栏拒绝时的 `from`/`to` 全量。

**为什么**：本次三个缺陷**全部**由探针发现、静态推理零命中；但探针不该留在交付版本里（我上一轮反而先把它删了、后又不得不重加）。开关是两者的正解。护栏拒绝日志（D1）是**唯一常开**的诊断输出 —— 因为它只在异常路径触发，平时零成本。

### D8. 删除死代码 `edgeExpandedBoundsForSide`

该函数导出自 `src/electron/edgeAutoHide.js` 但**无任何调用点**，且内部把 `x` 硬编码为 `0`（多显示器下若启用会算错）。处理：先确认 `tests/electron/edgeAutoHide.test.js` 未把它当作公开 API 断言；若未断言则删除函数与其测试，若已断言则改为返回 `area.x` 的正当实现。

### D9. 验证夹具脚本化，并补上这次漏掉的检查

固化脚本（PowerShell + 内嵌 Win32 调用，或 Python + ctypes），必须包含：
- 识别主窗口用「尺寸最接近 `windowBounds`」并**排除 `#32770` 对话框**（本次踩过：把 Electron 内部空对话框当成主窗口）。
- **显式检测主进程错误框**：断言全程不存在标题为 `Error`、类为 `#32770` 的可见窗口（本次漏检，导致崩溃与「不收起」被当成同一现象的两面而没有第一时间分离）。
- **前置条件断言**：测试前先把 `windowBounds` 放到目标边；若窗口不在任何边附近，则「未隐藏」是**正确行为**，不得判为缺陷（本次踩过）。
- 连续 **≥5 轮**循环断言，覆盖原缺陷（第 2 轮起失效）。
- 触发区沿边约束的反例：光标在同一屏幕边缘、沿边方向远离窗口跨度时**必须不唤出**。
- 持久化断言：`windowBounds` 不得含隐藏坐标；`edgeAutoHideBounds` 应存在且结构完整。

## Risks / Trade-offs

- **[护栏把每帧都拒了 ⇒ 完全没有动画]** → D5 的降级策略（转瞬移）；且护栏会记录被拒的 `from`/`to`，使根因可立即定位。
- **[`uncaughtException` 吞异常掩盖真实缺陷]** → 持久化到独立日志文件；在代码注释与本设计里写明取舍；不 re-throw 的前提是「必须留盘」。
- **[对账周期拉长到 1s ⇒ 收起体感变慢]** → 明确接受（换稳定性）；如需可降到 250ms。
- **[`y` 根因仍未定位]** → 本设计**不依赖**根因即可使功能健壮（D1+D2+D3 各自独立成立）；护栏日志会在下一次发生时自证。
- **[上游升级覆盖 `app.asar`]** → 由 `upstream-patch-maintenance` 能力约束（记基线 tag、补丁可重新应用、保留备份）。
- **[`uncaughtException` 处理器无法覆盖渲染进程崩溃]** → 本变更只针对主进程；渲染进程侧不在范围内（记录为已知边界）。
- **[验证脚本是 Windows 专有]** → 明确标注仅 Windows；token-monitor 虽跨平台，但我们只交付 Windows。
- **[改动仍落在第三方应用的临时 fork 里（`%TEMP%`），可能被清理]** → fork 的 git 分支持有补丁；需在收尾任务里把补丁与脚本另存到持久位置（见 tasks 收尾组）。

## Migration Plan

1. **前置**：确认 fork 在 `feat/edge-auto-hide` 分支且工作树干净；确认 `app.asar.orig-backup`（18,753,883 B）存在。
2. **实现**：按 tasks 顺序在 fork 里落地 D1–D8。
3. **测试**：`node --check` 所有改动文件；`node --test tests/electron/edgeAutoHide.test.js tests/electron/windowBehavior.test.js tests/electron/tray.test.js` 全绿（纯 Node，无需 `node_modules`）。
4. **交付**：把改动文件覆盖进 `asar-extracted` → `npx @electron/asar pack` → 覆盖 `resources\app.asar`。**替换前再确认一次备份存在**。
5. **验证**：跑 D9 的脚本，要求连续 ≥5 轮循环全绿 **且** 全程无错误框 **且** 持久化断言通过。
6. **提交与留档**：在 fork 里提交；把补丁/脚本另存到持久位置；更新本变更的 tasks。

**回退策略（三层，按代价递增）**：
1. **零风险关掉功能**：把 `settings.json` 的 `windowBehavior` 改回 `floating`（或任意非 `edge` 值）。功能即停用，窗口回到普通浮动；**不需要动 `app.asar`**。
2. **回到官方构建**：用 `resources\app.asar.orig-backup` 覆盖 `app.asar` 并重启应用。这也顺手验证了「即使 `windowBehavior` 仍是 `edge` 也不会报错」——原版对未知模式值会回退为 `floating`。
3. **回到本次修复前的补丁版本**：fork 里的提交 `9da4de1` 即本次修复前的状态，可 `git checkout` 后重新打包。

## Open Questions

1. **`y` 到底来自哪个字段？** 不在本变更的完成条件内（D1 已使其无害），但护栏日志第一次触发时应立即回读并记录答案。
2. **对账周期取 1s 还是 250ms？** 默认 1s（更省），若体感太慢再调。
3. **是否要在设置界面把 `edge` 模式暴露得更显眼？** 目前已加进「显示方式」下拉与托盘菜单；是否需要额外说明文案（帮助文档第 7 步之外）待定。
4. **是否需要把 `floatingBubble` 与 `edge` 的互斥做成用户可见提示？** 目前是代码层互斥（`canUseFloatingBubble` 排除 `edge`），用户无感知。
5. **多显示器场景是否需要真正实现挂载到副屏边缘？** 现状用 `displayForBounds` 实时取屏已能工作，但未在副屏实测。
