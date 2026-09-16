## 1. 事件读取器

- [ ] 1.1 `src/shared/providers/zcode/sessionMetadata.js` 增加 MESSAGES_SQL/PARTS_SQL、mapTokens、buildEvents、`readSessionEvents(sessionId, deps)` → `{found, events, sessionCost}`（只读、点查、失败 `found:false`）
- [ ] 1.2 导出并在 `src/shared/sessionDetail.js` 增加 `readZcodeSessionDetail`（groupEvents → filterExchangesByPeriod → distributeCost）+ `readSessionDetail` 分发 `client === 'zcode'`

## 2. 渲染层接线与测试

- [ ] 2.1 `app.js` 两处白名单（interactive affordance ~L2305、点击处理 ~L12977）加入 `'zcode'`
- [ ] 2.2 新建 `tests/shared/zcodeSessionDetail.test.js`：fixture DB（user/assistant 消息 + text/tool part）断言事件、分组、成本分摊合计 = 会话成本；库缺失/坏库/空会话 `found:false`；app.js 两处白名单源码契约
- [ ] 2.3 `node --test` 六套全绿；`node --check` 全部改动文件

## 3. 交付与归档

- [ ] 3.1 覆盖 13 文件（含 sessionDetail.js）→ pack → 换装 → 重启；贴边 3px、无错误日志
- [ ] 3.2 fork 提交；patch/commits.txt 重生成 + 干净 v0.58.0 重放校验；README 提交链/规模/测试数同步
- [ ] 3.3 HANDOFF 补记；workspace 提交；`openspec archive add-zcode-session-detail`
