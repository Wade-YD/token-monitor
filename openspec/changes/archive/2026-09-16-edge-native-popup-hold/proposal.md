# Proposal: edge-native-popup-hold

## Why

用户实测反馈：在「外观 → 厂商色」调色盘里取色时，Chromium 的原生取色器
（`<input type=color>` 的独立弹窗）落在**主窗口矩形之外**；光标移进取色器的瞬间，
收起判定的「光标在窗口内」测试失败，200ms 后窗口贴边收走，取色器悬在原处无法操作。

这和 `edge-resize-affordance` 是同一类病的不同发作：**应用自有 UI 的合法交互流程
要求光标离开主窗口矩形**。上次补了 resize 边框（边框贴着窗口），这次是完全独立
的原生弹窗（可以离窗口很远），交互边距方案覆盖不了。

## What Changes

新增**自有弹窗守卫**（win32，经 koffi FFI，应用已带该依赖）：

- `WindowFromPoint(光标)` → `GetAncestor(GA_ROOT)` → `GetWindowThreadProcessId`：
  光标下的根窗口属于本进程且不是主窗口 → 判定「正在与应用自有弹窗交互」。
- `GetForegroundWindow` 同样判定：前台是本进程的非主窗口 → 同上。
- 轮询展开态在**武装收起计时器之前**先过该守卫；已武装的计时器到点时再次守卫
  （与 resize 宽限期同款式）。守卫命中 → 保持展开，不武装、不收起。

覆盖范围：取色器、右键上下文菜单、原生 `<select>` 下拉、以及未来任何
「光标在窗口外但属于本应用」的交互——一次修掉一整类问题。

## Impact

- **specs**：`edge-auto-hide` 新增 1 需求 / 3 场景。
- **代码**：新增 `src/electron/edgePopupGuard.js`；`main.js` 三处接线；
  新测试文件 `tests/electron/edgePopupGuard.test.js`。
- **边界**：仅 win32 生效（koffi FFI）；FFI 不可用时守卫恒 false（退回旧行为，不报错）。
  FFI 探测每 100ms 轮询至多一次、且只在光标已出窗口时触发，成本可忽略。
