## Context

TokenHub 是一个纯标准库（tkinter + urllib）的 Windows 悬浮窗，把多个 AI 平台的用量以「厂商块」纵向堆叠展示，每 60 秒刷新一次（`src/main.py:47`）。当前有 3 个厂商：OpenCode Go、CommandCode、DeepSeek。

架构现状（决定了本次实现成本）：

- **没有任何 provider 抽象**。`ApiClient`（`src/api.py:74`）是一个扁平类，每个厂商一组并列方法；`main.py` 按名字显式调用每个 `fetch_*`；每个层级都硬编码着厂商列表并分支判断字符串键。
- **渲染层意外地可用**。`FloatingWindow.PROVIDERS`（`src/floating_window.py:58-71`）是一份声明式 spec，`_build_provider_block`（`:287-322`）遍历 `provider['metrics']`，每个 cell 用 `uniform='metric'`（`:320`）等宽 —— **指标数量是变长的**，2 个指标不需要改渲染逻辑。
- **窗口归类没有任何兜底**。`_section_reset_text`（`:365-369`）只对 `deepseek_*` 特判，其余一律 `距离重置: --`；`_apply_usage_section`（`:693-715`）用 `is_cc = section_key.startswith('cc_')`（`:333`）选择百分比格式化器。

外部接口现状（本次可行性依据）：

- 智谱官方**未公开**配额接口 —— `docs.z.ai/llms.txt` 与 `docs.bigmodel.cn/llms.txt` 两份完整文档索引里都没有 usage / quota / billing 端点。
- 但 Z.ai **自家**插件仓库 `zai-org/zai-coding-plugins` 的 `glm-plan-usage` 技能使用的 `GET {base}/api/monitor/usage/quota/limit` 可用，认证为 `Authorization: <裸 key>`。约 30 个社区项目（`guyinwonder168/opencode-glm-quota`、`jukanntenn/glm-plan-usage`、`BND-1/claude-hud-glm` 等）在打同一个路径。
- 返回形状与现有 CommandCode 通路同构：`data.limits[]` 里 `percentage`（0–100）与 `nextResetTime`（**毫秒** epoch）。而 `_cc_make_segment`（`src/api.py:491-509`）已经在做 `max(0, int(reset_at_ms / 1000.0 - time.time()))`（`:503`）—— 逐字相同的换算。
- **实盘校验（2026-09-15 实测）**：真实响应里 `type` 的值是 **`CREDIT_LIMIT`**，而不是社区 fixture 中的 `TOKENS_LIMIT`。实测返回两条：`unit=3, number=5, usage=2000, percentage=1` 与 `unit=6, number=1, usage=10000, percentage=10`，另含 `data.level = "lite"`。换算后前者的剩余时间为 17738s（4.93 小时，**满足 5 小时不变式**）、后者 272579s（3.15 天，满足每周不变式），且 `usage` 的 2000/10000 与已知的 Lite 档完全吻合。**结论：时间量级归类与两条不变式经实盘验证成立，但类型名必须放宽。**
- 已知不稳定点：`unit` 字段语义前后不一致（同一逻辑窗口在样本中出现过 `TIME_LIMIT` `unit:5` 与 `unit:0`）；官方仓库 issue #20 记录过 `nextResetTime` 曾缺失。

用户的实际约束：

- 只监控 `zhipuai-coding-plan`（**国内**凭证，位于 `C:\Users\29871\.local\share\opencode\auth.json`），只显示 **5 小时用量 / 每周用量**两个指标。
- CommandCode 块零改动（`goat` 仅为套餐档位名称，仓库中不存在任何档位概念）。
- 对密钥泄露敏感：已确认应用无遥测、出站仅 3 个厂商域名；关心的是"把密钥再存一份"带来的落盘风险。

实测的权限现状（本次新增关注点的直接证据）：

```
auth.json  (凭证现址)   只对  当前用户 / SYSTEM / Administrators  可读
                         路径 C:\Users\29871\.local\share\opencode\auth.json

config.json (拟议目标)   BUILTIN\Users:(I)(RX)              任何本机账户可读
                          BUILTIN\Authenticated Users:(I)(M)  任何本机账户可改
                         路径 <项目>\src\config.json
```

