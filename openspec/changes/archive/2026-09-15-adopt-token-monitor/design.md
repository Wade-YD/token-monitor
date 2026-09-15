## Context

TokenHub 是本地自建工具：Python 3.13 + tkinter，**纯标准库零依赖**，Windows 专用，监控四个厂商的额度窗口。`src/floating_window.py` 888 行是主体，数据层在 `src/api.py`。

它的数据层全部依赖**未公开文档化的接口**：

| 厂商 | 端点 | 凭证 |
|---|---|---|
| OpenCode Go | `opencode.ai/_server?id=&args=` | Cookie `auth=` + `X-Server-Id` |
| DeepSeek | `platform.deepseek.com/api/v0/...` | Bearer token |
| CommandCode | `api.commandcode.ai/internal/billing/*` | `__Secure-commandcode_prod_.session_token` cookie |
| GLM Coding Plan | `open.bigmodel.cn/api/monitor/usage/quota/limit` | 裸 `Authorization: <key>` |

**已经坏过一次**：2026-07-30 智谱把计划从 prompts 改为 credits，`type` 由 `TOKENS_LIMIT` 改名为 `CREDIT_LIMIT`。按旧字段名过滤的实现匹配到 0 条，两个格子永远显示 `--`——失败模式是**静默的**，看起来像"没有额度"而不像"代码坏了"。这条经验是本变更最重要的背景：**在这个领域，"看起来对"不等于"读对了"。**

同时我们握有一份**独立验证过的 ground truth**（与厂商原始字段对过账）：

| 指标 | 已验证真值 | 来源字段 |
|---|---|---|
| GLM 5h / 周 | `1%` / `10%`，cap `2000` / `10000`（Lite） | `percentage`；`usage` |
| CommandCode 5h / 周 | `1.506/14 = 10.76%`、`2.8696/35 = 8.2%` | `windowLimits.fiveHour.used/cap` |
| CommandCode 月度 | grant = `51.9976 + 22.1097` = **`74.107`**（≠ 70） | `totalMonthlyCredits` + `credits.monthlyCredits` |

**参考项目已核实事实**（`Javis603/token-monitor` v0.57.0）：Electron 43.4.0、MIT、2148★、当日仍有提交；四个厂商全部支持且全部走**厂家官方额度接口**（给出窗口百分比 + 重置时间，而非本地 token 消耗统计）；有贴边折叠 + 悬停展开；凭证存放于**未加密明文** `<userData>/credentials.json`（全仓库无 `safeStorage`、无 `keytar`，仅 `0o600` 文件权限）；安装包 105.8 MB；常驻内存约 110–120 MB（其公开 issue #495 的实测数字，非我方实测）。

利益相关方即使用者本人，决策问题是「是否值得继续自己维护一个定制工具」。

## Goals / Non-Goals

**Goals:**

- 把日常监控迁到有社区维护的工具上，从而把**未公开接口的维护责任**从使用者身上转移出去。
- 迁移**不得降低数据可信度**：必须有独立于新工具的基准来验证它读对了，并且这个基准要留档可复现。
- 迁移**不得降低凭证保护水平**。TokenHub 目前从不落盘 GLM 密钥、config 目录 ACL 独占；新工具做不到"不落盘"，就必须用其它手段补回来。
- 整个过程**可逆**：任何一步出问题时都能无损退回 TokenHub。

**Non-Goals:**

- **不删除、不停止维护 TokenHub 的可运行性**。它降级为对账基准与回退项。
- **不在本次变更里实现 TokenHub 的毛玻璃设计**。调研表明可行，但代价是放弃现在的 `SetWindowRgn`（换成 DWM 抗锯齿圆角）——那是对一个刚确认满意的实现的改动，属于独立决策。
- **不 fork、不 vendored 参考项目的源码**。只作为第三方应用使用与评估。
- **不修上游的 CommandCode 月度硬编码**。只显式记录偏差，不试图patch第三方二进制。
- **不搭建多设备同步 / hub**。
- **不做凭证加密改造**（例如给 TokenMonitor 的 store 外面套一层加密容器）——超出范围，本次只做访问权限加固。

## Decisions

### D1. 采用 Token Monitor 为主力，TokenHub 保留不删

