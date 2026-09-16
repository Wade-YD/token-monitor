# 交接文档（给接手本项目的 agent）

> 本文档是在 OpenCode 会话 `ses_f5d58bb8fffeTYvUTV528ZYyxk` 中完成三条线后写的交接说明。
> **所有事实均已实测核对**（哈希、路径、大小、命令）。读本文档不需要该会话的上下文。
> 最后核对时间：2026-09-15。

---

## 0. 一句话现状

`D:\桌面\私人图书馆\7-工具箱\1-project\` 下有三条已完成并归档的线，都是围绕「AI 编程工具的额度/用量可见性」：

| # | 交付物 | 状态 | 验证方式 |
|---|---|---|---|
| 1 | **TokenHub**（自研 tkinter 挂件）新增 GLM Coding Plan 监控 + 暗色 HUD 重设计 | 已实现、已归档、可用 | 启动看 4 个厂商块 |
| 2 | **token-monitor**（第三方 Electron 应用）接入为主力 + 与 TokenHub 对账 | 已接入、已归档、可用 | 四格数据与网页后台一致 |
| 3 | **token-monitor 贴边自动隐藏**补丁 | 已实现、已安装、**两轮实测通过**（finalize 22 断言全绿） | 见 §3.3 |

**磁盘上有什么**（都在 `D:\桌面\私人图书馆\7-工具箱\1-project\` 下）：
```
TokenHub\               TokenHub 仓（含全部 openspec 规格与归档决策）
token-monitor\          token-monitor 的完整 git 克隆（分支 feat/edge-auto-hide + 5 个提交）
token-monitor-patch\    补丁 + 回退说明 + 本会话用过的 7 个脚本
HANDOFF-zcode.md        本文档
opencode-session-*.html 本会话完整记录（7.14 MB）
```

---

## 1. 交付物一：TokenHub 的 GLM Coding Plan 监控

> **⚠️ 2026-09-16 更新**：TokenHub 应用本体已按用户要求删除（不再使用）。
> 其 `openspec\` 规格与决策档案已迁至 `token-monitor-workspace\openspec\`（本工作区内），
> 下文涉及 `cd TokenHub` 的验证命令随之失效；openspec 校验改在本工作区根目录执行。

- **仓**：`D:\桌面\私人图书馆\7-工具箱\1-project\TokenHub`
  - `origin = https://github.com/2700zc/TokenHub.git`（**第三方仓，本机无 push 权限**）
  - HEAD = `d0862e2`，工作树干净，共 46 个受跟踪文件
- **关键提交**：`b1745c6`(提案) → `c407407`❌更正为 `c407525`(实现) → `4e00dbb`(归档)
  后续 HUD 重设计：`7f8d033` / `cf387d8` / `ba5ef64`
- **数据源**：`https://open.bigmodel.cn/api/monitor/usage/quota/limit`
  （**未公开文档化**，但 Z.ai 官方插件 `zai-org/zai-coding-plugins` 的 `glm-plan-usage` 在用）
- **凭证**：从 OpenCode auth store `C:\Users\29871\.local\share\opencode\auth.json` 的
  `zhipuai-coding-plan.key` **每次请求现读，不落盘**（`config.json` 里只存 `glm_enabled`/`glm_source`/`glm_host`）
- **验证命令**：
  ```powershell
  cd "D:\桌面\私人图书馆\7-工具箱\1-project\TokenHub"
  python -c "import compileall,sys; sys.exit(0 if compileall.compile_dir('src',quiet=1) else 1)"
  Start-Process -FilePath "pythonw" -ArgumentList "src\main.py" -WorkingDirectory (Get-Location)
  # 目视：应出现 CommandCode / GLM 两个厂商块（OpenCode/DeepSeek 未配置，默认关闭）
  ```

### ⚠️ 最大的坑（改了会静默失效）
该套餐响应里 `limits[].type` 是 **`CREDIT_LIMIT`，不是 `TOKENS_LIMIT`**
（智谱 2026-07-30 把套餐由 prompt 制改为 credits 制时改了名）。
按 `TOKENS_LIMIT` 过滤会得到**空结果**，界面上两格永远显示 `--` —— **失败是静默的，不报错**。
正确做法：allow-list `('CREDIT_LIMIT','TOKENS_LIMIT')`，并对「非 `TIME_LIMIT` 的未知类型」兜底。