`(I)` 表示继承 —— `config.json` 继承自 `D:\` 根目录的宽松默认 ACL，而 `auth.json` 继承自被 Windows 锁死的用户目录。

## Goals / Non-Goals

**Goals:**

- 在悬浮窗上以第 4 个厂商块展示 GLM Coding Plan 的 5 小时与每周额度，含重置倒计时。
- 在 `unit` 字段不可信的前提下，**保证两个窗口不会显示颠倒**。
- GLM 凭证在磁盘上**只有一份**（保留在 OpenCode 的 auth store 中），TokenHub 不产生副本。
- 消除 `set_columns` 的位置参数顺序陷阱，避免后续再加厂商时静默错位。
- 收紧配置目录的 ACL，使持久化凭证不再对 `BUILTIN\Users` 可读；该收益覆盖已有 3 个凭证。

**Non-Goals:**

- 不显示月窗口（`TIME_LIMIT`）与计划等级（`level`）。`TIME_LIMIT` 是 **MCP 工具调用额度**而非月度 token 额度，且其 `nextResetTime` 常为 `null`（倒计时会长期显示 `--`），用户已确认不做（Q6 结案）。GLM 块维持 2 个指标。
- 不引入 provider 注册表 / 抽象基类 / 声明式调度表（见决策 D4）。
- 不支持全球主机 `api.z.ai` 的运行时切换（仅在设计上预留 `glm_host` 字段，见 Q2）。
- 不改动 `settings_window.py` 中既有的 OpenCode / CommandCode / DeepSeek 设置节与其 curl 解析流程。
- 不在设置界面为**既有**厂商加掩码显示（`settings_window.py:166,262,313` 的明文回填）。这属于肩窥/投屏威胁，与本次的落盘威胁不同，用户已确认暂不做（Q4 结案）。
- 不新增第三方依赖；不新增子进程调用（D10 的改动只落在构建脚本 `build.py` 本身，不进入应用运行时）。

## Decisions

### D1 — GLM 凭证只读不存，而非复制进 `config.json`

**决定**：`config.json` 只写 `glm_source: "auto"` 与 `glm_host`；密钥在每次请求前从 OpenCode auth store 现读。

**理由**（实测驱动）：`config.json` 位于 `D:\桌面\...`，其 ACL 继承自 `D:\` 根目录，实测对 `BUILTIN\Users` 可读、对 `BUILTIN\Authenticated Users` 可写；而 `auth.json` 仅当前用户 / SYSTEM / Administrators 可读。把密钥复制过去，等于把暴露面从"只有你的账户"扩大到"本机任何可登录账户"。不落盘则密钥在本机上始终只有 1 份，**比现状更安全**。

**已考虑的替代方案：**

| 方案 | 评估 |
|---|---|
| 手动粘贴（与现有 3 个厂商一致） | 可行，但密钥落盘 2 份，且用户需自行从 curl 中剥离密钥。选它会把风险面翻倍。 |
| 自动读 + 复制进 `config.json` | 用户体验最好，但落盘 2 份且新增一个宽松 ACL 的副本，纯亏。否决。 |
| 自动读 + 落盘时加密（DPAPI） | 安全性够，但需引入 Windows 专有 API 调用与密钥迁移逻辑，成本远高于收益。作为将来可选增强，不在本次范围。 |

**副作用**：更换密钥时只改一处；但 auth store 缺失/改名会使 GLM 块失效，因此必须实现明确的失败态（已在 spec 中列为四个场景）。

### D2 — 窗口归类依据 `nextResetTime` 的时间量级，而非 `unit`

**决定**：不读 `unit` 做归类。把 `TOKENS_LIMIT` 条目按 `nextResetTime` 升序排列，最早的进 5 小时档、最晚的进每周档；随后用硬不变式校验 —— 5 小时档剩余 ≤ 18000 秒、每周档剩余 ≤ 604800 秒；违反则交换。

**理由**：`unit` 已被观察到前后不一致，而"5 小时窗口的剩余时间不可能超过 5 小时"是接口无法违反的性质。**把不可靠的外部契约替换为可验证的内部不变式**，即使上游改了 `unit` 取值也不会显示颠倒。

**替代方案**：硬编码 `unit == 3` → 5h、`unit == 6` → weekly（社区主流做法）。否决：上游已出现过不一致取值，且用户只要这两个窗口，一旦颠倒即为两个数字全错、且从界面上看不出来（都是百分比 + 倒计时）。

**代价**：规则比查表复杂约 15 行；单条 `TOKENS_LIMIT` 时需退化规则（>86400 秒归周档），已写入 spec 场景。

**实盘追加决策（2026-09-15）**：`type` 过滤放宽为允许列表 `('CREDIT_LIMIT', 'TOKENS_LIMIT')` —— 实盘值是前者，后者是旧名（智谱 2026-07-30 从 prompts 迁移到 credits 时改了类型名，社区 fixture 仍是旧值）。并追加**兜底**：允许列表命中 0 条但 `limits` 非空时，退化到「`type` 为非空字符串且不等于 `TIME_LIMIT`」的条目，并记一条 `logger.info`（只含观察到的类型名）。

**兜底为何必要**：类型名过滤失效时的表现是**静默的** —— 两格都显示 `--`，看上去像"没有额度"，而不像"过滤器坏了"。上游已经无预告改过一次名，不加兜底等于把这个静默失败模式固化下来。

**次级观察（记录备用）**：响应还带 `usage` / `currentValue` / `remaining` 绝对值。本次按用户决策只展示百分比，绝对值可作将来扩展。

### D3 — 目标主机固定为国内 `open.bigmodel.cn`

**决定**：端点常量化在 `src/api.py`，与现有厂商常量同处（`:80-86` 一带）。

**理由**：用户的凭证来自 `auth.json` 的 `zhipuai-coding-plan` 条目，属国内区域；`api.z.ai` 会返回认证失败。两个区域是不通用的。

**替代方案**：双主机探测（先试全球再试国内）。否决：会把 GLM 凭证发往凭证所属厂商之外的另一台主机（`api.z.ai`），违反 spec 中"凭证只发往 `open.bigmodel.cn`"的约束，也违背用户对出站面的在意。

### D4 — 照抄为第 4 个厂商，而非引入 Provider 注册表

**决定**：按 CommandCode 的既有模式机械扩展，不重构数据通路。

**理由**：注册表的收益来自摊薄"第 N 个厂商"的成本。本次 N 从 4 起跳且只加 1 个厂商、只要 2 个指标，摊薄效应弱；而重构需要改动 3 个正在工作的厂商，回归风险成为主要成本。这是对早前"先重构"建议的**主动修正**。

**唯一保留的小重构**：见 D5 —— 它收益占大头、成本约 10 行。

**已知代价（记录以便将来决断）**：厂商身份此后仍分散在 4 套命名方案中（config 前缀 `glm_`、回调键 `'glm'`/`'glm_error'`、section 前缀 `glm_`、显示名 `GLM`）。注意既有代码已经是这样且**已经自相矛盾**：CommandCode 的回调键是 `'cc'`（`src/api.py:471`）而 config 前缀是 `commandcode_`（`src/config.py:44`）。第 5 个厂商时阴影成本会上升，届时再评估注册表。

### D5 — `set_columns` 由位置参数改为按身份传参

**决定**：`FloatingWindow.set_columns`（`src/floating_window.py:379-403`）改为接收以 provider key 为键的映射（或关键字参数），2 个调用点（`src/main.py:118`、`:168`）同步更新。

**理由**：现状签名顺序 `(opencode, deepseek, commandcode)`（`:379-380`）与 `PROVIDERS` 顺序 `(opencode, commandcode, deepseek)`（`:58-71`）**本就不一致**。再加第 4 个位置布尔参数是明确的静默错位风险。这一个动作消掉最可能咬人的雷，成本约 10 行。

### D6 — ACL 加固作用于目录而非文件

**决定**：在项目目录层断开继承并授予当前用户独占，而不是对 `config.json` 单文件设 ACL。

**理由**：`config.json` 由应用反复重写。若在文件层设置，一旦文件被删除重建（而非就地截断），ACL 会退回继承态。目录层加固可被子文件继承，重写后依然生效 —— 这已被写成 spec 中的一个场景（"Hardening survives a rewrite"）。

**形态**：这是一次性的环境操作（`icacls`），不是应用代码；因此 spec 要求的是"加固后的可验证状态"与"未加固时的文档说明"，tasks 中列为一步并附带验证命令。

### D7 — GLM 的 section 键命名为 `glm_*`，不复用 `is_cc` 格式化路径

**决定**：section 键用 `glm_rolling` / `glm_weekly`。

**理由**：`is_cc` 由前缀推导（`src/floating_window.py:333`），且 `_fmt_cc_pct`（`:652-662`）是为 CommandCode 的小分数百分比设计的（封顶 100、去小数尾巴）。GLM 的 `percentage` 本身即 0–100，套用该逻辑属于反向扭曲。走 `is_cc=False` 分支（`:712-715`）的 `f"{percent}%"` 即正确。

**已知小瑕疵**：若上游返回 `50.0` 这类浮点，会显示 `50.0%` 而非 `50%`。属外观问题，见开放问题 Q3。

### D8 — 出站面新增 1 个域名，且无新增依赖与子进程

**决定**：唯一新增出站目标为 `open.bigmodel.cn`。不引入第三方库，不引入子进程。

**理由**：上一轮审计把"无子进程、无遥测、无 TLS 降级、全 HTTPS"列为已验证的干净项；本次不得破坏这些性质。ACL 加固刻意做成外部一次性操作（D6）而非应用内调用 `icacls`，正是为了不引入子进程。

### D9 — 端点常量集中且标注来源

**决定**：GLM URL 与超时常量放在 `src/api.py` 厂商常量区，并在注释中标注来源为 `zai-org/zai-coding-plugins` 的官方脚本，同时注明该端点**未公开文档化**。

**理由**：这是唯一的可维护性抓手 —— 上游变更时（已发生过一次）需要能立刻定位到常量与来源依据。

### D10 — 构建产物中不再备份/恢复 `dist/config.json`

**决定**：修改 `build.py:6-30`，使构建清理步骤直接删除 `dist/config.json`，并移除跨构建的备份与恢复逻辑。

**理由**：该备份/恢复逻辑让开发者本机的真实凭证在每次重新构建后重新出现于 `dist/` 中，一旦 `dist/` 被打包分发，凭证即随之外流。`CHANGELOG.md:57` 显示历史上确实存在过带真实凭证的 `dist/config.json`。这与本次"收紧密钥落盘面"的目标直接冲突，用户已确认修复（Q5 结案）。

**替代方案**：仅在文档中提醒"分发前手动删除"。否决 —— 这是可自动化的机械步骤，靠人工提醒会再次漏掉。

**副作用**：本地开发者在 `dist/` 中复用配置的习惯需改为从应用内设置重新配置。`dist/` 已存在于 `.gitignore`，不影响版本管理。

### D11 — `openspec/` 纳入 git 版本管理并提交到本地 `main`

**决定**：`openspec/` 不加入 `.gitignore`，纳入版本控制并直接提交到本地 `main` 分支。初始提交为规划产物，实现完成后再提交一次。

**理由**（用户决定）：规划产物需要可追溯。实测 `.gitignore` 已覆盖 `config.json`（无路径前缀，匹配任意层级）、`tokenhub.log`、`dist/`，`openspec/` 不在其中，因此**无需改动 `.gitignore`**。

**约束与已知风险**：

- `origin` 指向第三方仓库 `https://github.com/2700zc/TokenHub.git`。提交到本地 `main` 会使本地分叉，**`git push` 会被拒绝**（无上游写入权限）。这是被接受的取舍：本次目的为本地版本管理，不涉及上游协作；若将来需要，应先 fork 再添加 remote。
- 仓库**没有任何 git 身份配置**（`C:/Users/29871/.gitconfig` 不存在；系统级无 `user.name` / `user.email`；`gh` CLI 未安装），`git commit` 会直接失败。已设置**仓库本地**身份以解除阻塞（`--global` 未被污染，不影响其它仓库）。
- 提交**不得**包含 `config.json` 或 `tokenhub.log` —— 二者已在 `.gitignore` 中，提交前需用 `git status` 复核。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| `unit` 语义再次变化导致窗口颠倒 | D2 的时间量级归类 + 硬不变式交换，不依赖 `unit` |
| `nextResetTime` 缺失（官方 issue #20 曾发生） | 按可空处理：保留百分比，倒计时显示 `--`（已有模式） |
| 端点未文档化，可能无预告变更或下线 | 常量集中 + 来源注释（D9）；失败态隔离在 GLM 块，不影响其它 3 个厂商（spec 场景已覆盖）。**已实际发生过一次**：`type` 从 `TOKENS_LIMIT` 变成 `CREDIT_LIMIT`（2026-09-15 实测），由 D2 的允许列表 + 兜底覆盖 |
| 上游再次重命名 `type` 导致静默显示 `--` | D2 的兜底（允许列表未命中时取非 `TIME_LIMIT` 条目）+ `logger.info` 记录未识别类型名；故障从静默变为可观测 |
| auth store 路径或结构变化（OpenCode 升级） | 失败态覆盖"文件不存在 / 无该条目 / JSON 非法"三种；错误提示指明期望位置 |
| 读取外站凭证被误解为安全问题 | 出站目标唯一且属该凭证的所属厂商；凭证不落盘（D1）；日志不含明文（spec 要求）；此决策及其证据记录于 D1 |
| ACL 加固被后续 git 操作或重新 clone 覆盖 | spec 明确"未加固时文档需说明可读性"；tasks 附验证命令，可重复执行 |
| 第 4 个块使窗口变高 | 实测 `height = 57n + 11`（`src/floating_window.py:230`）→ 4 块 239px，可接受；厂商标签列宽 126px（`:47`）且 `pack_propagate(False)`（`:302`）会裁切超长文字，因此显示名用短标签 `GLM`，全称放帮助 |
| 沿用复制粘贴模式使厂商命名方案继续分裂 | 记录为 D4 的已知代价；第 5 个厂商时重新评估注册表 |
| 移除 `dist/config.json` 恢复逻辑后，本地开发者在 `dist/` 中沿用的配置会消失 | D10 已记录该副作用；改为从应用内设置重新配置。这本身即修复目标，不是回归 |
| 提交到本地 `main` 后无法 `git push`（origin 为第三方仓库） | D11 已记录为被接受的取舍；需要上游协作时先 fork 再加 remote |
| 提交误带 `config.json` / `tokenhub.log` | 二者已在 `.gitignore` 中；提交前用 `git status` 复核，并对暂存区做一次凭证串搜索 |

