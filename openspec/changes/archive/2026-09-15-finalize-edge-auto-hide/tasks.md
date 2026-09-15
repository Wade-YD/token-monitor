# Tasks: finalize-edge-auto-hide

## 1. 准备

- [x] 1.1 实测 Win32 frame 外扩（左/右/底 6px、顶 0），确认只有 top/left/right 停靠需补偿
- [x] 1.2 核对永久 fork（`1-project\token-monitor`，`feat/edge-auto-hide` @ `6488c3b`）与启动拒收根因（focus→expandEdge）

## 2. edgeAutoHide.js

- [x] 2.1 新增 `EDGE_WIN32_FRAME_OVERHANG_PX = 6` 并导出；`edgeHiddenBounds` 在 win32 对 top/left/right 补偿
- [x] 2.2 删除死代码 `edgeExpandedBoundsForSide` 及其导出

## 3. main.js

- [x] 3.1 `edgeAutoHideState` 增加 `geometryReady`；首次 `show` 置位；`setEdgeWindowPosition` 就绪前跳过且不降级
- [x] 3.2 `win.on('focus')` 移除 `expandEdge()`，保留轮询重装
- [x] 3.3 启动恢复路径改为只挪位置（保留创建宽高）
- [x] 3.4 新增 `syncEdgeDockGeometry()` 挂 `resized`（仅隐藏态对账 + settings 同步）
- [x] 3.5 新增 `edgeDebugEnabled()`/`edgeDebug()`（settings 键 + 环境变量），埋 ~9 处决策日志

## 4. 测试

- [x] 4.1 更新 strip 常规断言（win32 补偿 / darwin 不变）+ 新增补偿数值用例
- [x] 4.2 新增源码契约：focus 块无 expandEdge、geometryReady 门控、resize 对账、恢复路径不整包 setBounds、死代码已删
- [x] 4.3 `node --test` 三文件全绿 + `node --check` 全部通过

## 5. 交付

- [x] 5.1 从 orig-backup 重建 asar 树 → 覆盖改动文件 → pack → 替换（先退出应用，确认备份存在）
- [x] 5.2 运行时验证：启动无新拒收、启动即隐藏且窄条 ≈3px（Win32 口径）、5 轮唤出/收起循环、resize 自愈、诊断开关生效
- [x] 5.3 提交 fork；重新导出补丁与 README 到 `token-monitor-patch\`

## 6. 收尾

- [x] 6.1 `openspec validate --strict` 通过后归档变更、同步主 specs、提交 TokenHub
- [x] 6.2 更新 `HANDOFF-zcode.md`（§3/§4 状态）