### 其它设计要点
- 窗口归类**不信任 `unit` 字段**：按 `nextResetTime` 距离现在的时间量级判断
  （5 小时窗口 ≤ 18000 秒、每周 ≤ 604800 秒），并用硬不变式交换纠错
- 月度指标（`TIME_LIMIT`）**有意不显示**（用户决定「维持 2 个指标」）

---

## 2. 交付物二：token-monitor 接入 + 对账

- **应用**：`C:\Users\29871\AppData\Local\Programs\Token Monitor`（v0.57.0，`Token Monitor.exe` 215.2 MB）
- **userData**：`C:\Users\29871\AppData\Roaming\Token Monitor`（`settings.json` + `credentials.json`）
- **凭证键路径**（权威来源：解包后的 `src/shared/credentialStore.js:11-39` 的 `CREDENTIAL_SETTING_PATHS`）
  - GLM/Z.ai：`zaiApiKey → ['providers','zai','apiKey']`
  - CommandCode：`commandcodeCookie → ['providers','commandcode','cookie']`
- **对账记录全文**：`openspec\changes\archive\2026-09-15-adopt-token-monitor\reconciliation.md`

### ⚠️ CommandCode 凭证的两个坑
1. 它的 `/internal/billing/*` 是 **web-session 接口**；`auth.json` 里那条 `commandcode` 是 **CLI API key**，
   三种头形式（`Cookie: __Secure-...=<key>` / 裸 cookie / `Authorization: Bearer <key>`）**全是 401**。
   必须用浏览器里的 session cookie。
2. 该 cookie 的值**必须是 `name=value` 形式**：
   `src/shared/providers/commandcode/limits.js:172-175` 会按 `name=value` 切分，
   再查白名单 `limits.js:37-41`；不带 `name=` 前缀会被判为「未配置」。
   正确值形如 `__Secure-commandcode_prod_.session_token=<79~81 字符>`（总长 ≈ 120）。

### 对账结论（可复用的判据）
- 稳定锚点全部相符：GLM cap `2000`/`10000`（Lite）、CommandCode cap `14`/`35`（goat 档）
- **CommandCode 的月度百分比该工具算错了**：它把分母硬编码为 `70`，
  而实测该账户真实 grant = `74.071`（=`usage/summary.totalMonthlyCredits` 已用 + `credits.monthlyCredits` 剩余）
  → **偏低约 1.4 个百分点**，且随用量漂移。**这个数字只能当参考。**

---

## 3. 交付物三：token-monitor 贴边自动隐藏（重点）

### 3.1 当前状态
- **已实现、已安装、四轮实测通过**：
  - 第一轮（harden，2026-09-15 下午）：用户亲手实测通过「悬停滑出、移开收回」
  - 第二轮（finalize，2026-09-15 晚，提交 `4688fee`）：**22 项运行时断言全绿**
    （启动零拒收 / 窄条 3px / 隐藏态 resize 自愈 / 5 轮循环 / 诊断开关 / 全程无错误框）
  - 第三轮（resize-affordance，2026-09-15 晚，提交 `ec477de`）：**8 项场景断言全绿**
    ——用户反馈「唤出后抓边缘调整大小就被收回」：resize 边框在 Win32 外框上
    （Electron 矩形外 ~6px），光标贴边框曾被判为「光标离开」而收起。
    修复：保持测试加 `EDGE_INTERACTION_MARGIN_PX=10` 交互边距 +
    resize 后 700ms 宽限期（轮询不武装收起、已武装计时器到点否决）
  - 第四轮（hide-idle-zai-cash-row，2026-09-15 深夜，提交 `48ac2b8`）：**zaiLimits 37 用例全绿 + 截图确认**
    ——用户反馈 GLM 栏恒零的 Balance/Spend 是无效显示（订阅不动现金钱包）。
    修复：`zai/limits.js` 在「套餐窗口存在 + 余额 0 + 今/月现金消费 0」时不输出该行；
    钱包有钱/有现金消费/无订阅窗口时自动恢复；本地消费记账照跑不断档
  - 第五轮（edge-native-popup-hold，2026-09-16，提交 `e1326c6`）：**147 测试全绿 + 回归 2 轮 PASS**
    ——用户反馈「外观-厂商色调色盘取色时窗口自动收回」：取色器是本进程原生弹窗，
    光标进入即被判「离开窗口」。修复：新增 `edgePopupGuard.js`
    （WindowFromPoint+前台窗口双查自有弹窗，win32/koffi，FFI 不可用静默降级），
    轮询武装前与计时器到点两处守卫。首版上线即被诊断日志抓出 `currentPid` 未传
    （owned 判定恒 false），一行修复后实测 136 次命中——**诊断开关首功**。
    另证：取色器不抢焦点（fgRoot 恒为主窗口），光标判定是唯一可行守卫路径。
    **附带教训**：从 orig-backup 解包 asar 必须有
    `app.asar.orig-backup.unpacked` 孪生目录（已创建勿删），否则丢 78 个 unpacked
    文件（tokscale/bin.js 等）→ 启动报 Cannot find module。交付脚本已加体积护栏
