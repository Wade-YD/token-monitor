# Proposal: edge-resize-affordance

## Why

用户实测反馈：贴边隐藏窗口唤出后，**只要鼠标移到边缘调整窗口大小，窗口就立刻收回**，
根本无法调整尺寸。根因：收起判定的「光标在窗口内」测试以 **Electron 矩形**为准，
而用户抓住的 resize 边框位于 **Win32 外框**上——它比 Electron 矩形外扩约 6px（见
`finalize-edge-auto-hide` 的实测数据），光标因此总在矩形**外**；轮询据此在
200ms 后收起窗口，正好从用户手里缩走。

## What Changes

- **交互边距**：`edgeCursorInExpandedBounds` 增加可选 `margin` 参数；展开态的收起保持测试
  以 `EDGE_INTERACTION_MARGIN_PX = 10` 的边距把光标视为「在使用窗口」（覆盖 6px 外框 + 余量）。
  隐藏态触发区**不加**边距（维持 TokenHub 教训：触发区必须窄）。
- **resize 宽限期**：`resize`/`resized` 事件刷新 `lastResizeAt`；其后 700ms 内
  （`edgeResizeGraceActive()`）轮询**不武装**收起计时器，已武装的计时器到点时**否决**翻转为
  `hidden`——覆盖「光标瞬时漂出边距但用户仍握着边框」与「武装后才抓边框」两个时序。

## Impact

- **specs**：`edge-auto-hide` 新增 1 条需求（调整大小期间 MUST NOT 收起）。
- **代码**：`src/electron/edgeAutoHide.js`（常量 + margin 参数）、
  `src/electron/main.js`（宽限期 + 轮询/计时器两处判定）、`tests/electron/edgeAutoHide.test.js`。
- 附带收益：收起动画不再可能闯入用户原生的 resize 模态循环——那正是此前观测到
  「瞬态原生拒收」的一类来源。