## Migration Plan

1. **加固 ACL**（一次性，先做，使新键从诞生起就是紧权限）：对项目目录执行 `icacls` 断开继承并授予当前用户独占，随后用 `icacls` 核对 `BUILTIN\Users` 不再出现。
2. **落代码**：按 tasks.md 顺序（api → config → main → floating_window → settings/help/logger），每层改完立即跑一次 `python src/main.py` 目视第 4 个块。
3. **配置迁移**：无需迁移。`config.json` 缺 `glm_*` 键时按默认值（禁用）加载，与既有的 `load()` 内联默认模式一致（`src/config.py:61-65`）。
4. **回滚**：设置界面关闭 GLM 开关即停止渲染与请求（配置层回滚）；完全回滚 = `git revert` 本次提交，且因无新增依赖、无数据迁移，不存在残留状态。已加固的 ACL 不回滚（它是独立的环境改进，且不影响功能）。
5. **构建产物清理**：按 D10 修改 `build.py` 的 `clean()`，删除 `dist/config.json` 并移除备份/恢复逻辑。这是对既有 3 个凭证分发泄漏路径的修复，独立于 GLM，但与本能力的"落盘面收紧"目标同类。
6. **提交**：按 D11 将规划产物提交到本地 `main`；实现完成后再提交一次。