- **fork（永久副本，就在这里）**：`D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor`
  - 分支 `feat/edge-auto-hide`，工作树干净；**958 文件 / 53.9 MB**；`git fsck` 通过
  - 提交：`11a3e6e`(功能) → `56bd66d` → `9da4de1` → `c229c3f` → `6488c3b` → `4688fee`(finalize) → `ec477de`(resize) → `48ac2b8`(zai 现金行) → **`e1326c6`(弹窗守卫)**
  - 基线：tag **`v0.57.0`** = 提交 **`bbe07de`**
    （该 tag 是 annotated，tag 对象是 `9e5cc83` —— **别把这个当提交号**）
  - 上游：`https://github.com/Javis603/token-monitor.git`（浅克隆，**无 push 权限**）
  - 规模：**14 文件 +1803/−23 行**
  - 测试已通过：`edgeAutoHide 34 / edgePopupGuard 8 / windowBehavior 9 / tray 52 / zaiLimits 37`（纯 Node，无需 node_modules）
- **finalize 轮修掉的 6 项**（详见 §4 与 openspec 归档 `2026-09-15-finalize-edge-auto-hide`）：
  1. 启动拒收根因 = `focus` 处理器对刚恢复隐藏的窗口调 `expandEdge()` → 已移除；唤出只归光标触发区
  2. `geometryReady` 门控：首次 `show` 前守卫直接跳过且不降级动画
  3. 窄条 3px：`edgeHiddenBounds` 补偿 Win32 DWM 外扩（实测左/右/底 +6px、顶 0；bottom 停靠无需补偿）
  4. 重启尺寸回退：恢复路径只挪位置 + 按当前公式重算隐藏坐标
  5. 隐藏态 resize 自愈：`syncEdgeDockGeometry()`（挂 **`resize` 去抖** —— Windows 上 `resized` 对外部 resize 静默！）
  6. 瞬态原生拒收连续 ≥3 次才降级；补间尾帧直接吸附目标（消除亚像素尾帧被拒的暴露面）
- **三层留档（互为备份，任一即可重建）**
  1. `..\token-monitor\` —— 完整 git 克隆（含分支 + 7 个提交），**首选**
  2. `..\token-monitor-patch\edge-auto-hide.patch` —— 84 KB 补丁（源码改动 + 测试）
  3. 已安装的 `app.asar`
- 注：临时目录里的重复副本 `...\Temp\opencode\tm-fork` 已于 2026-09-15 清理删除（本目录是唯一副本）；
  `...\Temp\opencode\asar-extracted` 是打包暂存区（保留），丢失可用 `app.asar.orig-backup` 一条命令重建

### 3.2 从零重建并安装补丁（完整配方）
```powershell
$P = "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor-patch"
$APP = "C:\Users\29871\AppData\Local\Programs\Token Monitor"

# 1) 拿到「基线 + 补丁」的工作树
#    首选：直接用已留档的完整克隆（已含分支与 5 个提交）
cd "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor"
#    从零重建（如果那份克隆丢了）：
#      git clone https://github.com/Javis603/token-monitor.git tm-work
#      cd tm-work && git checkout v0.57.0     # = bbe07de

# 2) 应用补丁
git apply --3way "$P\edge-auto-hide.patch"

# 3) 测试（纯 Node，不需要 node_modules）
node --test tests/electron/edgeAutoHide.test.js tests/electron/windowBehavior.test.js tests/electron/tray.test.js
#    期望：edgeAutoHide 22 / windowBehavior 9 / tray 52，全部 exit=0