**理由**：真正的长期痛点不是界面，而是"未公开接口坏了谁去修"。参考项目 2148★、当日有提交、覆盖 36+ 工具，把这件事外包出去了。保留 TokenHub 的理由是可逆性与独立测量路径——它只占约 25 MB 常驻内存，却提供了一个**独立于新工具**的读数来源。

**考虑过的替代方案**：
- *立刻删除 TokenHub* —— 否决。新工具读错时没有任何对照，而本领域的失败模式恰恰是静默的。
- *继续只维护 TokenHub* —— 否决。维护责任留在使用者身上，正是要解决的问题。
- *两边都长期全量维护* —— 否决。那等于把成本叠加而不是转移；TokenHub 转入功能冻结。

### D2. 以 ground truth 对账作为切换闸门，而不是以"看起来对"为准

**理由**：我们自己的第一版 GLM 实现**看起来完全正常**（两格显示 `--`），实际是过滤条件匹配到 0 条。因此准入判据必须是可量化的对账，而不是观感。**任一厂商的任一窗口对不上，就是停止并查清原因，不是"四舍五入差异"。**

### D3. 对账要比 cap 与重置时间戳，不能只比百分比

**理由**：用量在实时推进，两个工具采样时刻不同，百分比天然会有小偏差——只比百分比会把时间差误判成错误。**cap 是稳定的**，它标识"是否找到了同一个窗口"；重置时间戳标识"是否是同一个周期"。因此判定顺序是：先比 cap / 窗口数量 → 再比重置时间戳是否指向同一周期 → 最后百分比在一个明确的小容差内即可。

| 对账项 | 稳定锚点（必须一致） | 浮动值（容许小偏差） |
|---|---|---|
| GLM | 窗口数 2（session/weekly）；cap `2000` / `10000` | 百分比（`1%` / `10%` 附近） |
| CommandCode 5h / 周 | cap `14` / `35` | 百分比（`10.76%` / `8.2%` 附近） |
| CommandCode 月度 | 无稳定锚点（分母是硬编码，见 D7） | 不参与判定 |
| DeepSeek | 余额量级与币种 | 具体数值 |
| OpenCode Go | 窗口数 3（rolling/weekly/monthly） | 百分比 |

### D4. GLM 区域必须显式改成 `bigmodel-cn`

**理由**：Token Monitor 的区域默认是 `global`（打到 `api.z.ai`），而本机凭证是**国内站**的 `zhipuai-coding-plan` 条目。不切区域会打到错误的站点并失败。**这是静默风险**（表现为取不到数据，而不是报错信息指向区域配置）。

**考虑过的替代方案**：用环境变量 `TOKEN_MONITOR_ZAI_API_REGION` 设置——否决，不如设置界面持久、且容易被后续启动方式绕过。

### D5. 接受 GLM 密钥需要落盘，用文件权限补偿

**理由**：TokenHub 从不落盘该密钥（每次请求从 OpenCode auth store 现读），**Token Monitor 没有这种模式**——它对 auth store 只认同一个条目 `opencode-go`（全仓库 grep `zhipuai` 零命中）。所以密钥必须被粘贴并存储。这是本次变更里**相对于现状的唯一实质退步**，只能靠 D6 的权限加固补偿，并如实记录，不粉饰。

**附带的缓解路径**：把"自动读 auth store 的 `zhipuai-coding-plan`"这一模式提上游 PR（参考项目是 MIT，而该模式在我们这边已被验证可行），可让这一步彻底消失。列为可选项，不作为本变更的前置条件。

### D6. 权限加固逐文件施加，严禁 `/T`

**理由**：我们**已经踩过这个坑**。此前对项目目录执行
`icacls <dir> /inheritance:r /grant:r "<user>:(OI)(CI)F" /grant:r "SYSTEM:(OI)(CI)F" /grant:r "Administrators:(OI)(CI)F" /T /C`
导致**每个子文件上的 ACE 被清空**（`(OI)(CI)` 对文件无意义，而 `/inheritance:r` 已先剥掉继承项），随即出现
`PermissionError: [Errno 13] Permission denied: ...\src\config.py`。恢复靠 `icacls <dir> /reset /T /C`。