## Open Questions

已结案（用户已决策）：

- **Q1（已结案 → 纳入版本管理）**：`openspec/` 不加入 `.gitignore`，直接提交到本地 `main`。取舍、`push` 受限与身份配置见 D11。
- **Q4（已结案 → 暂不做）**：暂不为**既有**厂商的明文显示（`src/settings_window.py:166,262,313`，均未使用 `show='*'`）补掩码。该威胁为肩窥/投屏，与本次的落盘威胁不同，留待单独评估。对应 Non-Goal 保留。
- **Q5（已结案 → 纳入范围）**：修复 `build.py:6-30` 对 `dist/config.json` 的备份/恢复行为。见 D10。
- **Q6（已结案 → 不做）**：不补第 3 个指标。`TIME_LIMIT` 是 MCP 工具调用额度而非月度 token 额度，且 `nextResetTime` 常为 `null`，用户确认不做；`level` 亦不展示。GLM 块维持 2 个指标。

仍待将来决定：

- **Q2（暂不做）**：是否支持全球主机 `api.z.ai` 的运行时切换？本次以 `glm_host` 字段预留扩展位。
- **Q3（暂不做）**：百分比为浮点时（上游返回 `50.0`）是否本地格式化去掉多余的 `.0`？属外观问题，不影响正确性。
