## 1. 前置准备

- [x] 1.1 记录 TokenHub 当前读数作为对账基准快照：启动后从 `tokenhub.log` 抄录 GLM 与 CommandCode 的百分比与重置倒计时，并确认配置为 `opencode_enabled=False` / `commandcode_enabled=True` / `glm_enabled=True`
- [x] 1.2 从 token-monitor 的 Releases 取得 Windows 安装包并记录**文件名与 SHA-256**；目标版本 v0.57.0，若已有更新版本则记录实际采用版本（后续对账记录必须写明该版本号）
- [x] 1.3 确认系统「透明效果」已开启（设置 → 个性化 → 颜色）；未开启时其毛玻璃会退化为纯色
- [x] 1.4 记录安装前的磁盘可用空间与 TokenHub 常驻内存，作为对照基线

## 2. 凭证存储加固（必须在录入任何凭证之前完成）

- [x] 2.1 安装 token-monitor，但**先不要录入任何凭证**
- [x] 2.2 定位其凭证存储文件 `<userData>/credentials.json`（Electron `userData` 目录，通常为 `%APPDATA%\<应用名>`），记录完整路径
- [x] 2.3 加固前先记录 `icacls "<credentials.json>"` 的原始输出（默认应含 `BUILTIN\Users` 或 `BUILTIN\Authenticated Users`）
- [x] 2.4 **经核实无需重新设 ACL**。`%APPDATA%\Token Monitor` 的默认 ACL 已仅含 `NT AUTHORITY\SYSTEM` / `BUILTIN\Administrators` / 当前用户，**不含** `BUILTIN\Users` 与 `BUILTIN\Authenticated Users`。这与 TokenHub 的情形不同：其 `config.json` 落在 `D:\桌面`，默认继承到 `BUILTIN\Authenticated Users:(I)(M)` 与 `BUILTIN\Users:(I)(RX)`（即设计 D6 的假设来自该情形，对 `%APPDATA%` 不成立）。因此**不施加** `icacls`——对第三方应用的 profile 目录做无收益的 ACL 手术，收益为零而风险非零
- [x] 2.5 复核 ACL：已实测 userData 目录仅 `NT AUTHORITY\SYSTEM:(I)(OI)(CI)(F)`、`BUILTIN\Administrators:(I)(OI)(CI)(F)`、`AUDIT-WADE-YD\29871:(I)(OI)(CI)(F)`，满足规格要求（仅属主 / 系统 / 管理员组）。`credentials.json` 尚未生成（未录入任何凭证）；待首次录入后按 2.6 复核其继承结果
- [x] 2.6 验证自锁风险：**已确认无自锁**。`credentials.json` 写入后应用重启仍能读回（`providers` 保持 `zai` + `commandcode`，长度 49 / 120 不变），且用户确认四个指标格均正常显示
- [x] 2.7 已排查：`credentials.json` 是唯一存放凭证的文件；`settings.json` 只写入 `zaiApiRegion` 等非机密设置（凭证由 `stripCredentialSettings` 迁出）。本机亦不存在 Claude / Codex 的凭证文件（仅 `C:\Users\29871\.local\share\opencode\auth.json` 存在），故凭证接触面受限。**另发现**：其本地客户端扫描行为范围较大，见 3.7 与对账记录第 5 节

## 3. 厂商接入配置

