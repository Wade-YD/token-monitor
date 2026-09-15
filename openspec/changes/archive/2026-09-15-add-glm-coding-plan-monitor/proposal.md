## Why

TokenHub 目前只能监控 OpenCode Go、CommandCode、DeepSeek 三个厂商（`src/floating_window.py:58-71`），但用户实际在用的 GLM Coding Plan（OpenCode 中的 `zhipuai-coding-plan` 凭证）**不在覆盖范围内**。这个额度是三个已监控项之外消耗最快的一项，目前只能打开网页后台才能看到剩余量和重置时间，无法在悬浮窗上一眼掌握。

现在做的可行性依据：智谱官方未公开配额接口，但 **Z.ai 自家插件仓库**（`zai-org/zai-coding-plugins` → `glm-plan-usage` 技能）使用的 `GET /api/monitor/usage/quota/limit` 已被官方脚本 + 约 30 个社区项目验证可用，返回百分比与重置时间戳，**数据形状与现有 CommandCode 通路同构**（`percentage` + `nextResetTime` 毫秒 epoch），因此新增成本明显低于此前加入任一厂商的成本。

## What Changes

- 新增第 4 个厂商块「GLM」，**只显示 2 个指标**：`滚动用量（5小时）` 与 `每周用量`，各自带 `距离重置: …` 倒计时。不显示月窗口（`TIME_LIMIT`），不显示计划等级（`level`）。
- 新增 GLM 数据通路：`build_glm_headers` / `_glm_get` / `fetch_glm` / `parse_glm`，请求**国内主机** `https://open.bigmodel.cn/api/monitor/usage/quota/limit`，认证头为 `Authorization: <raw key>`（裸 key，无 `Bearer` 前缀，按官方脚本写法）。
- 新增**窗口归类自校验**：不信任接口的 `unit` 字段（已知同一 `TIME_LIMIT` 在不同样本中出现过 `unit:5` 与 `unit:0`），改为按 `nextResetTime` 的时间量级归类「5小时 / 每周」，并以硬不变式兜底 —— 5h 窗口剩余 ≤ 18000 秒、每周窗口剩余 ≤ 604800 秒；违反则判定映射颠倒并自动交换。
- GLM 凭证**只读不存**：`config.json` 仅记录 `glm_source: "auto"`（来源标记）与 `glm_host`，运行期从 OpenCode 的 `auth.json` 现读 `zhipuai-coding-plan.key`，**不在 TokenHub 侧产生第二份明文副本**。这样 GLM 的 key 在磁盘上始终只有 1 份。
- 设置界面新增「GLM」一节，显示自动读取状态（`已自动读取` / `未找到凭证`）而非密钥输入框，并提供启用/停用该厂商块的开关。
- `FloatingWindow.set_columns` 的**位置参数改为关键字传参**（内部签名变更，2 个调用点同步更新）：现状 `(opencode, deepseek, commandcode)`（`src/floating_window.py:379-380`）与 `PROVIDERS` 顺序 `(opencode, commandcode, deepseek)`（`:58-71`）本就不一致，再加第 4 个位置布尔参数是明确的写错风险。
- 目录 ACL 加固：把 TokenHub 目录的继承权限收紧为当前用户独占，使 `config.json` 不再对 `BUILTIN\Users` 可读。实测现状为 `BUILTIN\Users:(I)(RX)` + `BUILTIN\Authenticated Users:(I)(M)`（继承自 `D:\` 根目录的宽松 ACL），而凭证所在的 `auth.json` 仅当前用户 + SYSTEM + Administrators 可读 —— 即**本机任何可登录账户都能读改 `config.json`**。该修复同时保护已存在的 3 个凭证。
- 修复构建产物泄漏路径：`build.py:6-30` 目前在 `clean()` 时备份并在构建后**恢复** `dist/config.json`，使开发者本机的真实凭证跨构建存活、并可能随分发包外流（`CHANGELOG.md:57` 显示曾真实存在过这样的文件）。改为 `clean()` 直接删除 `dist/config.json` 且不做备份/恢复。
- 将 `openspec/` 规划目录纳入 git 版本管理，直接提交到本地 `main`（不加入 `.gitignore`）。实测 `.gitignore` 已覆盖 `config.json` / `tokenhub.log` / `dist/`，`openspec/` 不在其中。

## Capabilities

### New Capabilities

- `glm-coding-plan-monitor`: GLM（智谱）Coding Plan 额度的采集、归类与展示 —— 国内 quota 接口轮询、窗口自校验归类、只读不存的凭证解析、2 指标厂商块渲染、以及凭证缺失/认证失败/重置时间缺失时的降级行为。
- `credential-storage-hardening`: 本地凭证存储面的收紧 —— 配置目录 ACL 独占、密钥值永不进入日志、自动读取型凭证不落盘、构建产物不含凭证。

### Modified Capabilities

（无。本仓库尚无 `openspec/specs/` 目录，本次不修改任何既有能力规格。）

## Impact

- `src/api.py` — 新增 GLM 常量与 `build_glm_headers` / `_glm_get` / `fetch_glm` / `parse_glm`；复用 `format_reset_time`（`:220-236`）与 `_cc_make_segment` 的重置换算语义（`:503` 的 `reset_at_ms / 1000.0 - time.time()`）。
- `src/config.py` — 新增 `glm_enabled` / `glm_source` / `glm_host`，需落在 4 处：`__init__`（`:41-45`）、`load()`（`:61-65`）、`JSONDecodeError` 兜底（`:71-75`）、`save()`（`:84-88`）；新增 `glm_is_valid()`。
- `src/main.py` — `_fetch_data`（`:176-209`）新增分支；`_process_data_queue`（`:211-237`）新增 `glm` / `glm_error` 分支；两处 `set_columns` 调用（`:118`、`:168`）随签名变更调整；新增 auth.json 凭证解析。
- `src/floating_window.py` — `PROVIDERS`（`:58-71`）新增一行（2 个 metric）；新增 `_glm_enabled`；`_num_providers`（`:217-223`）与 `_active_providers`（`:233-240`）扩展；`set_columns`（`:379-403`）改关键字传参；`update_data`（`:601-641`）新增分支。
- `src/settings_window.py` — 新增 GLM 设置节；`_save`（`:416-474`）与 `_reset`（`:482-494`）扩展。
- `src/help_window.py` — `HELP_CONTENT`（`:16-143`）新增 GLM 使用说明。
- `src/logger.py` — `log_api_response`（`:86-89`）新增 GLM 分支；新增 `log_glm()`。
- `src/config.json` — 新增 3 个键（**不含密钥值**）。
- `build.py` — 修改 `clean()`（`:6-30`），删除 `dist/config.json` 并移除跨构建的备份/恢复逻辑。
- **不改动**：CommandCode 块（`goat` 只是套餐档位，无需代码变更）、OpenCode/DeepSeek 通路、`_apply_usage_section`（`:693-715`）与 `_section_reset_text`（`:365-369`）—— 2 指标块完全复用现有渲染与格式化逻辑。
- **依赖**：无新增第三方依赖（继续只用标准库 `urllib`）。
- **网络**：新增 1 个出站目标 `open.bigmodel.cn`，属该凭证的所属厂商，不引入任何中转或遥测。
- **新增规划目录**：`openspec/` —— 纳入 git 版本管理（不加 `.gitignore`），提交到本地 `main`。注意 `origin` 指向第三方仓库，本地提交后 `git push` 会被拒绝，详见 design.md D11。
