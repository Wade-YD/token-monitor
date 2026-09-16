## ADDED Requirements

### Requirement: Interaction with app-owned native popups MUST NOT trigger collapse

展开停靠态下，当光标位于**本进程弹出的非主窗口**（如取色器、上下文菜单、原生下拉）之上，或该弹窗持有前台焦点时，系统 MUST NOT 武装收起计时器，已武装的计时器到点时 MUST 否决翻转。弹窗关闭且光标离开主窗口区域后，收起行为 MUST 恢复既有语义。守卫 MUST 仅在 win32 且 FFI 可用时生效，不可用时 MUST 静默退回旧判定。

#### Scenario: Picking a color in the native color chooser
- **WHEN** 窗口停靠 `top` 展开态，用户点开厂商色调色盘的原生取色器（位于主窗口矩形之外）并将光标移入
- **THEN** 取色期间窗口保持展开，不进入收起流程

#### Scenario: Popup closed resumes normal collapse
- **WHEN** 取色器关闭，光标移出主窗口区域与交互边距
- **THEN** 系统按既有延迟收起，与无弹窗时的行为一致

#### Scenario: Guard degrades silently without FFI
- **WHEN** 运行环境无法加载 koffi/user32（非 win32 或精简构建）
- **THEN** 守卫恒判否，收起行为与未引入该守卫时完全一致，且不产生错误
