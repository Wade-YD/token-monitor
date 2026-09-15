# token-monitor 对账记录

- **日期**：2026-09-15
- **被评估工具版本**：**token-monitor v0.57.0**（GitHub Release `v0.57.0`，发布于 2026-09-13）
- **采用产物**：`Token-Monitor-Setup-0.57.0.exe`，105.82 MB
- **SHA-256 校验**：实测 `cd1732525f8c5445e14b62b84d44a572e16440569934feb6b922e995e7e0af94`，与 GitHub Release 公布的 `digest` **逐位一致** ✅
- **对账人**：编排 agent（直连接口取证）+ 用户（界面观测）
- **关联变更**：`openspec/changes/adopt-token-monitor/`（schema: spec-driven）

---

## 1. 安装与落盘位置

| 项 | 值 |
|---|---|
| 安装目录 | `C:\Users\29871\AppData\Local\Programs\Token Monitor` |
| userData | `C:\Users\29871\AppData\Roaming\Token Monitor` |
| 凭证文件 | `<userData>\credentials.json` |
| 设置文件 | `<userData>\settings.json`（经 `stripCredentialSettings` 剥离凭证，仅存 `zaiApiRegion` 等非机密设置） |
| 开机自启 | 未设置（`HKCU\...\Run` 无该项） |

### 凭证文件 ACL（实测）

```
icacls "C:\Users\29871\AppData\Roaming\Token Monitor\credentials.json"
  NT AUTHORITY\SYSTEM:(I)(F)
  BUILTIN\Administrators:(I)(F)
  AUDIT-WADE-YD\29871:(I)(F)
```

**结论：平台默认已满足"仅属主 / 系统 / 管理员组"的要求**，`BUILTIN\Users` 与 `BUILTIN\Authenticated Users` 均不在列，因此**未施加任何 ACL 操作**。这与 TokenHub 的情形不同——其 `config.json` 落在 `D:\桌面`，默认继承到 `BUILTIN\Authenticated Users:(I)(M)` 与 `BUILTIN\Users:(I)(RX)`，那里的加固才是必要的。

---

## 2. 逐厂商逐指标对账

### 2.1 GLM（Z.ai，区域 `bigmodel-cn`）

| 指标 | 稳定锚点 | token-monitor | 编排者直连取证 | 判定 |
|---|---|---|---|---|
| 窗口数 | **2** | 2 | 2（均为 `type=CREDIT_LIMIT`） | ✅ |
| 5 小时 cap | **2000** | 一致 | `usage=2000`（`unit=3`） | ✅ |
| 每周 cap | **10000** | 一致 | `usage=10000`（`unit=6`） | ✅ |
| 5 小时百分比 | — | 一致 | `0%`（该窗口于 14:51 刚重置） | ✅ |
| 每周百分比 | — | 一致 | `11%`（`currentValue=1140`） | ✅ |

用户界面观测："四格都对上了"。

**周期归属的双向确认**：TokenHub 与 token-monitor 均把 `unit=6`（10000/1140/11%）判为**每周**、`unit=3`（2000/0/0%）判为 **5 小时**。值得记录的是：5 小时窗口重置后上游把该条的 `nextResetTime` 返回为 `null`，TokenHub 依靠设计 D2 的硬不变式（滚动 ≤18000 秒）正确归位，未出现槽位颠倒。

区域切换是**必做项**：token-monitor 的 `zaiApiRegion` 默认 `global`，不显式切到 `bigmodel-cn` 会打到 `api.z.ai` 而取不到数据。

### 2.2 CommandCode（计划 `individual-goat`）

| 指标 | 稳定锚点 | token-monitor | 编排者直连取证 | 判定 |
|---|---|---|---|---|
| 5 小时 cap | **14** | 一致 | `cap=14` | ✅ |
| 每周 cap | **35** | 一致 | `cap=35` | ✅ |
| 5 小时百分比 | — | 一致 | `1.077684566 / 14 = 7.70%` | ✅ |
| 每周百分比 | — | 一致 | `7.7520657239 / 35 = 22.15%` | ✅ |
| **月度百分比** | — | **约 75%** | **76.47%（正确口径）** | ❌ **偏低约 1.4 pp** |

TokenHub 同分钟日志（14:54:27）：`cc_rolling: 7.66% | 4小时18分`、`cc_weekly: 22.13% | 5天18小时28分` —— 与直连取证在四舍五入范围内一致。

#### 月度偏差的成因与量级（本次对账最重要的发现）

