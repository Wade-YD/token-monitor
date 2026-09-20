## Why

额度列表（首页额度模块）里 GLM 行偶发渲染为「Session 9% / Session 9%」——第二个窗口复制了第一个会话窗口的数据，而点进详情页（每次打开重新拉取）显示正确的 5-hour 9% + Weekly 53%。CDP 实证：stats 快照在该时刻含有两个 `kind: 'session'` 的窗口。

## What Changes

- 根因：zai 提供方的两条数据通道（控制台 key 通道 + ZCode 镜像凭据通道）都会应答**同一个** GLM 计划的配额；`fetchZaiLimits` 的 lane 合并是纯 `flatMap`，无去重。当 BigModel 瞬时只对其中一个（或两个）通道返回 5 小时桶（weekly 桶缺席），合并结果出现重复 session 窗口，首页模块（原样透传全部窗口）随之重复渲染。
- 修复：lane 合并处新增 `dedupeZaiWindows` 去重——`kind/label/resetsAt/usedPercent` 四元组完全一致的窗口视为同一窗口，保留首个。真实不同的桶（Start/Weekend 计划桶、MCP 月桶、现金余额）至少在一个字段上不同，不受影响。
- 回归测试：双通道同答仅含 5-hour 桶的配额 → 合并后仅一个 session 窗口；纯函数用例覆盖"相同折叠 / 不同保留 / 空输入"。

## Capabilities

### New Capabilities

- `zai-limit-window-merge`: zai 提供方多通道窗口合并能力——控制台 key 通道与 ZCode 镜像凭据通道的窗口合并必须去重，保证同一计划窗口不重复渲染。

### Modified Capabilities

（无——既有 `glm-coding-plan-monitor` spec 描述的是 TokenHub 应用的 GLM 监控，与本修复（token-monitor 的 zai 提供方合并）不同代码库，不修改它。）

## Impact

- `src/shared/providers/zai/limits.js`：新增 `dedupeZaiWindows` 纯函数并接入 lane 合并；导出供测试。
- `tests/shared/zaiLimits.test.js`：2 个新用例（集成复现 + 纯函数）。
- 不改变任何抓取协议、请求频率或其余提供方。
