## 1. 环境加固（一次性，先做）

- [x] 1.1 对项目目录断开 ACL 继承并授予当前用户独占：`icacls "<项目根>" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"`
- [x] 1.2 验证 `src\config.json` 的 ACL 不再包含 `BUILTIN\Users` 与 `BUILTIN\Authenticated Users`；确认只剩当前用户 / SYSTEM / Administrators。记录加固前后的 `icacls` 输出作为对照
- [x] 1.3 验证加固可跨重写存活：启动应用触发一次配置保存，重新 `icacls` 确认权限未被放宽（对应 spec「Hardening survives a rewrite」）
- [x] 1.4 在 `README.md` 的配置说明处补充：未加固时其它本机账户可读 `config.json`，并给出上面两条命令（对应 spec「Hardening not applied」）

## 2. 构建产物凭证泄漏修复（build.py）

- [x] 2.1 阅读 `build.py:6-30` 的 `clean()`，确认当前的 `dist/config.json` 备份路径与构建后的恢复逻辑
- [x] 2.2 移除备份/恢复逻辑，改为 `clean()` 直接删除 `dist/config.json`（对应 design D10）
- [x] 2.3 确认 `dist/` 仍在 `.gitignore` 中，且 `build.py` 文档字符串/注释仍准确描述清理行为
- [x] 2.4 验证：连续执行两次 `python build.py`，确认第二次构建后 `dist/` 中不存在从上一次构建延续来的 `config.json`（对应 spec「Rebuild does not restore a previous configuration」）
- [x] 2.5 验证：构建完成后检查 `dist/` 目录内无任何含凭证值的文件（对应 spec「Distribution contains no credentials」）

## 3. API 层（src/api.py）

- [x] 3.1 在厂商常量区（紧随 `src/api.py:84-86` 的 CommandCode 常量之后）新增 `GLM_QUOTA_URL = "https://open.bigmodel.cn/api/monitor/usage/quota/limit"` 与 `GLM_TIMEOUT = 10`，注释中标注端点来源为 `zai-org/zai-coding-plugins` 的 `glm-plan-usage` 官方脚本，并注明该端点未公开文档化（对应 design D3 / D9）
- [x] 3.2 新增 `build_glm_headers(self, key: str) -> Dict[str, str]`：`Authorization: <key>`（裸 key，无 `Bearer` 前缀）、`Accept: */*`、`Content-Type: application/json`、`Accept-Language: en-US,en`、`User-Agent`（对应 design D3）
- [x] 3.3 新增 `_glm_get(self, url: str, key: str) -> Any`：同步 GET + `json.loads`，调用 `log_api_request`，比照 `_cc_get`（`src/api.py:452-458`）的实现
- [x] 3.4 新增窗口归类私有函数（如 `_glm_classify_windows(limits: list) -> Dict`）：
  - 只取 `type` 属于 `('CREDIT_LIMIT', 'TOKENS_LIMIT')` 的条目（**实测线上值为 `CREDIT_LIMIT`**，`TOKENS_LIMIT` 为旧名），**不读 `unit`**；排除 `TIME_LIMIT`（MCP 工具额度）
  - 兜底：若允许列表命中 0 条但 `limits` 非空，退化到「`type` 为非空字符串且不等于 `TIME_LIMIT`」的条目，并以 `logger.info` 记录观察到的未识别类型名（只记类型名，不记任何凭证）
  - 按 `nextResetTime` 升序排序，最早 → `rolling`，最晚 → `weekly`
  - 硬不变式校验：`rolling` 的剩余 ≤ 18000 秒、`weekly` 的剩余 ≤ 604800 秒；违反则交换两者
  - 仅 1 条 `TOKENS_LIMIT` 时：剩余 > 86400 秒 → 归 `weekly`，`rolling` 置为不可用
  - 0 条 `TOKENS_LIMIT` 时：两者均置为不可用
  - `nextResetTime` 为 `null` / 缺失时：保留百分比，`reset_sec = None`
  （对应 design D2）