# 4) 从官方原包解出完整应用树，再叠加改动文件
npx --yes @electron/asar extract "$APP\resources\app.asar.orig-backup" asar-extracted
#    把下面 9 个文件从 tm-work 覆盖进 asar-extracted：
#      src/electron/edgeAutoHide.js      （新增）
#      src/electron/main.js
#      src/electron/windowBehavior.js
#      src/electron/floatingBubble.js
#      src/electron/tray.js
#      src/electron/renderer/app.js
#      src/electron/renderer/i18n.js
#      src/electron/renderer/index.html
#      src/shared/providers/zai/limits.js （GLM 现金行自适应隐藏）

# 5) 打包并替换（**替换前先确认备份存在**）
npx --yes @electron/asar pack asar-extracted app.asar
Copy-Item app.asar "$APP\resources\app.asar" -Force
```

**为什么可以替换 asar（已实测）**：`app.asar` 的完整性校验**未启用** ——
exe 中 `sha256:<64hex>` 形式的摘要出现 **0** 次，`asarIntegrity` 字符串根本不存在。
（早期我用 `-match` 的宽泛命中误判过一次，后自行推翻。）

### 3.3 使用 / 停用 / 回退
```
用    设置 → 显示方式 → 「Edge auto-hide」，把窗口拖到任意屏幕边
      自动滑出，仅留约 9px；鼠标移到窄条上滑回；光标离开约 0.2s 后收起
停用  同一处下拉改回「Floating above apps」（零风险，随时切回）
回退  1) 上一条（零风险）
      2) 用 app.asar.orig-backup 覆盖 app.asar（18,753,883 B）后重启 → 回到官方构建
      3) git checkout 6488c3b 后重新打包替换 → 回到 finalize 前
