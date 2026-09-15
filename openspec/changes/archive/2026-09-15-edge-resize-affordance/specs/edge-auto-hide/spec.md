## ADDED Requirements

### Requirement: Resizing a docked expanded window MUST NOT trigger collapse

展开停靠态下，用户调整窗口大小期间系统 MUST NOT 收起窗口。收起的「光标在窗口内」保持测试 MUST 带**交互边距**（`EDGE_INTERACTION_MARGIN_PX`，约 10px）：光标停在 resize 边框上时位于 Win32 外框、在 Electron 矩形之外约 6px，MUST 被视为「在使用窗口」。同时，观察到原生 resize 活动后的短宽限期（约 700ms）内 MUST NOT 武装收起计时器，已武装的计时器到点时 MUST 否决翻转。隐藏态的触发区 MUST NOT 应用该边距（触发区必须保持窄）。

#### Scenario: Cursor resting on the bottom resize border
- **WHEN** 窗口停靠 `top` 展开态，光标停在窗口底边框上（Electron 矩形外约 3~6px）且无 resize 活动持续超过收起延迟
- **THEN** 窗口保持展开，不进入收起流程

#### Scenario: Actively resizing keeps the window revealed
- **WHEN** 用户抓住边框连续调整尺寸（`resize` 事件连续到达），光标随边框移动
- **THEN** 拖拽全程及最后一次 resize 后的宽限期内窗口均保持展开，不滑出

#### Scenario: Cursor truly away still collapses
- **WHEN** 光标离开窗口矩形与交互边距、且宽限期已过
- **THEN** 系统按既有延迟收起，行为与未加边距时一致
