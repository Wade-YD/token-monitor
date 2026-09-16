## 1. 解析器实现

- [x] 1.1 新建 `src/shared/providers/zcode/sessionMetadata.js`：`node:sqlite` 懒加载（readOnly + busy_timeout=250）、`deps.sqlite`/`deps.dbPaths` 测试缝、`resolveSessionMetadata(sessionIds, context)` 返回 `Map<id, {startedAt, lastUsedAt, title}>`
- [x] 1.2 子代理归属：`parent_id` 非空时标题取「↳ + 父 title」，父不可得回退自身 title，再回退空
- [x] 1.3 失败面：驱动缺失 / DB 不存在 / 打开或查询抛错 → 返回空 Map，不抛出
- [x] 1.4 `src/shared/sessionMetadata.js` 注册表加 `['zcode', { resolve, retryAfterTimestampFallback: true }]`，文件头 require 新模块

## 2. 测试

- [x] 2.1 新建 `tests/shared/zcodeSessionMetadata.test.js`：临时 fixture DB（建 `session` 表灌样例）覆盖——有标题、无标题、id 不在库、子代理（父标题/父无标题/父缺行）、DB 文件缺失、坏 DB 文件、deps.sqlite 缺失降级
- [x] 2.2 契约测试：sessionMetadata.js 源码注册表含 `zcode` 且 `retryAfterTimestampFallback: true`
- [x] 2.3 `node --test` 新测试 + 既有五套（edgeAutoHide / edgePopupGuard / windowBehavior / tray / zaiLimits）全绿；`node --check` 全部改动文件

## 3. 交付

- [x] 3.1 退出应用 → 从 `app.asar.v0580-official.bak`（+ `.unpacked` 孪生）维护的 `asar-extracted-v058` 树覆盖 11 个交付文件（原 10 + 新 sessionMetadata.js + registry 改动所在的 sessionMetadata.js，实际为同一批 src 文件）
- [x] 3.2 pack 自包含 asar（体积同量级 ~45MB）→ 换装 → 重启
- [x] 3.3 运行时验证：应用贴边隐藏 3px 正常；会话列表 ZCode 行显示真实标题（用本机实测：`sess_ce66fcdc…`→「工作台网站交接文档优化分析」、子代理行→「↳ …」）；无错误日志

## 4. 归档

- [x] 4.1 fork 提交（feat/edge-auto-hide 链）；重生成 `edge-auto-hide.patch` + `commits.txt`，干净 v0.58.0 检出重放校验通过
- [x] 4.2 README.txt / HANDOFF-zcode.md 补记本轮
- [x] 4.3 workspace 仓提交；`openspec archive add-zcode-session-titles` 归档变更
