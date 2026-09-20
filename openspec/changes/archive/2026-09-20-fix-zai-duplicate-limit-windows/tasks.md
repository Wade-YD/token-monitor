## 1. 数据层修复

- [x] 1.1 `src/shared/providers/zai/limits.js`：新增 `dedupeZaiWindows` 纯函数（kind/label/resetsAt/usedPercent 四元组身份，保留首个），接入 `fetchZaiLimits` 的 lane 合并 flatMap，并导出
- [x] 1.2 `tests/shared/zaiLimits.test.js`：新增 2 个用例——双通道同答仅 5 小时桶的集成复现（合并后仅 1 个 session 窗口）+ 纯函数用例（相同折叠/不同保留/空输入）

## 2. 测试与交付

- [x] 2.1 zaiLimits 单测 46/46 通过；全量套件 4654/4662（唯一失败为 macOS symlink 平台限制）
- [x] 2.2 fork 提交 `7cfa315`；overlay 21 文件（git diff 生成清单）→ pack 45,658,384 B → 换装
- [x] 2.3 CDP 验收：stats 快照 `[session 12.7%, weekly 53.8%]` 无重复；额度视图渲染 "5-hour 13% used" 正常；应用恢复正常启动

## 3. 归档

- [ ] 3.1 用户最终确认显示一致 → `openspec archive fix-zai-duplicate-limit-windows` + fork/workspace 推送