上游 `credits.monthlyCreditsGranted` 为 **`null`**，因此月度分母无法直接读取。可用的恒等式是：

```
grant = 本期已用 + 本期剩余
```

两次独立取样验证该反推的稳定性：

| 采样时刻 | `usage/summary.totalMonthlyCredits`（已用） | `credits.monthlyCredits`（剩余） | 反推 grant |
|---|---|---|---|
| 14:26 | 51.9975536395 | 22.1096720825 | **74.1072257215** |
| 14:50 | 56.6455550714 | 17.4254309926 | **74.0709860640** |

两次相差仅 **0.036**，可判定该账户本期的真实 grant ≈ **74.07**。

而 token-monitor 把个体版 GOAT 的月度额度**硬编码为 70**，于是：

```
正确口径   已用 / grant            = 56.6455550714 / 74.070986064 = 76.47%
其硬编码   (70 - 剩余) / 70        = (70 - 17.4254309926) / 70     = 75.11%
偏差                                                              ≈ -1.36 pp
```

与用户界面观测到的「约 75%」吻合，**预判成立**。

**性质判定**：这是**口径错误，不是舍入误差**。差的约 4.07 来自账户的赠送额度（`opensourceMonthlyCredits` 桶与 `monthlyCredits` 数值相同）。推论：**凡带赠送额度的账户，其月度百分比都会偏低，且赠送比例越大偏得越多**；偏差还会随用量推进而漂移，不是固定值。

**处置**：该指标**不参与**切换判定（切换只依据稳定锚点与两端可信指标）。

### 2.3 DeepSeek

**无法核验**。本机不存在任何 DeepSeek 凭证：TokenHub 侧 `deepseek_token` 为空且 `deepseek_enabled=False`，token-monitor 侧也未启用 `deepseek`。无基线可比，故**未做判定**，不得记为通过。

### 2.4 OpenCode Go

**无法核验**。用户主动关闭了该 provider（`limitProviders` 最终为 `commandcode,zai`），因此其"零配置自动读 `open`go' 条目"这一特性未获验证。这是用户选择，不是缺陷。

---

## 3. 过程失误与已修正项（记录以免复现）

| 失误 | 表现 | 根因 | 修正 |
|---|---|---|---|
| 凭证错位 | `credentials.providers.zai.apiKey` 里存的是 CommandCode token（两者长度同为 79、逐位相同已确认） | **编排者的交接设计缺陷**：把 CommandCode token 放进剪贴板，却在同一条指令里让用户同时去填 Z.ai 的 key。剪贴板只有一个值，先点哪个字段就粘到哪 | 用只改两个已知键路径的脚本改正；先备份、原子写、回读校验、保留 ACL |
| cookie 格式不合规 | 修正错位后 CommandCode 仍不出数，`commandcodeAccountSeed()` 生不出 accountId | token-monitor 的 `src/shared/providers/commandcode/limits.js:172-175` 要求 `name=value` 形式，且 name 须命中第 37-41 行的白名单；**裸值会被判为"未配置"** | 改为 `__Secure-commandcode_prod_.session_token=<值>`（总长 120），并用其判定逻辑复刻自检 `会被接受=True` |
| 提取脚本误判成功 | 浏览器窗口"莫名"关闭，而当时用户仍在 GitHub OAuth 授权页 | 脚本 v1 只判断"cookie 是否存在"，把长度 85 的**未登录中间 cookie** 当成成功并执行了关窗 | v2 改为以 `billing/credits` 返回 **HTTP 200** 为成功判据；实测可用 token 长度为 79 |

三次失误中有两次源于**编排者自己违反了本变更 D3 所列的原则**（只看表面值、不校验实际可用性）。

---

## 4. 代价实测

### 常驻内存

| 工具 | 进程数 | 常驻内存 |
|---|---|---|
| token-monitor v0.57.0 | 4 | **159.7 MB**（最新采样） |
| TokenHub | 1 | **42.0 MB** |

token-monitor 的历次采样：618 → 334 → 243 → 180.5 → 159.7 MB。启动预热期波动很大，159.7 MB 是当前最低稳定值，**高于其 issue #495 公布的 110–120 MB**。比值约 **3.8×** TokenHub。

### 安装体积

Setup 105.82 MB；安装后主程序 `Token Monitor.exe` 单文件 215.2 MB。

### 其它观测到的落盘

