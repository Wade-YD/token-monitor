## 1. 渲染进程控制器（纯逻辑模块）

- [x] 1.1 新建 `src/electron/renderer/manualRefresh.js`（UMD 风格，参照 sessionRows.js）：`createManualRefreshController({ forceRefresh, apply, pull, timeoutMs=15000 })` 返回 `{ run(), isBusy() }`；`run()` 实现 busy 守卫 → `apply(true)` → `Promise.race([forceRefresh(), delay(timeoutMs)])`（reject 吞掉）→ `await pull()` → `apply(false)` 复位
- [x] 1.2 新建 `tests/electron/manualRefresh.test.js`：busy 去抖（进行中 run 返回 false）、成功路径 apply 顺序 true→false、超时路径仍恢复并 pull、forceRefresh reject 不挂起

## 2. 主进程 IPC 与 preload

- [x] 2.1 `src/electron/main.js`：在 `dashboard:getHistory` handler 旁（~L8919）新增 `ipcMain.handle('dashboard:forceRefresh')`——`deviceRuntimeHandle` 缺失或非函数返回 `{ ok:false, reason:'unavailable' }`；否则 `await deviceRuntimeHandle.tick('manual')` 返回 `{ ok:true, collected }`，异常捕获返回 `{ ok:false, reason }`，不 throw
- [x] 2.2 `src/electron/preload.js`：dashboard 分支暴露 `forceDashboardRefresh: () => ipcRenderer.invoke('dashboard:forceRefresh')`

## 3. 仪表盘接线与反馈样式

- [x] 3.1 `src/electron/renderer/dashboard.html`：在 `dashboard.js` 之前引入 `<script src="manualRefresh.js"></script>`
- [x] 3.2 `src/electron/renderer/dashboard.js`：创建 `manualRefreshController`（apply = 切换 `els.refreshBtn` 的 `refreshing` 类；pull = `refresh()`）；`els.refreshBtn` 点击 handler 由 `refresh` 改为 `() => manualRefreshController.run()`
- [x] 3.3 `src/electron/renderer/dashboard.css`：新增 `#refreshBtn.refreshing`（`pointer-events:none`）+ 图标旋转动画，动画包在 `@media (prefers-reduced-motion: no-preference)` 内

## 4. 测试与验证

- [x] 4.1 `npm test`（或仓库既有测试命令）全绿，含新增 manualRefresh 用例
- [x] 4.2 `deliver_finalize.py` 的 FILES 清单加入 `manualRefresh.js`（如该脚本仍作为交付载体）；补丁重放验证：checkout 干净 v0.58.0 tag worktree，`git apply --check --3way` 用补丁文件**绝对路径**回放成功
- [x] 4.3 重打 asar（保留 `.unpacked` 孪生目录），退应用后替换安装目录 `app.asar`，重启无错误日志
- [ ] 4.4 运行时手测：打开仪表盘点 ↻ → 按钮转圈且连点无效 → 结束后恢复；有新会话数据时点击后数字立即更新；机器空闲时可跑 `verify_v0580.py` 回归吸附行为
- [x] 4.5 fork 仓库提交（`git status` 逐项核对，禁 `add -A` 盲加），更新 `token-monitor-patch/README.txt`（提交数/文件数/补丁大小）与 workspace 提交
