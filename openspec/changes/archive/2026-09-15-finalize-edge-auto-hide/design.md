# Design: finalize-edge-auto-hide

## Context

上一变更（`harden-edge-auto-hide`）交付了贴边自动隐藏并实测通过，但遗留 6 项。本次收口前三项用户可感知问题。

**关键实测数据**（2026-09-15，本机 Win11 26200，单屏 1536x960）：
窗口停靠 `top`、Electron hiddenBounds `{y:-480, h:483}` 时，Win32 `GetWindowRect` =
`{top:-480, bottom:9}` —— 即左/右/底各外扩 **6px**、顶 **0px**。露出 9px = 设计 3px + 底部外扩 6px。

**启动拒收根因修正**：上一轮归因"窗口原生对象未就绪"。重读启动序列后修正：
被拒的 `setPosition(x, 0)`（y=0 = expanded 顶边）来自 `win.on('focus')` → `expandEdge()`——
窗口 show 后自动聚焦，对刚恢复隐藏态的窗口立即弹出；该调用发生在 show 之后（原生对象已存在），
"未就绪"只是并存的次要风险。两个成因本次都堵：移除 focus 弹出 + 就绪门控兜底。

## Goals / Non-Goals

- Goals: 启动零拒收、窄条 ≈3px、重启不回退尺寸、隐藏期 resize 自愈、诊断可开关。
- Non-Goals: tray/UI 诊断开关、`upstream-patch-maintenance` 正式化、渲染层 UI 改动。

## Decisions

### D1 frame 补偿用实测常量，不做运行时测量
`EDGE_WIN32_FRAME_OVERHANG_PX = 6`，仅在 `platform === 'win32'` 生效，按边应用：
`top`→隐藏 y 再上移 6（底部外扩朝屏内）；`left`→x 再左移 6；`right`→x 再右移 6；
`bottom`→不补偿（顶外扩为 0，且露出的顶边由屏幕下边自身裁切，本就精确）。
**否决**运行时测量（`GetWindowRect`/`DwmGetWindowAttribute` 需要 FFI/原生模块，Electron 无此 API）。
**否决**调小 `EDGE_VISIBLE_PX`（那会让 darwin/macOS 侧跟着变窄，且 3px 是规格值）。

### D2 移除 focus→expandEdge，唤出唯一入口 = 光标触发区
focus 弹出有两个害处：启动自动聚焦 → 立即弹出+拒收（本次根因）；无光标参与的状态翻转
（规格语义里唤出本来就该由触发区决定）。点窄条本身即命中触发区（3px 条在 12px 垂直容差内），
不损失任何唤出路径。**否决**"focus 延迟到 ready 后再 expand"——保留了一个光标不该触发的弹出路径。

### D3 `geometryReady` 门控作为纵深防御
`edgeAutoHideState.geometryReady` 首次 `show` 置位；`setEdgeWindowPosition` 在其前直接 return false、
**不**置 `guardTripped`（未就绪不是错误，不该陪葬整场动画）。1s 看门狗 + 轮询会在就绪后自然对账，
被跳过的写入自动收敛。启动恢复路径的 `setBounds`（创建期，实测从未失败）保留以维持规格的
"直接停在隐藏位置且不播放动画"。

### D4 恢复路径只挪位置，保留创建尺寸
`applyWindowSettings` 恢复隐藏态时：`setBounds({x, y, width: 当前宽, height: 当前高})`。
创建尺寸来自 `windowBounds`（展开态持久化，含用户最后 resize），saved.hiddenBounds 可能更旧。
**否决**整包 `setBounds(saved.hiddenBounds)`——那是"重启尺寸回退"的直接原因。

### D5 resize 对账只在隐藏态执行
`syncEdgeDockGeometry()` 挂 `resized`：仅当 `hidden && side` 时重算 `expanded = edgeSnapToBounds(当前)`、
`hidden = edgeHiddenBounds(expanded)`，同步 state + `settings.edgeAutoHideBounds` + 直接挪到新隐藏位。
**否决**展开态也重算：展开时用户可能正拖着边框（y 在阈值内但未贴死），此时强行 flush 会和手上的
拖拽打架；展开态的 settings 陈旧由 D4（恢复只挪位置）+ collapseEdge 每次覆写共同兜住。

### D6 诊断开关 = settings 键 + 环境变量，不进 UI
`edgeDebugEnabled()` = `settings.edgeAutoHideDebug === true || env TOKEN_MONITOR_EDGE_DEBUG=1`；
命中时经 `edgeDebug()` 写 `%TEMP%\token-monitor-edge-debug.log`（与错误日志分文件，错误日志语义不变）。
埋点 ~9 处：轮询命中/武装、对账、collapse/expand 进出、resize 对账、启动恢复、护栏上下文。
**否决**tray 菜单开关（5 语言 i18n + tray 测试成本，且该功能是排障用，非用户功能）。

### D7 瞬态原生拒收按「连续次数」降级，尾帧直接吸附（运行时实测后追加）
运行时验证捕获一类新拒收：补间动画的**尾帧**（t≈0.98，坐标已算到目标值）被原生层间歇性拒收
（同一构建其他轮次的同位置调用全部成功；启动类拒收已被 D3 门控消灭）。据此两条：
- 补间在 `remaining < 1px` 或 `t >= 1` 时**直接吸附到目标**，不再产生亚像素尾帧——既消除暴露面，
  也修掉「拒收导致动画停在差几像素处」的观感问题。
- 有限坐标的原生拒收按 `nativeRejectStreak` 计数，**连续 ≥3 次才置 `guardTripped`**（成功即清零）；
  非有限坐标仍然一次立即降级（那是代码错误，不能信任后续几何）。
**否决**「一次拒收即全场降级」（上一版策略）：实测证明该类拒收是瞬态的，一次就赔上全场动画代价过高。

## Risks / Trade-offs

- 窄条变 3px 后更难点中 → 触发区垂直容差 12px 不变，命中区域仍是边缘 12px 带，实际可点面积不变。
- 常量 6px 在其他 Windows 版本可能不同 → 只影响窄条宽度 ±几 px，不影响功能；留 settings 覆盖可后续加。
- focus 移除后"点击任务栏图标唤出"类路径消失 → 该窗口 skipTaskbar，本无此路径。
- `geometryReady` 门控吞掉启动期合法移动 → 看门狗 1s 内对账，且启动恢复路径不经守卫（setBounds 直写）。

## Migration Plan

无数据迁移。`settings.edgeAutoHideBounds` 结构不变。已安装 asar 用同一管道重打包替换；
三层回退不变（模式切回 floating / orig-backup 覆盖 / git 回退）。

## Open Questions

- 无（范围已在 proposal 收敛）。
