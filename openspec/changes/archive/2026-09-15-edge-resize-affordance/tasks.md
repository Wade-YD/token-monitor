# Tasks: edge-resize-affordance

## 1. 代码

- [x] 1.1 `edgeAutoHide.js`：`EDGE_INTERACTION_MARGIN_PX = 10` 常量 + 导出；`edgeCursorInExpandedBounds` 加 `margin` 参数（默认 0，非有限按 0）
- [x] 1.2 `main.js`：`lastResizeAt` 状态 + `resize`/`resized` 刷新 + `EDGE_RESIZE_GRACE_MS`/`edgeResizeGraceActive()`
- [x] 1.3 `main.js`：轮询展开态保持测试带边距；宽限期内不武装收起；计时器到点否决翻转

## 2. 测试

- [x] 2.1 纯函数：margin 内/外判定；默认 0 行为不变（既有用例仍绿）
- [x] 2.2 源码契约：轮询带 `EDGE_INTERACTION_MARGIN_PX`；隐藏态触发区不带边距；`lastResizeAt` 在两个事件里刷新；计时器否决存在

## 3. 交付与验证

- [x] 3.1 `node --test` 全绿 + `node --check`
- [x] 3.2 打包替换 asar；运行时复现验证：唤出后光标贴底边框 1.5s 不收起（旧行为 ~400ms 即收）、连续 MoveWindow 模拟拖拽全程不收、光标离开后正常收起且窄条 3px
- [x] 3.3 提交 fork；更新补丁/commits.txt；归档变更并提交 TokenHub；更新 HANDOFF