因此：只对该 store 目录下的**具体文件**逐个施加 `icacls <file> /inheritance:r /grant:r "<user>:F" /grant:r "SYSTEM:F" /grant:r "Administrators:F"`，绝不对父目录用 `/T`。目标状态是 ACE 集合只剩当前用户 / SYSTEM / Administrators，且 `BUILTIN\Users` 与 `BUILTIN\Authenticated Users` 消失。

### D6 实施修正（2026-09-15，实施阶段实测）

把「需要加固」当作普适前提是错的。两种情形必须分开看，因为**平台默认 ACL 完全不同**：

| 凭证所在位置 | 默认 ACL（实测） | 是否需加固 |
|---|---|---|
| TokenHub `config.json`，位于 `D:\桌面\...\TokenHub\src\` | 继承到 `BUILTIN\Authenticated Users:(I)(M)` 与 `BUILTIN\Users:(I)(RX)` | **需要** |
| token-monitor 凭证存储，位于 `%APPDATA%\Token Monitor\` | 只有 SYSTEM / Administrators / 当前用户 | **不需要**——平台默认已满足要求 |

`%APPDATA%` 实测输出：
```
icacls "C:\Users\29871\AppData\Roaming\Token Monitor"
  NT AUTHORITY\SYSTEM:(I)(OI)(CI)(F)
  BUILTIN\Administrators:(I)(OI)(CI)(F)
  AUDIT-WADE-YD\29871:(I)(OI)(CI)(F)