- [x] 3.1 OpenCode Go：**无法核验**——用户主动关闭了该 provider（`limitProviders` 现为 `commandcode,zai`），零配置是否生效未获验证。这是用户选择，不是缺陷
- [x] 3.2 GLM：已配置。**过程失误已记录**：首次由界面填入时误将剪贴板中的 CommandCode token 粘进了 Z.ai 的 API key 字段（两者共用同一剪贴板，属编排者的交接设计缺陷）。已核出并改正为真正的 `zhipuai-coding-plan` key（长度 49，前缀 `c056`）
- [x] 3.3 GLM：区域已切换为 `bigmodel-cn`（`settings.json` 的 `zaiApiRegion` 实测值确认）
- [x] 3.4 GLM：读数成功。编排者用 `open.bigmodel.cn/api/monitor/usage/quota/limit` 直连取证并与 TokenHub 日志交叉比对：5 小时 `0%`、每周 `11%`，一致
- [x] 3.5 CommandCode：已提取并配置，token 长度 79。提取脚本 v2 以 `billing/credits` 的 **HTTP 200** 为成功判据（v1 只看 cookie 是否存在，曾把长度 85 的未登录中间 cookie 误判为成功并误关浏览器窗口，v2 已修正）。**另有一个格式坑**：`commandcode/limits.js:172-175` 要求 `name=value` 形式且 name 须命中第 37-41 行白名单，裸值会被判为"未配置"；已改为 `__Secure-commandcode_prod_.session_token=<值>`（长度 120），并用其判定逻辑复刻自检通过
- [x] 3.6 DeepSeek：**未配置，无法核验**——本机不存在任何 DeepSeek 凭证（TokenHub 侧 `deepseek_token` 为空且 `deepseek_enabled=False`）
- [x] 3.7 已关闭其余 provider：`limitProviders` 最终为 `commandcode,zai`。**但须注意**：其"本地 AI 客户端用量扫描"是独立功能、默认开启，覆盖 27 个客户端且 `wslScanEnabled=True`，已产生约 1.36 MB 本地档案（`session-usage-archive.json` 等）；`syncUploadIntervalMs=0` 确认无上传。用户选择暂不调整

## 4. Ground truth 对账（切换闸门）

- [x] 4.1 GLM：窗口数为 **2**（均为 `type=CREDIT_LIMIT`）、cap 为 **2000 / 10000**；实测 5 小时 `0%`（该窗口于 14:51 刚重置）/ 每周 `11%`。用户界面观测一致
- [x] 4.2 GLM：重置倒计时与 TokenHub 指向同一周期。5 小时窗重置后上游将该条 `nextResetTime` 返回为 `null`，TokenHub 依设计 D2 的硬不变式正确归位为 `glm_rolling: 0% | --`、`glm_weekly: 11%`，未出现槽位颠倒
- [x] 4.3 CommandCode：cap 确认为 **14 / 35**。编排者直连 `billing/credits` 取值 `1.077684566/14 = 7.70%`、`7.7520657239/35 = 22.15%`；TokenHub 同分钟日志为 `7.66% / 22.13%`，一致
- [x] 4.4 CommandCode 月度：**预判的不符已确认成立**。TM 显示约 **75%**；正确口径 `已用/grant = 56.6455550714 / 74.070986064 = 76.47%`；其硬编码口径 `(70-剩余)/70 = 75.11%`，偏差约 **−1.4 pp**。成因：把个体版 GOAT 月度额度写死为 70，而该账户实际 grant 为 74.071（含赠送额度；`grant = 已用 + 剩余` 已两次独立取样验证稳定，74.107 → 74.071）。该指标**不参与**切换判定
- [x] 4.5 DeepSeek：**无法核验**——两端均未配置，无基线可比（不得记为通过）
- [x] 4.6 OpenCode Go：**无法核验**——用户主动关闭该 provider
- [x] 4.7 稳定锚点（窗口数 / cap / 周期）**全部相符**，未发现需停止切换的理由
- [x] 4.8 对账记录已存档：`openspec/changes/adopt-token-monitor/reconciliation.md`（含版本号 v0.57.0、SHA-256 校验、逐厂商逐指标锚点与偏差、月度偏差成因、三次过程失误与修正、内存实测、超范围行为披露）

## 5. 切换与并行运行