- [x] 3.5 新增 `parse_glm(self, data: Any) -> Dict`：`code != 200` 时抛 `ValueError`；复用 `format_reset_time`（`src/api.py:220-236`）与 `_cc_make_segment` 的毫秒换算语义（`src/api.py:503` 的 `reset_at_ms / 1000.0 - time.time()`）；返回 `{'rolling': seg, 'weekly': seg}`，segment 形态与 CommandCode 一致：`{'percent', 'reset_sec', 'reset_time', 'status'}`
- [x] 3.6 新增 `fetch_glm(self, key: str, callback)`：照 `fetch_commandcode`（`src/api.py:460-489`）的结构，启守护线程；成功回调 `{'glm': <parse_glm 结果>}`；异常回调 `{'glm_error': msg}`；分别覆盖 `HTTPError` / `URLError` / 通用 `Exception`
- [x] 3.7 确认新增代码未引入 `subprocess`、未引入第三方依赖、未降级 TLS（对应 design D8）

## 4. 配置层（src/config.py）

- [x] 4.1 在 `__init__`（`src/config.py:41-45` 之后）新增：`self.glm_enabled = False`、`self.glm_source = "auto"`、`self.glm_host = "open.bigmodel.cn"`
- [x] 4.2 在 `load()`（`src/config.py:61-65` 之后）新增对应 `.get()` 默认值读取
- [x] 4.3 在 `JSONDecodeError` 兜底块（`src/config.py:71-75`）同步补上三个默认值
- [x] 4.4 在 `save()` 的字典（`src/config.py:84-88` 之后）新增三个键，**确保不写入任何密钥值**
- [x] 4.5 新增 `glm_is_valid(self) -> bool`：返回 `self.glm_enabled`（密钥来源是文件而非配置，故只校验启用状态）；比照 `commandcode_is_valid`（`src/config.py:102-104`）

## 5. 凭证解析（src/main.py）

- [x] 5.1 新增模块级函数解析 OpenCode auth store，路径按优先级尝试 `~/.local/share/opencode/auth.json` 再回退 `%LOCALAPPDATA%\opencode\auth.json`
- [x] 5.2 读取 `['zhipuai-coding-plan']['key']`；对以下四种失败态返回 `None` 而不抛异常：文件不存在、JSON 非法、缺少 `zhipuai-coding-plan` 条目、条目内无 `key`
- [x] 5.3 确认该函数**不把解析结果写入 `config.json`**；仅作为每次请求的入参传递（对应 design D1）

## 6. 编排层（src/main.py）

- [x] 6.1 在 `_fetch_data`（`src/main.py:176-209`）新增 GLM 分支，比照 CommandCode 分支（`:194-202`）：
  - `glm_enabled` 且凭证解析成功 → 调用 `fetch_glm`
  - `glm_enabled` 但凭证缺失 → 记录明确的日志（说明在 auth store 中的期望位置），不发起请求
  - `glm_enabled == False` → 静默跳过
- [x] 6.2 在 `_process_data_queue`（`src/main.py:211-237`）新增 `'glm_error'` 与 `'glm'` 两个分支，透传给 `update_data`
- [x] 6.3 更新 `src/main.py:118` 与 `src/main.py:168` 两处 `set_columns` 调用点，改用按身份传参的新形式（对应 design D5）
- [x] 6.4 在 `src/main.py` 的两份导入清单（脚本模式与包模式各一份）中补上新增的 logger 符号

## 7. 渲染层（src/floating_window.py）

- [x] 7.1 在 `PROVIDERS`（`src/floating_window.py:58-71`）新增 GLM 条目：`{'key': 'glm', 'name': 'GLM', 'color': <新色值>, 'metrics': [('glm_rolling', '滚动用量'), ('glm_weekly', '每周用量')]}`。**显示名用短标签 `GLM`** —— 厂商标签列宽 `VENDOR_WIDTH = 126`（`:47`）且 `pack_propagate(False)`（`:302`）会裁切超长文字（对应 design D7 与风险表）
- [x] 7.2 新增 `self._glm_enabled` 实例属性（比照 `:90-92`）
- [x] 7.3 扩展 `_num_providers`（`:217-223`）计入 GLM
- [x] 7.4 扩展 `_active_providers` 的 `enabled_map`（`:233-240`）加入 `'glm'`
- [x] 7.5 修改 `set_columns`（`:379-403`）签名，由位置布尔参数改为按 provider key 传参，并同步更新内部对三个既有标志位的比较与赋值逻辑（对应 design D5）
- [x] 7.6 在 `update_data`（`:601-641`）新增 GLM 分支，比照 CommandCode 分支（`:614-622`）：`'glm_error'` → 清空 `glm_rolling` / `glm_weekly`；`'glm'` → 逐项 `_apply_usage_section`
- [x] 7.7 **确认不改动** `_apply_usage_section`（`:693-715`）与 `_section_reset_text`（`:365-369`）。GLM 走 `is_cc=False` 分支即可正确渲染 `{percent}%` + `距离重置: {reset_time}`，且 `_section_reset_text` 对非 `deepseek_*` 键天然返回 `距离重置: --`（对应 design D7）