```

### 3.4 改这个功能前必须知道的 10 条（否则会重犯全部缺陷）
1. **只挪位置、不改尺寸**：一律 `setPosition`，**绝不用 `setBounds`**
   —— 绕开 `WINDOW_LIMITS.minWidth = 240`（`src/electron/main.js:388`）与 Windows 极小窗口的 DWM 渲染问题
2. **隐藏几何必须单独存** `settings.edgeAutoHideBounds`
   **绝不能写进 `settings.windowBounds`** —— 因为 `restoredBounds()` 见到「不在屏内」的坐标会丢弃 x/y，导致重启跳位
3. **所有几何写入必须走统一的 `setEdgeWindowPosition(x, y)`**：
   `geometryReady` 门控（首次 `show` 前直接跳过且**不**降级）+ `Number.isFinite` 校验
   + `try/catch` 兜住原生拒收 + **连续 ≥3 次**才降级为瞬移（单次瞬态拒收实测存在）
4. **动画进行中标志必须是「截止时刻」`animatingUntil`（epoch ms），不能是布尔**：
   布尔只在成功路径清除，**一次异常就永久卡死**，而光标轮询首行会因它一直早退 → 功能永久瘫痪
5. **收起/展开只能有一个执行者**：100ms 光标轮询**只决定** `desired`（`'hidden'|'revealed'`），
   `reconcileEdgeAutoHide()` 幂等地对账「`desired` vs 实际 bounds」，不一致才动
6. **收起判定绝不能带 `isFocused()` 门槛；唤出也绝不能由 focus 触发**：
   该窗口 `focusable:true` 且长期持有焦点；启动自动聚焦会把刚恢复的隐藏窗口弹出来
   （= 每次启动一次原生拒收 + 整场动画降级，finalize 已移除 focus→expandEdge）
7. **触发区沿边方向必须限制在窗口自身跨度内**（TokenHub 曾因「整条屏幕边都是触发区」而误弹）
8. **异常不得弹模态框**：已有 `process.on('uncaughtException')` 落盘 + 复位状态；
   后台挂件弹错误框不可接受
9. **隐藏态 resize 对账要挂 `resize` 事件去抖**：Windows 上 `resized` 对外部/程序性 resize **静默**
   （实测外部 MoveWindow 后 `resized` 一次不触发）
  10. **启动恢复必须「只挪位置 + 按当前公式重算隐藏坐标」**：
      整包 `setBounds(saved.hiddenBounds)` 会用旧尺寸盖掉用户最后的 resize，
      原样信任旧坐标会让「公式升级后」的补偿失效（实测：旧坐标让窄条回到 9px）
  11. **展开态「光标在窗口内」判定必须带 `EDGE_INTERACTION_MARGIN_PX=10` 边距 +
      resize 后 700ms 宽限期**：resize 边框在 Win32 外框上（Electron 矩形外 ~6px），
      不加边距 = 抓边缘调整大小必被收回（用户实测反馈，第三轮修复）

### 3.5 排障入口
- **护栏拒收 / 未捕获异常**：`%TEMP%\token-monitor-edge-error.log`
  （只在异常路径写入；正常运行时该文件不存在。
  单条 `native setPosition rejected ... streak=1` 是已知瞬态；连续 3 条带
  `tweening disabled` 才代表动画被降级，需要排查）
- **决策日志（需开启）**：`%TEMP%\token-monitor-edge-debug.log`
  开启：`settings.json` 加 `"edgeAutoHideDebug": true`，或环境变量 `TOKEN_MONITOR_EDGE_DEBUG=1`
  （轮询 100ms/次都会写行，用完记得关）
- 应用自身日志位置未确认，可查 `C:\Users\29871\AppData\Roaming\Token Monitor\`

---

## 4. 已知遗留（finalize 后剩余，按价值排序）

1. **窗口尺寸会被应用自身/用户改来改去**（观测 145 → 377 → 557 → 918 → 454）：
   用户手动 resize + 拖拽；finalize 已让停靠几何跟随（`syncEdgeDockGeometry` + 恢复只挪位置），
   但「应用在展开态自动改尺寸」的触发源未深究（未观测到，仅记录）
2. **诊断开关未进 UI**：`settings.edgeAutoHideDebug` / `TOKEN_MONITOR_EDGE_DEBUG=1` 已可用，
   tray 菜单开关（5 语言 i18n）留待有需要再做
3. **`upstream-patch-maintenance`**：已按**文档级**收口（2026-09-15）——
   回退物 `app.asar.orig-backup` 的 SHA-256 已实测钉进 `token-monitor-patch\README.txt`
   （`fbc2764b...5490bd1`，回退覆盖前先核对）；补丁在干净 v0.57.0 检出上
   `git apply --check --3way` **无冲突通过**（重验命令同文档）；
   「上游发新版后重打补丁」流程已写入同文档。评估为**不值得做**的已留痕：
   `superseded\README.md`
4. **frame 偏移常量 6px 是本机实测值**：其他 Windows 版本若 DWM 边框不同，
   窄条宽度会偏差几 px（只影响观感，不影响功能）；如需可加 settings 覆盖
5. 启动期 `nativeTheme.shouldReduceMotion` 为真时启动恢复后的首次滑出是瞬移
   （尊重系统「减少动态效果」，属预期行为，非缺陷）

（已修掉，见 §3.1 finalize 六项：启动拒收/窄条 9px/重启尺寸回退/隐藏态 resize 漂移/
瞬态拒收即降级/死代码 `edgeExpandedBoundsForSide`）

---

## 5. 踩过的坑（高价值，别重犯）

### 版本错配会直接让应用崩
把上游 **`HEAD`** 的文件塞进 **`v0.57.0`** 的 asar 树 → 应用启动即弹 `Error` 对话框、主窗口不出来。
两个版本差异很大：`main.js` 差 127 行、`renderer/app.js` 差 **506** 行、`renderer/index.html` 差 **789** 行。
**补丁必须 rebase 到与已安装版一致的 tag**，且只用 `git apply --3way` 把「改动」搬过去，不要整文件覆盖。

顺带：`git add -N`（intent-to-add）会让 `git stash` 失败（`Entry ... not uptodate. Cannot merge.`），
先 `git reset` 清掉再 stash。

### 静态推理解决不了「看起来对但行为不对」
本会话的 **4 个缺陷（3 个逻辑 + 1 个主进程崩溃）全部靠「插探针让程序自己打印决策」找到**；
纯静态推理连续误判 **3** 次（两次方向错、一次把候选全部排除后靠日志才定位）。
👉 **遇到「代码看起来正确但行为不对」，不要再读代码推理，直接插一行日志。**

### 验证夹具比被测代码更容易出错
三次**假阴性全部由夹具造成**：
1. 光标被外部（用户）移动后仍按原位置判定 → 把「已正确收起」误报为「未展开」
2. **把隐藏基线读在收起动画途中**（读到 `y=0`）→ 之后所有比较都对错基准
3. **`subprocess.Popen` 启动 GUI 子进程会继承 stdout 管道句柄** → 工具调用要等管道关闭，
   而 GUI 存活期间管道不关 → **表现为「卡很久」并且输出全丢**。
   👉 启 GUI 进程必须用 `Start-Process`，或 `Popen(..., stdout=DEVNULL, stderr=DEVNULL, close_fds=True)`

### `icacls` 严禁带 `/T`
`/T` 与 `(OI)(CI)` 组合会在剥离继承项的同时**清空每个子文件的 ACE**。
本会话真的踩了，随即 `PermissionError: [Errno 13] Permission denied`。
👉 只能对**具体文件**施加；目录级加固用 `/inheritance:r` 且**不带 `/T`**。恢复靠 `icacls <dir> /reset /T /C`。

### PowerShell 细节
- **单引号串里不要放中文**（报 `ParserError ... 缺少“-”运算符后面的值`）。
  中文放 `"双引号"` 里，或写进 `.py` 文件（write 工具，UTF-8 可靠）
- 读中文输出前先 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`；
  **乱码常常只是显示问题，文件本身完好**（用码点级核对证实过）
