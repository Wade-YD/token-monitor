# Design: edge-native-popup-hold

## Context

收起判定的保持测试基于「光标是否在主窗口矩形（+10px 交互边距）内」。取色器等
原生弹窗是独立顶层窗口，可出现在屏幕任意位置；光标进入弹窗 = 光标离开主窗口
判定区 → 武装收起 → 窗口从用户手里滑走。

## Goals / Non-Goals

- Goals: 光标位于**本进程自有弹窗**之上（或弹窗持前台）时，永不武装/触发收起。
- Non-Goals: 不处理「光标在别的应用窗口上」——那是合法的收起时机；不改渲染层。

## Decisions

### D1 判定 = WindowFromPoint + 前台窗口，双查合一
`WindowFromPoint(光标)` 直接给出光标下的窗口，`GetAncestor(GA_ROOT)` 归约到根
（取色器是 owned popup，根即弹窗本身），`GetWindowThreadProcessId` 判归属；
`GetForegroundWindow` 兜住「点了弹窗后焦点在弹窗上、光标短暂移出」的时序。
两查任一命中即视为交互中。
**否决**EnumWindows 全量枚举（需要 FFI 回调注册，复杂且每次轮询跑全量浪费）——
`WindowFromPoint` 单调用即可。**否决**渲染层上报（input[type=color] 没有
可靠的「弹窗已关闭」事件，通知时序不可靠）。

### D2 守卫插在两个时点
① 轮询展开态：光标已出边距、准备武装收起前 → 命中则不武装（等同 resize 宽限）；
② 已武装计时器到点：翻转 `desired` 前再查一次 → 命中则否决本次收起
（覆盖「武装之后用户才点开取色器」的时序）。轮询每 100ms 重判，弹窗关闭后
自然恢复正常收起。

### D3 FFI 懒加载 + 不可用即降级
仿 `windowsBackdrop.js`：koffi 懒加载 user32，句柄比较用 `hwndOf()` 同款
Buffer→BigInt 读取。FFI 加载失败（非 win32 / 精简环境）时 `popupHolds()`
恒返回 false——退回旧行为，绝不抛错。主窗口 hwnd 用
`getNativeWindowHandle()` 同款换算，排除「光标在主窗口上」的平凡命中。

## Risks / Trade-offs

- 光标悬停在弹窗上即保持展开（用户手已离开但光标停留）：与交互边距同一哲学
  （光标附近 = 在使用），光标移开即恢复收起。
- `WindowFromPoint` 对 layered/DirectComposition 窗口的命中语义：取色器为
  Chromium 普通弹窗（Chrome_WidgetWin_1），实测路径无碍；即便失准，还有
  前台窗口兜底。

## Migration Plan

无持久化变化。交付管道复用（overlay 清单 +1 文件），回退三层不变。

## Open Questions

- 无。