## 8. 设置界面（src/settings_window.py）

- [x] 8.1 新增 GLM 设置节（置于 DeepSeek 节 `:291-327` 之后）：启用/停用复选框 `显示 GLM 用量`，加一个**只读状态标签**（不是输入框）显示凭证来源状态
- [x] 8.2 状态标签依据 auth store 解析结果显示两种文案：自动读取成功 / 未找到凭证（并指明期望路径）；复用第 5 步的解析函数，避免逻辑重复
- [x] 8.3 在 `_save`（`:416-474`）中写入 `glm_enabled`；**不写入任何密钥值**（对应 spec「Credential not persisted」）
- [x] 8.4 在 `_reset`（`:482-494`）中重置 GLM 相关控件
- [x] 8.5 确认未给 GLM 提供任何可显示或存储密钥值的输入框（对应 spec「Settings section opened」）

## 9. 日志（src/logger.py）

- [x] 9.1 在 `log_api_response`（`src/logger.py:86-89`）新增 GLM 分支
- [x] 9.2 新增 `log_glm(...)`：比照 `log_commandcode`（`:109` 一带），只输出百分比与重置信息，**不得输出任何密钥子串**，凭证状态只以「已自动读取 / 未找到」形式记录

## 10. 帮助文档（src/help_window.py）

- [x] 10.1 在 `HELP_CONTENT`（`:16-143`）新增「第 7 步：GLM Coding Plan」段落，说明：凭证从 OpenCode auth store 自动读取、不需要手动粘贴、GLM 块只显示 5 小时与每周两项、以及未找到凭证时该去哪里检查

## 11. 验证

- [x] 11.1 静态检查：`python -c "import compileall,sys; sys.exit(0 if compileall.compile_dir('src', quiet=1) else 1)"` 通过
- [x] 11.2 启动复核：`python src/main.py`（或 `pythonw src/main.py`），目视确认出现第 4 个厂商块，且窗口高度按 `height = 57n + 11`（`src/floating_window.py:230`）变为 4 块对应的 239px
- [x] 11.3 正向数据验证：确认 GLM 块两格分别显示 5 小时与每周的百分比与倒计时，且**数值与网页后台一致**（这是 D2 归类规则正确性的唯一权威校验）
- [x] 11.4 归类鲁棒性验证：构造两个只交换 `unit` 取值的响应样本，确认渲染结果不变（对应 spec「Unit codes are inconsistent or unexpected」）
- [x] 11.5 失败态验证（逐个确认不崩溃且不影响其它三个厂商块）：auth store 文件不存在 / JSON 非法 / 无 `zhipuai-coding-plan` 条目 / 密钥无效导致 `code != 200` / `nextResetTime` 为 `null`
- [x] 11.6 凭证不落盘验证：执行一次成功的 GLM 请求后，检查 `src\config.json` 全文不含密钥值（对应 spec「Credential not persisted」）
- [x] 11.7 日志洁净度验证：检查 `tokenhub.log` 与标准输出，确认不含 GLM 密钥的任何子串，凭证状态仅以掩码/布尔形式出现
- [x] 11.8 开关验证：设置中关闭 GLM → 块消失且窗口高度回落；重新开启并保存 → 块恢复（以程序化方式覆盖整条链路，未以人手点击复选框）：复选框 → config 写入 → `on_save` → `set_columns` → 重建，两段均断言通过。GLM 关 → 1 块 / 760×68，开 → 2 块 / 760×125；重建后单元格仍能接收数据，且不牵连其它厂商。仅剩 Tk 自身的「点击 → 变量」传递未覆盖（框架行为）
- [x] 11.9 出站面验证：确认新增出站目标仅 `open.bigmodel.cn`，未向 `api.z.ai` 或任何其它主机发送过 GLM 凭证（对应 spec「Credential destination is constrained」）
- [x] 11.10 回归验证：确认 OpenCode / CommandCode / DeepSeek 三个块与既有设置节行为不变，特别是 `set_columns` 签名变更后三处可见性组合均正确
- [x] 11.11 运行 `openspec validate add-glm-coding-plan-monitor --strict` 通过