- `Select-String` **默认大小写不敏感**（曾把英文短语 “bearer token” 误报为凭证命中）
- `-SimpleMatch` 下**不要**再用 `[regex]::Escape`（转义反斜杠会被当字面量 → 「明明存在却报 NOT FOUND」）
- **多行 git commit message 用 `-F <文件>`**，不要用多个 `-m` + `` `n ``（会被拆成 pathspec 导致提交失败）

### 其它环境约束
- **后台子代理在本环境不可用**：`task(..., background:true)` 报
  `Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`
  → 所有派发必须**前台阻塞**
- `rg`(ripgrep) **不可用**，用 grep / read 工具
- 子代理返回 **`Task cancelled` ≠ 它没干活**（曾有一次报 cancelled，但它已补交了测试文件）

---

## 6. 规格与决策在哪（强烈建议接手先读这里）

```
D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\openspec\
├─ specs\                              6 份主规格 = 当前真相（需求 + 场景）
│  ├─ credential-storage-hardening      4 需求 / 16 场景
│  ├─ edge-auto-hide                   13 需求 / 29 场景   ← 贴边隐藏（含 finalize 轮 3 新增）
│  ├─ glm-coding-plan-monitor           7 需求 / 29 场景
│  ├─ main-process-resilience           4 需求 /  6 场景   ← 崩溃兜底 + 启动门控
│  ├─ token-monitor-adoption            5 需求 / 17 场景
│  └─ tokenhub-fallback-retention       4 需求 / 12 场景
├─ changes\
│  └─ archive\                        3 个已归档变更（含 design.md = 决策 + 排障全过程）
│     ├─ 2026-09-15-add-glm-coding-plan-monitor\
│     ├─ 2026-09-15-adopt-token-monitor\      （含 reconciliation.md 对账记录）
│     └─ 2026-09-15-harden-edge-auto-hide\    （含本补丁的全部决策与 3 个缺陷的定位过程）
└─ config.yaml
```

- **接手贴边功能，先读**
  `openspec\changes\archive\2026-09-15-harden-edge-auto-hide\design.md`（17 KB）
  —— 里面有为什么这样做、否决了哪些方案、以及三个缺陷各自的定位过程
- 当前**活动变更 0 个**；`openspec validate --all --strict` → **6 passed / 0 failed**
- openspec CLI：只要在 `token-monitor-workspace\` 或其子目录下执行就会自动使用该根

---

## 7. 环境事实

| 项 | 值 |
|---|---|
| OS | Windows 11 家庭版 中文版 build 26200 |
| 屏幕 | **1536x960，单显示器** |
| 系统主题 | **浅色模式**（TokenHub 悬浮窗是固定暗色 HUD，与桌面形成对比是预期的） |
| Python | 3.13.14（`python`；tkinter 8.6 可用；TokenHub 零第三方依赖） |
| Node | **v24.15.0**（`F:\A\node.exe`）；npm 11.12.1 |
| git | 2.55.0；**无 `gh` CLI**；`C:\Users\29871\.gitconfig` 不存在 |
| git 身份 | 各仓单独设的占位值：`29871` / `29871@localhost` |
| OpenCode auth store | `C:\Users\29871\.local\share\opencode\auth.json`，6 个 provider：`deepseek` / `opencode-go` / `zai` / `commandcode` / `zhipuai` / `zhipuai-coding-plan` |
| 后台子代理 | **不可用**（见 §5） |

---

## 8. 本会话的完整记录

`D:\桌面\私人图书馆\7-工具箱\1-project\opencode-session-f5d58bb8.html`
—— 7.14 MB 单文件 HTML，**385 条消息 / 1764 个 part**，含全部工具调用与输出、
思考过程、删除/截断交互；复刻 OpenCode 官方 share 页面样式（需要联网加载 marked.js / highlight.js）。

---

## 9. 立即上手的三条命令

```powershell
# 看 TokenHub 的规格与归档决策
explorer "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\openspec"

