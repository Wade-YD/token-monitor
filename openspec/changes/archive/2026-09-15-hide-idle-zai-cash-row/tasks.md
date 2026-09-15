# Tasks: hide-idle-zai-cash-row

## 1. 代码与测试

- [x] 1.1 `limits.js`：keyLane 输出前加隐藏判定（windows/balance/hasAnything 三处一致）
- [x] 1.2 既有用例改非零余额（保持 URL/鉴权契约不变）；新增 3 个行为用例（隐藏 / 有现金回归 / 无订阅窗口保留）
- [x] 1.3 `node --test` 四文件全绿 + `node --check`

## 2. 交付与验证

- [x] 2.1 overlay 清单 +1（`src/shared/providers/zai/limits.js`）→ pack → 替换 → 重启
- [x] 2.2 截图验证 GLM 栏不再出现 Balance/Spend；5-hour/Weekly 正常
- [x] 2.3 提交 fork；更新补丁/commits/README；归档变更并提交 TokenHub；更新 HANDOFF
