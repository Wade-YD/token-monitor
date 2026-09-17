## 1. 排序收敛与模式

- [x] 1.1 `sessionRows.js` 导出 `compareSessionRows(a, b, sortMode)`（recent=现行公式；tokens=`b.value - a.value || b.sortTime - a.sortTime || b.cost - a.cost || a.name.localeCompare(b.name)`），`sessionRowsForPeriod(period, options)` 接受 `options.sortMode` 并用于收尾排序
- [x] 1.2 `app.js`：`sessionRowsForPeriod(period)` 传入 `sortMode`；两处 `.sort(...)` 改用比较函数；新增 `sessionSortMode` 读取/归一化（非法值回退 recent）

## 2. 控件与持久化

- [x] 2.1 `index.html` 页脚加排序按钮（复用 tool-detail-footer-option 样式），仅 `state.breakdown === 'session'` 时显示；点击在 recent/tokens 间切换
- [x] 2.2 `main.js` `defaultSettings()` 加 `sessionSortMode: 'recent'`；渲染层 settings patch 持久化 + 立即重渲染 breakdown
- [x] 2.3 `i18n.js` 三语键（`home.sessionSort.recent` / `.tokens` / title 提示）

## 3. 测试

- [x] 3.1 `sessionRows` 比较函数单测：recent 模式输出与现行一致；tokens 模式按 value 降序、时间平局；非法 sortMode 回退 recent
- [x] 3.2 源码契约：app.js 两处 `.sort` 使用比较函数、index.html 含排序按钮、i18n 三语键存在
- [x] 3.3 `node --test` 全量绿；`node --check` 改动文件

## 4. 交付与归档

- [x] 4.1 覆盖交付（sessionRows.js / app.js / index.html / i18n.js / main.js）→ pack → 换装 → 重启；贴边 3px、无错误日志
- [x] 4.2 fork 提交；patch/commits.txt 重生成 + 重放校验（绝对路径）；README 提交链/规模同步
- [x] 4.3 HANDOFF 补记；workspace 提交；`openspec archive add-session-sort-toggle`