## 12. git 版本管理（对应 design D11）

- [x] 12.1 确认仓库本地 git 身份已设置（`git config user.name` / `user.email` 非空）；如为占位值，提醒用户改为自己的真实身份
- [x] 12.2 `git status` 复核暂存范围：只应包含 `openspec/`（规划产物），**不得**出现 `config.json`、`tokenhub.log`、`dist/`
- [x] 12.3 对暂存内容做一次凭证串检查：确认 `git diff --cached` 中不含 `auth=`、`Bearer `、`session_token`、`sk-` 等真实凭证值
- [x] 12.4 提交规划产物：`git add openspec/` 后以描述性信息提交（例如 `docs(openspec): 新增 GLM Coding Plan 用量监控提案`）
- [x] 12.5 实现全部完成并验证通过后，提交实现改动（代码 + `build.py` + `CHANGELOG.md`）
- [x] 12.6 记录：`origin` 为第三方仓库，本地 `main` 已分叉，`git push` 会被拒绝；如需上游协作应先 fork 再添加 remote

## 13. 收尾

- [x] 13.1 在 `CHANGELOG.md` 新增本次条目（新增 GLM 厂商块、凭证只读不存、ACL 加固、`build.py` 清理 `dist/config.json`）
- [x] 13.2 确认无新增第三方依赖（`requirements.txt` 保持为空）且未引入子进程

## 14. 实现偏差记录（实际实现与计划的差异）

- **5.1 / 5.2 的落点从 `src/main.py` 改到 `src/api.py`**：`read_glm_credential()` 最终放在 `src/api.py` 模块级（比照已有的 `extract_commandcode_token`），而非计划里的 `main.py`。原因：`src/settings_window.py` 也需要它来渲染只读凭证状态，放在 `main.py` 会形成 `main → settings_window → main` 的循环导入。`main.py` 用该文件既有的双模式导入方式引用。
- **新增 `GLM_CREDIT_TYPES` 允许列表 + 未命中兜底**：计划写的是 `type == 'TOKENS_LIMIT'`，但**实盘返回 `CREDIT_LIMIT`**（智谱 2026-07-30 从 prompts 迁移到 credits 时改了类型名；社区 fixture 仍是旧名）。已放宽为 `('CREDIT_LIMIT', 'TOKENS_LIMIT')`，并在两者都未命中时兜底到「`type` 为非空字符串且不等于 `TIME_LIMIT`」的条目，同时记录观察到的类型名。design D2 与 spec「Classify GLM quota windows by reset magnitude rather than by unit code」已同步更新。**这是本轮唯一的功能性缺陷，且失败模式是静默的**（两格都显示 `--`，看起来像"没有额度"而非"过滤器坏了"），由实盘调用才暴露。
- **1.1 的 ACL 加固改为逐文件执行、不使用 `/T`**：原命令 `icacls <目录> /inheritance:r /grant:r "...:(OI)(CI)F" /T` 会把目录树内**子文件的访问控制项清空**（`(OI)(CI)` 标志对文件无意义，且 `/inheritance:r` 先剥掉了继承项），导致文件不可读写——**此问题已实际发生并经 `icacls /reset /T` 完整回滚**，回滚后项目根 ACL 与加固前逐行一致、其余文件未被波及。最终采用逐文件方案，只作用于 `src\config.json` 与 `tokenhub.log`，并通过读写测试与跨重写测试验证（重写后仍是三条 ACE、`BUILTIN\Users` 不再出现）。README 已加入「不要对目录使用 `/T`」的警告。
- **`glm_enabled` 已置为 `true`**：为完成端到端验证在 `src\config.json` 中启用；随时可在设置界面关闭。
- **`build.py` 额外清理**：移除已失效的 `import tempfile`；`clean()` 的 docstring 改写为说明"删除 `dist/config.json` 是刻意行为"，避免后人误当 bug 改回去。
- **11.3 的口径**：已验证软件解析结果与接口原始 `percentage` 字段（1 / 10）一致；与**网页后台**的交叉核对仍需人工目视确认。
- **11.8 为半自动验证**：配置读写回路（关闭→高度回落、开启→恢复）已用脚本验证，设置窗口复选框的实际点击未在无头环境下执行。
