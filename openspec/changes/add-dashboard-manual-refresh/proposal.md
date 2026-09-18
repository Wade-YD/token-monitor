## Why

仪表盘右上角的 ↻ 刷新按钮"点了没反应"：本地模式下它只把主进程内存里最近一次采集快照（`lastCollectedDevice`）重新投影渲染，既不触发新采集也不重扫磁盘；采集默认 5 分钟一轮，两次采集之间点击的结果与当前画面像素级一致，且按钮没有任何视觉反馈（无转圈/禁用态）。用户感知为按钮失灵。

## What Changes

- 仪表盘 ↻ 点击后通过新 IPC 请求主进程**立即执行一次 usage 采集**（`deviceRuntimeHandle.tick('manual')`，采集器已有现成手动入口），新数据经既有 `stats:push` → `dashboard:historyChanged` 推送链自动回流，仪表盘随即展示最新数据。
- 点击期间按钮进入**转圈反馈态**（图标旋转 + 短暂禁用），采集完成或超时后恢复，消除"静默空转"的感知。
- 保护性约束：tick 请求仅在采集运行时存在且未停止时生效；点击做并发去抖（进行中忽略重复点击）；等待有上限超时，超时后按钮恢复并可再次点击，界面数据保持最后已知良好状态。
- 不改变自动采集周期、不改变既有推送刷新链路、不改动 ↻ 按钮位置与样式主题。

## Capabilities

### New Capabilities
- `dashboard-manual-refresh`: 仪表盘手动刷新能力——点击刷新按钮触发主进程即时采集、按钮反馈态、并发去抖与超时恢复的端到端行为。

### Modified Capabilities

（无——现有 spec 均不覆盖仪表盘刷新行为，本次不修改任何既有能力的需求。）

## Impact

- `src/electron/main.js`：新增 IPC handler（如 `dashboard:forceRefresh`），调用 `deviceRuntimeHandle?.tick('manual')` 并回传结果/超时；不触碰采集配置与推送逻辑本身。
- `src/electron/preload.js`：暴露 `forceDashboardRefresh()`。
- `src/electron/renderer/dashboard.js`：`refresh()` 点击路径改为"转圈 + 请求即时采集 + 拉取历史"；与既有 `refreshRunning/refreshQueued` 去抖机制衔接。
- `src/electron/renderer/styles.css`：按钮 spin 动画与禁用态样式。
- `src/electron/renderer/i18n.js`：如需无障碍标签，新增 5 语言文案键。
- 测试：主进程 IPC/tick 调度与去抖超时逻辑的单元测试；交付流程照旧（补丁重放验证 → asar 重打包 → 替换安装目录 → 运行时验证）。