| 文件 | 大小 | 说明 |
|---|---|---|
| `session-usage-archive.json` | 817 KB | 本地 AI 客户端用量档案 |
| `collector-anchor.json` | 444 KB | 采集锚点 |
| `daily-history-archive.json` | 100 KB | 每日历史 |

---

## 5. 超出"额度监控"范围的行为（须知情）

token-monitor 默认启用**本地 AI 客户端会话扫描**，覆盖 27 个客户端：

```
clients = claude,codex,opencode,hermes,openclaw,cursor,antigravity,cline,droid,kimi,
          qwen,grok,copilot,pi,zed,kilo,commandcode,zcode,kiro,codebuddy,workbuddy,
          proma,reasonix,dsh,cherrystudio,lmstudio,unsloth
wslScanEnabled = True      historyEnabled = True      projectsEnabled = True
```

源码层面确认它会读取 `~/.codex`（`src/shared/collector.js:1679`）、`~/.claude/projects`（`src/shared/collector.js:3476`、`src/electron/main.js:5445`）、CherryStudio 的 `.claude/projects`（`src/shared/collector.js:1900-1909`）等目录。

**缓解事实**：`syncUploadIntervalMs = 0`，**没有上传同步**；本机也不存在 Claude / Codex 的凭证文件。但被扫描的是**本地 AI 对话历史**，其范围超出额度监控本身。

**用户决定**：暂不调整，自行观察。

---

## 6. 对账结论

**稳定锚点（窗口数 / cap / 周期）全部相符** —— GLM 2 窗口 2000/10000、CommandCode 14/35 —— 未发现任何需停止切换的理由。

**可信的数字**：GLM 5 小时与每周、CommandCode 5 小时与每周。
**仅作参考的数字**：**CommandCode 月度**（偏低约 1.4 pp，成因见 2.2）。

据此，切换闸门**通过**：token-monitor 作为主力监控，TokenHub 保留为对账基准与回退项。

---

## 7. 能力差异（不参与对账判定，但影响两者定位）

### 7.1 token-monitor 不能贴边收纳 —— 并更正一处先前调研的错误结论

**用户实测结论：token-monitor 不支持贴边自动收纳。**

已排除"该能力存在但设置未开启"这一可能。源码核查：

```
src/electron/renderer/index.html:247-252
  <select id="windowBehaviorInput">
    <option value="floating">Floating above apps</option>   <!-- 浮在其它 app 上方 -->
    <option value="normal">Normal window</option>           <!-- 普通窗口 -->
    <option value="desktop">Desktop pinned</option>         <!-- 固定在桌面：留在其它 app 下方、锁定拖动缩放 -->
  </select>
```

`windowBehavior` 仅有 `floating` / `normal` / `desktop` **三个取值**（另见 `src/electron/windowBehavior.js:53-54`、`src/electron/main.js:2540-2541` 的旧值迁移逻辑），**不存在贴边折叠或悬停展开模式**。其 `floatingBubbleEnabled` 是另一项功能（独立的悬浮气泡，默认关闭），与贴边收纳无关。

**更正**：本变更调研阶段曾断言"token-monitor 具备贴边折叠 + 悬停展开"（源自对 `README.zh-CN.md` 与源码的间接推断，**未经实测**）。该断言**错误**，现予更正。

**含义**：TokenHub 的贴边自动隐藏在两者之间是**独有能力**。这使"保留 TokenHub"的理由不止于"对账 + 回退"——它在日常使用形态上仍不可替代。该结论已补记进 `README.md`。

### 7.2 已核实的其它差异

| 维度 | TokenHub | token-monitor v0.57.0 |
|---|---|---|
| 运行时 | 纯标准库 tkinter，单进程 | Electron，4 进程 |
| 常驻内存 | **42.0 MB**（稳定） | **159.7–618 MB**（波动极大） |
| 安装 | 免安装，源码直跑 | 需安装，Setup 105.82 MB，主程序 215.2 MB |
| 贴边自动隐藏 | ✅ 有（触发范围仅窗口自身跨度） | ❌ 无 |
| 厂商覆盖 | 4 个 | 36+ |
| GLM 凭证 | 运行期从 auth store 只读，**不落盘** | 需手动粘贴，明文存 `credentials.json` |
| CommandCode 月度 | 已移除该列 | 显示但分母硬编码，**偏低约 1.4 pp** |
| 本地会话扫描 | 无 | 默认扫描 27 个客户端 + WSL，生成约 1.36 MB 档案（无上传） |
| 维护主体 | 本人 | 社区（2148★，MIT，当日有提交） |
