## Why

主面板会话列表的排序写死为「最近活跃优先」（最后活跃时间降序，token 只作平局裁决），用户无法按 token 大小浏览会话——例如想快速找到消耗最大的会话时，只能目测 325K（01:30）排在了 611K（01:05）前面的乱序。

## What Changes

- 主面板会话视图新增排序切换控件（页脚、仅会话模式显示）：在「最近活跃（默认）」与「Token 从大到小」之间切换，点击即生效
- 排序选择持久化到 settings（新键 `sessionSortMode: 'recent' | 'tokens'`，默认 `recent`），重启后保留
- 两处重复的排序公式（`sessionRows.js` 与 `app.js`）统一为单一比较函数并接受排序模式
- i18n：zh-CN / zh-TW / en 三语控件文案

## Capabilities

### New Capabilities

- `session-list-sort`: 主面板会话列表的排序模式可切换（最近活跃 / Token 降序），选择持久化，默认保持现有最近活跃行为

### Modified Capabilities

<!-- 无：现有能力规格不受影响 -->
