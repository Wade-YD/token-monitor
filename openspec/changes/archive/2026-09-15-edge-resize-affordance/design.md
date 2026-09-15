# Design: edge-resize-affordance

## Context

用户实测：唤出后抓边缘调整大小 → 窗口立即收回。机制：展开态轮询的保持测试
`edgeCursorInExpandedBounds` 是 **Electron 矩形Exclusive**；而 resize 命中区在 Win32 外框上
（比 Electron 矩形大 ~6px，`finalize-edge-auto-hide` 已实测），抓边框时光标必然在 Electron
矩形外 ≥0、≤~6px → 判为「光标离开」→ 200ms 后收起。

## Goals / Non-Goals

- Goals: 抓住/悬停任意 resize 边框时窗口绝不收起；松手且光标真正离开后恢复自动收起。
- Non-Goals: 不改隐藏态触发区宽度（保持 12px 容差、无边距——TokenHub 教训）；
  不处理「展开态把窗口拖离屏幕边」的既有语义。

## Decisions

### D1 交互边距 = 常量 10px，只加在展开态保持测试
`EDGE_INTERACTION_MARGIN_PX = 10`：覆盖实测 6px 外框 + 余量；经 `edgeCursorInExpandedBounds`
的新可选 `margin` 参数生效，默认 0（既有行为与测试不变）。
**否决**把 Win32 外框算进判定（需要 FFI，Electron 无此 API）；**否决**大边距（30px 会让
「路过窗口附近」都压住收起，违背挂件语义）。

### D2 resize 宽限期 700ms，事件驱动
`resize`（连续）与 `resized`（结束）都刷新 `lastResizeAt`；`edgeResizeGraceActive()` =
700ms 内有 resize。轮询在宽限期内**不武装**收起计时器；已武装计时器到点时若宽限期命中则
**否决**翻转 `desired`（轮询稍后自然重判）。700ms 覆盖「拖拽中途手停住」与 MoveWindow 类
离散尺寸跳变的间隔。
**否决**监听原生模态循环（Electron 无公开 API 判断"正在拖拽 resize"）。

### D3 边距与宽限期只影响「是否收起」，不影响唤出与隐藏态触发
唤出仍由 12px 触发区决定；隐藏态不加边距。收起若被否决，下一轮轮询在光标真正离开且宽限期
过后重新武装——自动收起语义无变化。

## Risks / Trade-offs

- 光标静止停在窗口外 10px 内时窗口不收起（原会收起）：这是「光标靠近 = 在使用」的合理外延；
  光标离开边距即恢复收起。
- 原生 resize 的 `resize` 事件风暴会被 700ms 宽限反复续期：正是设计意图（拖拽期间绝不收起）。

## Migration Plan

无持久化结构变化；`edgeAutoHideBounds` 不受影响。交付管道与回退同前。

## Open Questions

- 无。
