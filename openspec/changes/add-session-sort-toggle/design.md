## Context

- 会话行排序公式重复存在于两处：`sessionRows.js:237`（`sessionRowsForPeriod` 内部收尾排序）与 `app.js:2721`（调用方拿到行后**再次**排序）。两处均为 `b.sortTime - a.sortTime || b.value - a.value || b.cost - a.cost || a.name.localeCompare(b.name)`。
- 主面板页脚（`index.html` `<footer class="footer">`）已有 `viewSwitcher`（会话/客户端等 breakdown 下拉）、`toolDetailFooter`（按模式条件显示的先例）、`liveTokenRate`、`utilityActions` 等控件。
- settings 流：渲染层默认表 + `main.js` `defaultSettings()`（含 `liveTokenRateScope: 'all'` 等）双端默认；渲染层 patch → 主进程持久化；`tokenRateMode` 是同类「渲染层点击切换 + 持久化 + i18n」的既有先例。

## Goals / Non-Goals

**Goals:**

- 会话视图页脚新增紧凑切换按钮（`⇅ 最近` / `⇅ Token`），仅会话模式显示
- `sessionSortMode` 设置键（`'recent' | 'tokens'`，默认 recent，非法回退），重启保留
- 两处排序公式收敛为一个纯比较函数（可单测），按模式分支
- 三语 i18n；纯 Node 测试

**Non-Goals:**

- 不改仪表盘窗口的会话列表
- 不做第三种排序（成本/字母序）——控件只双态
- 不做拖拽持久化列宽之类的列表改造

## Decisions

1. **控件放页脚 `viewSwitcher` 之后**，复用 `tool-detail-footer-option` 的按钮样式，`hidden` 类按 `state.breakdown === 'session'` 切换——与 `toolDetailFooter` 同一显隐先例，零新 CSS 或最小 CSS。
2. **比较函数收敛**：`sessionRows.js` 导出 `compareSessionRows(a, b, sortMode)`，两处调用改为 `rows.sort((a, b) => compareSessionRows(a, b, sortMode))`；`tokens` 模式 = `b.value - a.value || b.sortTime - a.sortTime || ...`（token 主键、时间平局）。app.js 的重复排序在该函数内被 mode 参数吸收。
3. **设置键 `sessionSortMode`**：main `defaultSettings()` 加 `'recent'`；渲染层读取处归一化（非 `'tokens'` 一律 `'recent'`），点击切换走既有 settings patch 持久化，并就地重排（不等待下轮刷新）。
4. **重排触发**：点击控件 → 更新本地 state → 立即重渲染 breakdown（与 `tokenRateMode` 切换后立即刷新同一模式），同时发出 settings patch。

## Risks / Trade-offs

- **双处排序收敛时行为差异**：app.js 侧再排序曾在分组（background review）之前——收敛后保持同序（比较函数等价替换），测试覆盖 recent 模式输出与现状一致。
- **「会话」下拉与新按钮挤在页脚**：按钮为紧凑文本（⇅ + 单词），最窄窗口（240px）下与 viewSwitcher 同行可容纳；必要时 CSS 允许换行。
- **tokens 模式下用户找不到「刚结束的小会话」**——可一键切回 recent，选择已持久化。