```
不含 `BUILTIN\Users`，不含 `BUILTIN\Authenticated Users`。

**由此修正两点：**

1. **本变更对第三方凭证存储未施加任何 ACL 操作**。理由是收益为零而风险非零——对第三方应用的 profile 目录做无收益的 ACL 手术，而它自己的代码（`src/electron/main.js:2371`）会对「JSON 或权限异常」拒绝保存并回滚。
2. **时序要求在无文件时不成立**。`credentials.json` 要到首次录入凭证才生成，而「加固必须先于录入」的要求此时没有对象可施加。若日后确实需要加固，正确做法是加固**目录**（`/inheritance:r` + 可继承项，**不带 `/T`**），让日后生成的子文件继承限制——而非逐文件。本变更因上一条而无需执行此路径。

**保留的普适教训**：`/T` 与 `(OI)(CI)` 组合会在剥掉继承项的同时清空每个子文件的 ACE，这条对任何目录都成立，文档与 README 中关于该禁令的说明仍然有效。

### D7. CommandCode 月度偏差：显式记录，不信任也不去修

**理由**：Token Monitor 把 GOAT 的月度分母**硬编码为 `70`**（`COMMANDCODE_PLANS` 里 `individual-goat: { monthlyCreditsUsd: 70, fiveHourCapUsd: 14, weeklyCapUsd: 35 }`），且其源码注释自认这组月度数字"从未被真实 GOAT 账号验证过"。而我们的实测数据显示**这个账户的真实 grant 是 `74.107`**（月度已用 `51.9976` + 剩余 `22.1097`，后者挂在 `opensourceMonthlyCredits` 桶里，看起来是 GOAT 的 70 加上 4.107 的开源赠送）。

由此可得一个可预判的结论：**凡带额外赠送额度的账户，其月度百分比都会被算错**，且因为分母是账户无关的硬编码值，这不是精度问题而是口径问题。我们无法修改第三方二进制的硬编码表，也不应该把偏差藏起来——使用者必须知道**哪几个数字可信**（5h / 周来自线上报文，可信）**哪几个只能当参考**（月度）。

**考虑过的替代方案**：把月度当作不可用直接忽略——否决。已知的偏差优于未知的缺失。

### D8. TokenHub 进入功能冻结，但不得行为退化

**理由**：它现在的角色是**测量基准**，而会漂移的基准毫无价值。因此：除安全修复外不再开发新功能；其已验证行为（贴边隐藏触发区仅窗口范围内响应、GLM 密钥不落盘、config 目录 ACL 独占、`update_data` 与 `set_columns` 契约）必须保持。

**考虑过的替代方案**：冻结 = 停止一切改动——否决。安全修复仍应允许，否则基准本身会成为风险。

## Risks / Trade-offs

- **[新工具的 GLM 路径可能拒收 `zhipuai-coding-plan` 这个 key]** → 已前置验证该 key **确实**能被 `open.bigmodel.cn/api/monitor/usage/quota/limit` 接受：TokenHub 正是用同一个 key、以裸 `Authorization: <key>` 头从该端点取到 `1% / 10%` 的。残余风险只在 Token Monitor 的请求头构造是否一致。列为首要 Open Question；若失败，GLM 继续由 TokenHub 承担，其余三个厂商照常迁移。
- **[CommandCode 月度百分比在带赠送额度的账户上必然偏差]** → 见 D7。5h / 周为权威，月度仅作参考，并在验收记录中标注。
- **[凭证暴露面扩大：一个明文文件集中了更多密钥与会话 cookie，且由 Chromium 应用持有]** → D6 加固 + 只启用需要的 4 个厂商（参考项目会去读 Claude / Codex / Grok 的凭证文件，不启用即可避免扩大接触面）。此为使用者已知并接受的代价。
- **[两套工具同时轮询同一批厂商端点，可能把请求频率翻倍触发限流]** → 保持 TokenHub 原有 60 秒周期并观察是否出现厂商侧限流；一旦出现，只在需要时启动 TokenHub 做对账，日常不开。
- **[常驻内存 +110–120 MB（Electron 基线）]** → 接受的代价，换来维护责任转移。等新工具证明稳定后，可以决定是否退掉 TokenHub 那约 25 MB。
- **[参考项目版本演进可能改变行为（含自动更新）]** → 在对账记录里固定记录已验证的版本号（v0.57.0），日后数字变化时先核对版本。
- **[「`SetWindowRgn` 与 acrylic 冲突」这一条是单一来源，尚未交叉验证]** → 只影响日后在 TokenHub 做毛玻璃的决策，与本变更无关；若要做，必须先在本机实测。
- **[只审计了自用的 4 个厂商，参考项目另有 30+ 个 provider 未经我方审计]** → 只用已验证的 4 个；其余保持关闭。

## Migration Plan

1. 安装 Token Monitor（记录版本，目标 v0.57.0）。
2. **在录入任何凭证之前**先加固其凭证存储目录（逐文件 ACL，见 D6）。
3. 配置 OpenCode Go——预期**零配置**（它自动读 auth store 的 `opencode-go` 条目）。
4. 配置 GLM：粘贴 `zhipuai-coding-plan` 的 key，并把区域切到 `bigmodel-cn`。
5. 配置 CommandCode：重新提取 session cookie 并粘贴。
6. 配置 DeepSeek：填 API key。
7. 按 D3 的顺序执行对账，产出对账记录。
8. **对账通过后**才把 Token Monitor 视为主力；TokenHub 保持安装、可启动、并作为基准记录在案。

**回滚策略**：停掉 Token Monitor，继续用 TokenHub 即可。本变更**全程是增量式的**——不修改 TokenHub 的 `config.json`，不修改其代码，不删除其凭证。因此回滚不需要恢复任何数据，这是本方案最重要的安全属性。

## Open Questions

- **Q1**：Token Monitor 的 GLM 集成是否接受 `zhipuai-coding-plan` 这个 key 形态？（端点已确证接受，待验收确认其请求构造一致。）
- **Q2**：Token Monitor 的 CommandCode 5h / 周解析是否与 `1.506/14`、`2.8696/35` 完全吻合？（cap 已知相同，预期吻合。）
- **Q3**：其常驻内存在本机是否真为 110–120 MB？（数字来自其 issue #495，需装后实测。）
- **Q4**：其贴边折叠 + 悬停展开的**形态**（缩成贴边把手/图标，而非像 TokenHub 那样滑出屏幕绝大部分）是否符合使用者期望？触发范围是否也仅限窗口自身跨度？
- **Q5**：两套工具并发轮询是否会触发任何厂商限流？
- **Q6**：是否提交"自动读 `zhipuai-coding-plan`"的上游 PR？
- **Q7**：TokenHub 最终是退役还是长期保留为基准？——建议等 Token Monitor 完整跑过一个重置周期后再定。
