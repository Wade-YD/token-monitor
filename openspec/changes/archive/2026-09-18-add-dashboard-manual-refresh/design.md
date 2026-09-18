## Context

仪表盘是独立 BrowserWindow（`dashboardWindow`），数据来自主进程内存快照：采集器按 `collectionIntervalMs`（默认 5 分钟）定时产出 summary → `lastCollectedDevice` 更新 → stats 推送链在 history revision 变化时向仪表盘发 `dashboard:historyChanged`（`main.js:4778`），仪表盘收到后调 `refresh()` 重拉 `dashboard:getHistory`（本地模式下只是把 `lastCollectedDevice` 重新投影，`historySource.js:103`）。

刷新按钮现状：`dashboard.js:745` 直接 `addEventListener('click', refresh)`——它不触发采集、无反馈态。两次采集之间点击 = 用相同快照重渲染相同画面。

已核实的关键事实（决定本方案可行性）：
- 采集器暴露手动入口：`deviceRuntimeHandle.tick(reason, opts)`（`deviceRuntime.js:200`）→ `runTick`（`collector.js:3435`），**无节流**：manual reason 只进诊断码（`tickReasonCode`），不带 `todayOnly` 时 scope 为 `full`（完整扫描而非 watch 增量）；并发 tick 自动合并（`tickPending`/`pendingWaiters`）。
- `deviceRuntimeHandle` 是 main.js 模块级 `let`（`main.js:3430`），三种采集模式（sync/host/local，4389/4437/4976 处赋值）都用同一变量，IPC handler 调用时取现值即可。
- 采集完成链路自动回流：`performTick` → `onUpdate` → `deviceState.updateUsage` → `sink.enqueue` → `lastCollectedDevice` 更新 → stats 推送 → revision 变化 → `dashboard:historyChanged`。
- 渲染进程脚本的可测模式：UMD 风格暴露全局 + `module.exports`（参照 `sessionRows.js`），dashboard.html 按需 `<script>` 引入。

## Goals / Non-Goals

**Goals:**
- 点击 ↻ = 立即完整采集一次，采集结束后仪表盘展示最新数据（走既有拉取/推送双通道，择一到达即可）。
- 按钮反馈态：旋转动画 + 禁用，结束/超时恢复；进行中重复点击无效。
- 渲染进程有界等待（超时上限），超时不清空现有数据。
- 全部新逻辑有单元测试（抽取纯逻辑模块，符合仓库测试惯例）。

**Non-Goals:**
- 不改自动采集周期、不改 `dashboard:historyChanged` 推送逻辑与 `refreshRunning/refreshQueued` 去抖语义。
- 不做"部分/增量刷新"或骨架屏；不动按钮位置、尺寸与主题。
- 不为按钮新增 i18n 键（上游按钮 title 为硬编码 "Refresh"，保持一致）。
- 不处理 hub/host 模式的差异化语义（`tick` 在这些模式下同样生效，行为一致，无需分支）。

## Decisions

### D1：强制采集走 `deviceRuntimeHandle.tick('manual')`，而非重扫磁盘或重启采集器
- 理由：tick 是采集器现成的公开入口，内部含并发合并与 stop 守卫；重启运行时（`reconfigureUsage`）为一次刷新重建整个 collector，代价和风险都不可接受；渲染层直接让主进程重读快照（现状）已被证明"没反应"。
- 替代方案否决：让渲染进程等待下一个 `dashboard:historyChanged` 再解析按钮（无法保证时限）。
- IPC 形态：`ipcMain.handle('dashboard:forceRefresh')` → `{ ok, collected?, reason? }`，handler 内 `deviceRuntimeHandle?.tick('manual')` 的调用点读模块级现值；运行时不存在/已停止返回 `{ ok:false }`，不 throw（spec 场景 2）。preload 暴露 `forceDashboardRefresh()`。

### D2：按钮反馈态放在渲染进程，控制器抽成可测纯模块
- 新文件 `src/electron/renderer/manualRefresh.js`（UMD，参照 `sessionRows.js`）：`createManualRefreshController({ forceRefresh, apply, timeoutMs })` 返回 `{ run(), isBusy() }`。`run()` = busy 守卫 → 通知 apply(true)（挂反馈态）→ `Promise.race([forceRefresh(), delay(timeoutMs)])` → `await apply(false)` 前先执行一次数据重拉回调 → 复位。
- 超时上限取 **15s**（与主进程 hub fetch 的 `timeoutMs: 15_000` 惯例一致，覆盖最慢的完整扫描）。
- dashboard.js 改动最小化：按钮 handler 从 `refresh` 换成 `manualRefresh.run()`；反馈态 apply 回调里做 `refreshBtn.classList.toggle('refreshing')`；数据重拉复用现有 `refresh()`（其内部 `refreshRunning` 去抖天然承接推送并发）。

### D3：反馈动画用 CSS 类 + `prefers-reduced-motion` 守卫
- `dashboard.css` 新增 `#refreshBtn.refreshing`（`pointer-events:none` + 图标 `rotate` 无限动画）；动画包在 `@media (prefers-reduced-motion: no-preference)` 内，尊重仪表盘已有的动效偏好机制（`state.reduceMotion` 只影响图表，按钮动画用媒体查询兜底即可，两者不冲突）。
- 不引入加载遮罩/骨架屏：避免视觉噪音，也避免与既有 render 调度器（`statsRenderScheduler`）竞争。

### D4：测试布局
- `tests/electron/manualRefresh.test.js`：busy 去抖、成功路径、超时路径、forceRefresh reject、apply 顺序（fake timers）。
- 主进程 handler 本体保持 3 行薄壳不单测（仓库惯例：main.js IPC 不直接测）；tick 链路依赖的真实函数已有上游测试覆盖。

## Risks / Trade-offs

- [手动 full scan 的瞬时开销（磁盘扫描全客户端）] → 用户主动点击才触发，频率天然受按钮去抖 + busy 守卫限制；与上游 `refreshClient` 的手动刷新语义一致，不改采集器内部。
- [采集期间推送先到导致双重渲染] → 既有 `refreshQueued` 合并；渲染幂等（同数据重渲染输出一致），无用户可见抖动。
- [`tick` 在 external agent 活跃时 sink 静默丢弃 summary] → 上游既有语义（所有采集同路），按钮仍会正常转圈→恢复并重拉当前快照，不报错。
- [hub/host 模式下 `tick` 触发的推送走各自 sink，回流时序略不同] → 渲染层在 IPC 返回后无论推送是否已到都会主动 `refresh()` 一次，双通道保证最终一致。
- [15s 内未完成的极端慢扫描] → 按钮按超时恢复可再次点击；采集完成后的推送仍会带来新数据，不丢失。

## Migration Plan

纯增量改动，无数据迁移。交付走既定流程：源码改动 → 单测 → 补丁重放验证（`git apply --check --3way`，绝对路径）→ asar 重打包（保留 `.unpacked` 孪生目录）→ 替换安装目录 app.asar（先退应用）→ `verify_v0580.py` 运行时验证。回滚 = 还原 `app.asar.v0580-official.bak` 或重打不含本提交的 asar。

## Open Questions

无——方案 A 已获用户确认，实现细节均已核实到具体行号。