# 看 token-monitor 补丁与回退说明
Get-Content "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor-patch\README.txt"

# 校验 token-monitor 补丁仍然可用（克隆已在项目目录里）
cd "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor"
node --test tests/electron/edgeAutoHide.test.js tests/electron/windowBehavior.test.js tests/electron/tray.test.js
# 期望：34 / 9 / 52 全绿
```

---

## 10. 2026-09-16：升级官方 v0.58.0 + 补丁重交付

- 官方 v0.58.0 当天 14:24 发布（新增 Amp 会话统计、Factory Droid 额度）。
  应用内更新器其实自行装上了**无补丁官方版**（用户侧看是「卡住」）；
  NSIS 安装器顺带清掉了 resources 下自放的 app.asar.orig-backup 及 .unpacked（作废，无妨）。
- fork 已 rebase 到 v0.58.0（d426b8e），补丁链 11 提交（231f075…2834744）；
  本轮复验 5 套测试 **140/140 全绿**（旧文档 §9 的「34 / 9 / 52」口径已过时）。
- 交付链：官方 Setup 直链下载（SHA-256 e431146c… 与 release 元数据一致）→ /S 静默安装
  → 全新解包 2178 文件 → 覆盖 10 个 src 文件 → 自包含包 45,399,415 B → 换装
  → `verify_v0580.py` **ALL GREEN**（启动隐藏 3px 窄条 / 唤出收回 / 远边不误触发 / 无错误日志）。
- 回退锚点换新：`resources\app.asar.v0580-official.bak`（18,868,880 B）+ 同名 .unpacked 双胞胎。
- `edge-auto-hide.patch`（107 KB）/ `commits.txt` / `README.txt` 已按 v0.58.0 基线重写；
  干净 v0.58.0 检出上补丁重放校验通过。
- ⚠️ 给下次升级：NSIS 会清掉安装目录里一切自放文件——先备份再装，装完立刻重建回退锚点。

---

## 11. 2026-09-17：仪表盘钉住主页面板 —— 弹窗守卫的持久窗口豁免

- 用户反馈：从「活动」进入仪表盘后，主页面板（贴边 dock）永远不收纳、挡住仪表盘。
- 根因：edgePopupGuard 把本进程**所有**非主窗口都当临时弹窗——光标在
  dashboardWindow 上或其在前台时，`underOwned/fgOwned` 恒真，永远否决收起。
  （原调色盘修复的守卫范围过宽：临时弹窗与持久工作窗口被一视同仁。）
- 修复（提交 eb52336）：`popupHoldsCollapse({ persistentHwnds })` 豁免清单；
  main.js 新增 `edgePersistentWindowHwnds()` 返回 dashboardWindow 的 hwnd。
  豁免窗口不否决收纳；未知自有窗口仍保守否决（调色盘行为不变）。
  日后新增持久窗口必须加进同一清单（README 必读第 12 条）。
- 测试：edgePopupGuard 8→12（仪表盘光标下/前台不否决、取色器仍否决、
  无清单时保守默认兼容），五套合计 **144/144**。
- 交付：重解包 v0.58.0 官方 bak（2178 文件）→ deliver_finalize.py 换装。
  运行日志当场目击修复生效：`fgRoot=1247220 fgOwned=false exempt=1247220`
  （仪表盘在前台 → 不否决 → collapse 正常发射）。
- ⚠️ 该轮 deliver_finalize 有两个断言红（resize_repositioned / cycle_reveal），
  逐帧日志证实是**用户并发用鼠标**所致（出现大量不属于脚本的光标坐标、
  仪表盘被用户中途打开）——不是回归。日志已核：resize 同步尺寸 709×627 与
  脚本设定值一致、底边 3px。机器空闲时重跑一轮全绿留档即可。
- 归档：edge-auto-hide.patch 111 KB（12 提交，15 文件 +1880/−20）重生成，
  干净 v0.58.0 检出重放校验通过；commits.txt / README.txt 同步更新；
  deliver_finalize.py 的 BAK 锚点改为 app.asar.v0580-official.bak。

---

## 12. 2026-09-17：ZCode 会话标题（openspec 变更 add-zcode-session-titles）

- 用户反馈：会话列表里 ZCode 会话只显示裸 `sess_*` id，理不清对应哪个会话
  （OpenCode 会话有标题）。根因：`sessionMetadata.js` 的标题解析器注册表
  （claude/codex/opencode/droid/kimi/dsh）没有 zcode 条目。
- 关键事实：ZCode 自己在 `~/.zcode/cli/db/db.sqlite` 的 `session` 表存了
  `title`（子代理行 `parent_id` 指向父会话、title 是提示词原文）——数据现成。
- 实现（提交 61e1608）：新增 `providers/zcode/sessionMetadata.js`，`node:sqlite`
  只读（readOnly + busy_timeout=250，复用 opencode 模式），注册表加
  `['zcode', { resolve, retryAfterTimestampFallback: true }]`；子代理显示
  「↳ 父会话标题」；库缺失/损坏/驱动缺失全部静默回退裸 id。
- 测试 153/153（新增 zcodeSessionTitles 9：真 SQLite fixture DB）。
  **真库实测抓过一个 bug**：父会话与子代理同批请求时父标题漏查 → 补
  「同批父会话」用例后修复——真数据测试值得跑。
- 交付：12 文件覆盖 → pack 45,405,745 B → 换装重启，贴边 3px 正常、
  无错误日志；asar 内容核对含 zcode 模块。
- 归档：patch 122 KB（13 提交，18 文件 +2132/−21）重生成 + 干净 v0.58.0
  重放校验通过；openspec 变更已 archive；deliver_finalize.py FILES 12 项。

追加（2026-09-17，提交 1a361fb）：子会话标题加类型标签——「↳ 子代理 · 父标题」
「↳ 侧聊 · 父标题」（task_type 映射，未知类型显示原值；仅在父标题可得时附加）。
用户确认三行同题会话（主会话/子代理/侧聊）难以区分后加的。155/155 测试，
真库实测三条行显示正确。patch 125 KB（14 提交），重放校验通过。

---

## 13. 2026-09-17：ZCode 会话明细点入（openspec 变更 add-zcode-session-detail）

- 用户反馈：OpenCode 会话能点「>」看逐轮明细，ZCode 不能。原因：明细消费的
  中性事件流只有 opencode 实现了 `readSessionEvents`，渲染层可点白名单也没有 zcode。
- 实测发现 ZCode 的 `message`/`part` 表与 OpenCode 几乎同构（同 data JSON：
  role/cost/tokens{...cache{read,write}}；part 的 type/text/tool），opencode 的
  两条 SQL 几乎原样可用——仅排序改用 `sequence` 列。
- 实现（提交 41256a6）：zcode provider 增加 `readSessionEvents`；sessionDetail.js
  增加 `readZcodeSessionDetail`（groupEvents → period 过滤 → `distributeCost`
  按 token 占比分摊估算成本——订阅制下 message.cost 恒 0，直接求和会显示 ¥0）；
  app.js 两处白名单（affordance ~L2305、点击 ~L12977）加 'zcode'。
- 测试 160/160（新增 zcodeSessionDetail 5：分组/工具/成本分摊/缺库/坏库/白名单契约）；
  真库实测 587 事件、489 轮、445 轮带工具。**教训**：fixture 把 DatabaseSync 类
  当模块对象传入导致 found:false——openDb 已兼容两种传法。
- 交付：13 文件覆盖（FILES 增 sessionDetail.js）→ pack 45,411,331 B → 换装重启，
  贴边 3px 正常、无错误日志。patch 137 KB（15 提交，20 文件 +2407/−23）重放通过。

追加（2026-09-17，提交 7505480）：zcode 会话行补手掌光标与「›」affordance——
styles.css 的 per-client 选择器列表（cursor:pointer / row-metrics '>'）也是
按客户端硬编码的，上一轮加明细时漏了它。**教训：这类 per-client 白名单在
JS（2 处）和 CSS（2 处）共四份，新增可点入客户端时四处都要加**。
patch 139 KB（16 提交，21 文件 +2409/−25），重放校验通过。
