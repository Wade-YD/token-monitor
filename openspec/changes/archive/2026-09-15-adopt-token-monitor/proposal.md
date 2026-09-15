## Why

TokenHub 是我们自己写的 tkinter 悬浮窗，但它监控的 4 个厂商全部依赖**未公开文档化的接口**（GLM 的 `/api/monitor/usage/quota/limit`、CommandCode 的 `/internal/billing/*` + 浏览器 session cookie）。这类接口已经坏过一次：2026-07-30 智谱把计划从 prompts 改成 credits，字段 `type` 由 `TOKENS_LIMIT` 改名为 `CREDIT_LIMIT`，导致按旧字段名过滤的实现在**匹配到 0 条时静默失败**（两个格子永远显示 `--`，看起来像"没有额度"而不像"代码坏了"）。它还会再坏，而目前**唯一会去修的人是使用者自己**。

已核实：`Javis603/token-monitor`（Electron，MIT，2148★，当日仍有提交）对这四个厂商**全部支持**，且全部走**厂家官方额度接口**（给出窗口百分比 + 重置时间，而非本地 token 消耗统计）——正是 TokenHub 的全部价值所在。它同时提供了 TokenHub 已有的贴边折叠 + 悬停展开交互。把脆弱接口的维护责任转移给一个有社区维护的项目，是这次变更的核心动机。

但这个切换不能盲目做，有两件我们已经握在手里的东西不能丢：

1. **我们独立验证过的 ground truth**——GLM 的 `1% / 10%`（cap 2000/10000）、CommandCode 的 `1.506/14` 与 `2.8696/35` 都是与厂商原始字段对过账的。这是验证新工具是否读对了的唯一权威基准。
2. **TokenHub 在凭证处理上比新工具更保守**——它**从不落盘 GLM 密钥**（每次请求由 OpenCode auth store 现读），config 目录 ACL 独占；而 Token Monitor 把所有厂商的 API key 与 10+ 个服务的 session cookie 汇总进一个**未加密的明文 `credentials.json`**（全仓库无 `safeStorage`、无 `keytar`）。

## What Changes

- **采用 Token Monitor 作为主力监控**，覆盖 OpenCode Go / CommandCode / DeepSeek / GLM Coding Plan 四个厂商。
- **TokenHub 保留、不删除、不弃用运行**，降级为两重角色：ground truth 对账基准，以及新工具出问题时的回退项。**BREAKING**：TokenHub 进入功能冻结——除安全修复外不再开发新功能。
- **迁移前设一道对账闸门**：必须用我们的 ground truth 逐项核对 Token Monitor 的读数；任一项不符则先查清原因再决定是否切换。
- **迁移 GLM 凭证（需手工）**：Token Monitor **不会**自动读 OpenCode auth store 里的 `zhipuai-coding-plan`（它对 auth store 只认 `opencode-go` 一个条目），必须手工把该 key 填进 Z.ai 设置，并把区域从默认 `global` **切换为 `bigmodel-cn`**，否则会打到 `api.z.ai` 而失败。
- **迁移 CommandCode 凭证**：仍是 session cookie（非 API key），需重新提取一次；这部分脆弱性**并未改善**，只是换了个存放位置。
- **对新工具的凭证存储做加固**：对其 `<userData>` 目录套用我们已有的逐文件 ACL 做法（`icacls /inheritance:r /grant:r "%USERNAME%:F"`，**严禁 `/T`**——我们曾因 `/T` 把整个项目的 ACL 清空过）。
- **显式记录 CommandCode 月度指标的已知偏差**：Token Monitor 把 GOAT 的月度分母**硬编码为 $70**（其源码自认"从未被真实 GOAT 账号验证过"）；而我们的实测数据显示这个账户的真实 grant 是 **74.107**（月度已用 `51.9976` + 剩余 `22.1097`，后者挂在 `opensourceMonthlyCredits` 桶）。因此**凡带额外赠送额度的账户，其月度百分比都会算错**。5 小时 / 每周窗口来自线上报文，可信。
- **可选的向上游贡献**：Token Monitor 缺的正是"自动读 OpenCode auth store 的 `zhipuai-coding-plan`"这一模式，而该模式在我们这边已被验证可行。它是 MIT，可以提上游 PR 把 GLM 接入也变成零配置。
- **不触碰**：TokenHub 的任何源码逻辑。本次变更的产物是文档、验证记录与配置动作，不是 TokenHub 的代码改动。

## Capabilities

### New Capabilities
- `token-monitor-adoption`: 采用 token-monitor 的完整流程——迁移前的 ground truth 对账闸门（逐厂商、逐指标、含容许偏差判定）、GLM 与 CommandCode 的凭证迁移、迁移后的读数一致性复核、以及对 CommandCode 月度指标已知偏差的显式呈现要求。
- `tokenhub-fallback-retention`: TokenHub 在新工具启用后的存续契约——保持可运行、其已验证行为（贴边隐藏触发区、凭证不落盘、ACL 加固）不得退化、其 ground truth 可复现、功能冻结的边界（安全修复除外）。

### Modified Capabilities
- `credential-storage-hardening`: 现有基线 spec 只约束 TokenHub 自身的 `config.json` 与日志。本次把该能力的要求**扩展到新采用的第三方工具的凭证存储**——引入新工具不得降低凭证保护水平：其持有的密钥与会话 cookie 所在的目录必须做同等或更严的访问限制，且加固手段不得使用会破坏子文件权限的递归方式。

## Impact

- **代码**：无 TokenHub 源码改动。TokenHub 仅状态变更（功能冻结），需要在 README / CHANGELOG 标注。
- **新增外部依赖（运行期）**：安装 `token-monitor` v0.57.0+。安装包 105.8 MB，装完预计占盘 250–400 MB（未实测），常驻内存约 110–120 MB（来自其公开 issue #495 的实测数字；tkinter 侧约 20–30 MB）。
- **安全面**：新增一个持有更多密钥与会话 cookie 的明文凭据文件，是本变更最主要的负面面。缓解手段即上面 `credential-storage-hardening` 的扩展要求。
- **网络**：Token Monitor 无遥测，且声明多设备同步**不上传凭证**（只传聚合用量；hub 需自建）。但会访问其自身更新检查、汇率、状态页等端点，需要接受这个新的出站面。
- **凭证迁移**：GLM 需手工填 key + 切区域；CommandCode 需重新提取 cookie。两处都需要在验收时确认读数正确。
- **文档**：本变更需在 TokenHub 侧产生一份对账记录，作为日后"新工具读数是否可信"的存档证据。
