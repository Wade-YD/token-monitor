# Tasks: edge-native-popup-hold

## 1. 代码

- [x] 1.1 新增 `src/electron/edgePopupGuard.js`：懒加载 koffi/user32；`popupHoldsCollapse({ mainHwnd, cursor })` = WindowFromPoint 光标下根窗口 或 前台窗口 属于本进程且非主窗口
- [x] 1.2 `main.js`：轮询武装前守卫 + 计时器到点否决 + debug 埋点

## 2. 测试

- [x] 2.1 纯函数：注入假 API，覆盖「光标在弹窗上 / 光标在主窗口 / 光标在别的应用 / 前台是弹窗 / FFI 不可用」五类
- [x] 2.2 源码契约：轮询与计时器两处守卫存在；守卫失败静默降级
- [x] 2.3 全量测试 `node --test` 全绿

## 3. 交付与验证

- [x] 3.1 overlay 清单 +1 → pack → 替换 → 重启；回归 2 轮唤出/收起
- [x] 3.2 用户实测厂商色调色盘流程确认；提交 fork、更新补丁留档、归档变更并提交工作区仓