- [x] 5.1 对账通过后，将 token-monitor 视为主力监控。已在 `README.md` 顶部与 `CHANGELOG.md` 0.1.3 记录角色变更
- [x] 5.2 已确认 TokenHub 保持安装且可启动：进程运行中（PID 5756，42.0 MB），`src/config.json` 与 `src/api.py` 俱在，未卸载、未删除源码与配置
- [x] 5.3 并发轮询**未触发限流**。14:40 之后 713 行日志中 `429` / `rate limit` / `Too Many` 命中数均为 **0**；仅 14:46:22 出现一次瞬时 `网络错误: timed out`（GLM 与 CommandCode 同时超时，随后自愈），不构成系统性限流证据，无需改为按需启动
- [x] 5.4 内存实测：token-monitor 4 进程历次采样 **618 / 334 / 243 / 180.5 / 159.7 / 559.2 MB**，**波动极大**（应与其采集周期相关），显著高于其 issue #495 公布的 110–120 MB；同期 TokenHub 稳定在 **42.0 MB**
- [x] 5.5 token-monitor 在运行期内经历了一次真实的 5 小时窗口重置（GLM 该窗口于 14:51 重置），重置后用户确认四个指标格显示正确，且其档案文件持续按周期刷新（14:57–14:58 仍在写入）。**范围说明**：它仅运行约 11 分钟即遇到该重置点，因此验证的是「跨重置点刷新正确」，未覆盖完整 5 小时周期
- [x] 5.6 **核对结论为否定，且已排除「设置项未开启」这一可能**：用户实测 token-monitor **不能贴边收纳**。经源码核查，其 `windowBehavior` 仅有三个取值 —— `floating`（浮在其它 app 上方）/ `normal`（普通窗口）/ `desktop`（固定在桌面），见 `src/electron/renderer/index.html:247-252`，**不存在贴边折叠或悬停展开模式**。这推翻了本变更调研阶段「其具备贴边折叠 + 悬停展开」的说法（该断言未经实测，现予更正）。含义：TokenHub 的贴边自动隐藏在两者之间是**独有能力**，这本身就是保留它的一个实质理由，已补记进 README 与对账记录

## 6. TokenHub 保留与文档

- [x] 6.1 `README.md` 顶部已说明新角色（降级为对账基准与回退项），并写明功能冻结边界（仅安全修复）
- [x] 6.2 `CHANGELOG.md` 已新增 `## [0.1.3] - 2026-09-15`，记录角色变更、原因与对账摘要，并注明本次切换**未修改任何 `src/` 代码**
- [x] 6.3 已验证行为未退化：① GLM 密钥不出现在 `config.json` 与 `tokenhub.log`（与 auth store 中的值逐位比对为 False）② `src/config.json` 的 ACL 仅 `BUILTIN\Administrators` / `NT AUTHORITY\SYSTEM` / 当前用户 ③ `dist/` 内无 `config.json` ④ 贴边唤出仅窗口范围内响应（先前 9/9 边界断言，本次未改动该代码路径）
- [x] 6.4 已确认满足：`README.md` 的「关于凭证存储」章节本就写明了逐文件 `icacls` 命令与**严禁 `/T`** 的警告，无需补充

## 7. 收尾与后续

- [x] 7.1 回退说明已写入 `README.md`（「如何回退」小节，含停掉 token-monitor 与重启 TokenHub 的具体命令，并说明两者配置与凭证互不依赖）
- [x] 7.2 可信数字清单已写入 `README.md`（「哪些数字可信」表格）。CommandCode 月度标注为**仅作参考**，并写出偏差的两个数值：硬编码 **70** vs 实测 **74.107**，偏差约 **1.4 个百分点**
- [x] 7.3 已补写两个基线 spec 的 `Purpose`：`openspec/specs/glm-coding-plan-monitor/spec.md` 与 `openspec/specs/credential-storage-hardening/spec.md`，不再保留 `TBD`
- [x] 7.4 决定**不提**上游 PR（用户决定）。因此 token-monitor 仍需手动粘贴 GLM key；该差异已记入对账记录
- [x] 7.5 已清理临时克隆：`tm`（0.7 MB）与 `tm-full`（30.2 MB）
- [x] 7.6 本次不做（需另开变更）。「`SetWindowRgn` 是否导致 DWM acrylic 无视区域裁剪」这条**单一来源**结论仍待本机实测；token-monitor 自身刻意不用 `SetWindowRgn`、改用 `DWMWA_WINDOW_CORNER_PREFERENCE`，可作为参考路径
