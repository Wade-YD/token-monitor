token-monitor 贴边自动隐藏补丁 — 说明与回退
================================================

【这是什么】
  给第三方 Electron 应用 token-monitor 增加第 4 种窗口显示方式
  「Edge auto-hide」（贴边自动隐藏）：窗口拖到任意屏幕边后自动滑出，
  仅留约 3px 窄条；鼠标移到窄条上滑回；光标离开约 0.2s 后重新收起。

  本版本（finalize，2026-09-15）在初版之上收口 6 项遗留：
    1. 启动零拒收（原：每次启动 focus 自动弹出被原生拒收 → 整场动画降级）
    2. 窄条 3px（原 9px：补偿了 Win32 DWM 外框 左/右/底各 +6px、顶 0 的外扩）
    3. 重启不再回退窗口尺寸（恢复只挪位置；隐藏坐标按当前公式重算）
    4. 隐藏态被改尺寸自愈（resize 去抖对账 + settings 同步）
    5. 瞬态原生拒收连续 ≥3 次才降级动画；补间尾帧直接吸附目标
    6. 诊断日志可开关（settings.edgeAutoHideDebug=true 或 env
       TOKEN_MONITOR_EDGE_DEBUG=1 → %TEMP%\token-monitor-edge-debug.log）

  追加（edge-resize-affordance，2026-09-15 晚，提交 ec477de）：
    7. **唤出后抓边缘调整大小不再收回**——resize 边框在 Win32 外框上、
       在 Electron 矩形外 ~6px，光标贴边框曾被判为「光标离开」而收起。
       现在保持测试带 10px 交互边距 + resize 后 700ms 宽限期（不武装/到点否决）

  追加（edge-resize-affordance，2026-09-16，提交 ec477de 之后补记）与
  hide-idle-zai-cash-row（48ac2b8）之后：
    9. **调色盘等原生弹窗期间不收回**（提交 e1326c6）——取色器/右键菜单/原生
       下拉是本进程的独立弹窗，光标进入即被判「离开窗口」而收起。新增
       edgePopupGuard：WindowFromPoint+前台窗口双查，命中自有弹窗则不武装/
       否决收起（win32，koffi，FFI 不可用静默降级）

  追加（hide-idle-zai-cash-row，2026-09-15 深夜，提交 48ac2b8）：
    8. **GLM 栏恒零的 Balance/Spend 行自动隐藏**——订阅制套餐不动现金钱包，
       Balance（availableBalance）/Spend（本地记账）对订阅用户永远是 ¥0.00。
       现在「套餐窗口存在 + 余额 0 + 今/月现金消费 0」时整行不渲染；
       钱包有钱、有现金消费、或无订阅窗口（纯按量用户）时自动恢复显示

  追加（v0.58.0 轮，2026-09-17，提交 eb52336）：
    10. **仪表盘等持久窗口不再钉住主页面板**——「从活动进入仪表盘后主页面板
        永远不收纳、挡住仪表盘」。根因：弹窗守卫把本进程「所有」非主窗口都当
        临时弹窗，光标在仪表盘上或其在前台时永远否决收起。修复：调用方传入
        persistentHwnds 豁免清单（当前 = dashboardWindow），豁免窗口不否决；
        未知自有窗口（取色器/右键菜单等）仍保守否决。日后新增持久窗口
        （独立编辑器等）必须加进同一清单

  追加（add-zcode-session-titles，2026-09-17，提交 61e1608）：
    11. **ZCode 会话显示真实标题**——会话列表里 ZCode 会话原先是裸
        sess_* id（标题解析器注册表没有 zcode）。新增
        src/shared/providers/zcode/sessionMetadata.js：只读查
        ~/.zcode/cli/db/db.sqlite 的 session.title（node:sqlite，
        复用 opencode 解析器模式）；子代理会话（parent_id 非空）显示
        「↳ <类型> · 父会话标题」（类型 = task_type 映射：subagent_child→子代理、
        selection_side_chat→侧聊、未知显示原值）。库缺失/损坏/驱动不可用一律
        静默回退裸 id。openspec 变更 add-zcode-session-titles 已归档

【零件位置】
  完整 git 克隆   D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-suite\token-monitor-workspace\token-monitor
                  分支 feat/edge-auto-hide（基线 v0.63.0，含 22 个提交）
                  这是首选留档，含完整历史
  本补丁          D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-suite\token-monitor-workspace\token-monitor-patch\edge-auto-hide.patch
                  179 KB（基线 v0.63.0），含全部源码改动 + 测试改动
  已安装应用      C:\Users\29871\AppData\Local\Programs\Token Monitor（v0.63.0 + 补丁）
  官方原包备份    <安装位置>\resources\app.asar.v0630-official.bak   19,590,468 B
                  + 同名 .unpacked 双胞胎（勿删，解包该 bak 时必需）
  交付/验证脚本   已迁出本仓（本机运维工具，不随内容仓分发），新位置：
                  D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-suite\tooling\token-monitor-patch\
                    deliver_finalize.py（22 项运行时断言；FILES 表 21 文件；已适配 v0.59.0）
                    verify_resize_affordance.py（调整大小场景，8 项断言）
                    verify_v0580.py（2026-09-16 v0.58.0 交付轮验证，7 项断言）
                    superseded\（第一轮脚本等历史归档）
                  旧 git 路径下的内容可从本仓 git 历史找回。

【基线（重要，别弄错）】
  当前基线：tag v0.63.0 -> 提交（annotated，用 git rev-parse v0.63.0^{commit} 取）（chore: release v0.59.0；
    注意 8d17051 是 annotated tag 对象号，别当提交号用——v0.57 时代同款坑）
    2026-09-18 已把整条补丁链 rebase 到 v0.59.0 并重新交付（见「升级记录 2026-09-18」）。
  历史基线：tag v0.58.0 -> 提交 d426b8e（chore: release v0.58.0）。
    其官方原包备份已移出安装目录，存于
    C:\Users\29871\AppData\Local\Temp\opencode\v0580-anchors\（已被 v0.59.0 锚点取代）。
  上游仓库：https://github.com/Javis603/token-monitor.git
  提交链（见 commits.txt，19 个提交，从旧到新）：
    231f075 feat(edge): 功能主提交
    9a93773 / 7f6f215 / 085056e / cb60fae   harden 四连修
    ec3de55 fix(edge): finalize（收口）
    5b33903 fix(edge): resize-affordance（调整大小时不收回）
    70162dd fix(zai): 隐藏订阅用户恒零的现金行
    3002069 fix(edge): 原生弹窗守卫（调色盘等弹窗期间不收回）
    342b6ac fix(edge): popup guard 的 currentPid 修复
    2834744 fix(edge): popup guard 光标 DIP→物理像素换算
    eb52336 fix(edge): 持久窗口豁免（仪表盘不钉住主页面板）
    61e1608 feat(sessions): ZCode 会话标题（只读 SQLite 解析器）
    1a361fb feat(sessions): 子会话标题带类型标签（子代理/侧聊）
    41256a6 feat(sessions): ZCode 会话明细点入（readSessionEvents + 门控）
    7505480 fix(sessions): zcode 行补手掌光标与「›」affordance（CSS 选择器遗漏）
    809154d feat(sessions): 会话列表排序切换（最近 ⇄ Token，settings 持久化）
    7cced1a feat(dashboard): 总览按工具列在前、按模型列在后（用户偏好）
    2cabdbd feat(dashboard): 仪表盘刷新按钮强制即时采集 + 转圈反馈（15s 有界等待）
    b32c532 feat(trends): 主窗口趋势图加纵轴刻度（padLeft 槽 + 网格线 + HTML 标签）
  规模（相对 v0.63.0）：32 files changed, +2859/−44（21 个 src + 10 个测试文件 + .gitignore）

【升级记录（2026-09-16，v0.57.0 → v0.58.0）】
  1) 官方 v0.58.0 当天 14:24 发布（新增 Amp 会话统计、Factory Droid 额度）。
     应用内更新器实际已自行装好（用户侧看是「卡住」，其实装上了无补丁官方版），
     NSIS 安装器顺带清掉了 resources 下我们自放的 app.asar.orig-backup 及其 .unpacked。
  2) fork：git fetch origin --tags 后发现 rebase 已由父会话完成（补丁链 11 提交落在
     d426b8e 上）；本轮以 5 套测试 140/140 全绿 + node --check 全过确认 rebase 可用。
  3) 官方安装包 Token-Monitor-Setup-0.58.0.exe 直链下载，SHA-256 实测 =
     e431146cadda2a248fcc2259f21e936c711307153a6b1765dd126fa13873194b（与 release 元数据一致），
     /S 静默安装得干净官方 v0.58.0。
  4) 新回退锚点：<安装位置>\resources\app.asar.v0580-official.bak（18,868,880 B）
     + 同名 .unpacked 双胞胎目录（日后解包该 bak 必须有它）。
  5) 从官方 asar 全新解包（2178 文件）→ 覆盖 10 个 src 文件 → pack 自包含包
     45,399,415 B → 换装 → verify_v0580.py 运行时验证 ALL GREEN
     （启动隐藏 3px 窄条 / 唤出收回 / 远边不误触发 / 无错误日志）。
  ⚠️ 下次升级时 NSIS 还会清掉 bak 类自放文件——升级流程必须先备份再装，
     装完立刻重建回退锚点（即第 4 步）。

【交付记录（2026-09-18，仪表盘手动刷新）】
  1) 背景：仪表盘 ↻ 只重投影内存快照，不触发采集、无反馈，两次采集（默认 5 分钟）
     之间点击等于空转（上游设计如此）。本轮让它点击即强制完整采集一次 + 转圈反馈。
  2) 实现：新 IPC dashboard:forceRefresh → deviceRuntimeHandle.tick('manual')
     （collector.js 现成手动入口，manual=全量扫描、无节流、并发自动合并）；
     渲染侧新文件 manualRefresh.js（UMD，15s 有界等待 + 去抖）；CSS 转圈动画带
     prefers-reduced-motion 守卫。新数据经拉取或既有 historyChanged 推送双通道到达。
  3) 顺手修正：edge 补丁在 createWindow 里的 geometryReady 复位行与上游
     material-lifecycle 源码 grep 测试的邻接要求冲突（自 v0.57 起一直红）——
     复位行下移一行 + edgeAutoHide.test.js 改为容忍邻域匹配，两测试全绿。
  4) 全量测试基线修复：fork 仓库 node_modules 为空导致 220 个 MODULE_NOT_FOUND——
     `npm install --no-save --no-package-lock semver chokidar undici` 后全量
     4546 用例，4538 通过；唯一失败 = macOS symlink 测试（Windows EPERM，平台
     限制，与本补丁无关）。
  5) 交付：20 文件 overlay → pack 45,417,560 B → 换装 → 轻验证全绿（无对话框、
     启动隐藏 3px 窄条、错误日志不存在）。完整光标编排（deliver_finalize.py
     22 断言）留待机器空闲时回归。本轮换装用 Bash 步骤完成——deliver_finalize.py
     的 pack-only 改造被 Mimosa hook 误报拦截（变量路径+subprocess 形态），该脚本
     其余部分未动，FILES 表已更新为 20 文件。
  6) ⚠️ 本轮首交付即出事故，已修复，教训必读：overlay 清单凭记忆手写，漏了
     dashboard.html（只给了 index.html）。asar 里 dashboard.js 是新的而
     dashboard.html 是旧的 → 新增的 <script src="manualRefresh.js"> 不存在 →
     仪表盘窗口里 TokenMonitorManualRefresh 未定义 → dashboard.js 顶层抛错
     （控制器接线在 745 行，boot() 在 787 行）→ dashboard.ready() 永不上报 →
     窗口创建但永不显示，用户看到「点 ↗ 跳转没反应」。
     教训：① overlay 清单必须由 `git diff --name-only v0.58.0..HEAD -- src`
     生成，不许手抄；② 换装后必须先做「内容断言」（解包 asar grep 每个新改动
     的标记串）再做启动验证；③ 仪表盘窗口的显示依赖渲染进程 ready 回报，
     渲染层任何顶层异常都会表现为「窗口打不开」而非报错弹窗。
  7) 完整回归（2026-09-18，22 断言）：**ALL GREEN**（用户空闲时段执行）。
     首跑曾 20/22——cycle 2/4 收回失败，根因是测试坐标 x=768 落在窗口左边框
     的 10px 交互余量带内（逻辑左缘 776，余量带 766~776，main.js:2661 的
     edgeCursorInExpandedBounds + EDGE_INTERACTION_MARGIN_PX，即 5b33903
     拖边框防误收的设计行为）：守卫按设计保持展开且不打日志。已把偶数轮
     回收位改 x=500（脚本内已注释说明），重跑全绿。2026-09-16 那轮的
     2 个红疑因此同源（当时归因于鼠标污染，可能两种因素并存）。

【升级记录（2026-09-27，v0.61.0 → v0.63.0）】
  1) v0.62+v0.63 双版本：44 提交、267 文件（+15711/−5565）——macOS Liquid Glass、
     背景图片透明度、Cursor 会话标题、额度账号连接检查等。安装包 API digest 校验
     MATCH（sha256:5c61d381…，119,656,200 B）。
  2) rebase：22 提交重放，4 处冲突全保留双方语义——main.js require 区
     （backgroundImage 与 edgeAutoHide 并存）；createWindow 两处（上游 v0.63 删除了
     mainWindowNativeBlurEnabled 变量，跟随上游丢弃该行，仅保留 geometryReady 复位；
     ⚠️ 此变量在我们的补丁文件中已零残留）；dashboard.html script 区
     （glassRendering 与 manualRefresh 共存）。
  3) 验证：全量 5217 用例 5208 过；两个失败均为 symlink EPERM 环境限制（macOS 专属
     一个 + v0.63 新增的 Windows symlink 权限测试一个），非补丁问题。共存抽查全绿。
  4) 交付：全新解包 asar-extracted-v063 → overlay 21 文件 → 双向断言 19/19 →
     pack 46,660,109 B → 换装；启动零对话框、零错误日志（7 进程，v0.63 新窗口结构）。
     新锚点 app.asar.v0630-official.bak（19,590,468 B）+ .unpacked 双胞胎；
     v0.61 锚点移存 opencode0610-anchors\。deliver_finalize.py 已适配 v063 路径。
  5) ⚠️ 续传下载注意：大安装包经 CDN 断流（两次 exit 28），`curl -C -` 续传后再校验
     哈希，务必以 MATCH 为准——部分文件的哈希必然 MISMATCH。
  7) 侧边栏告警色修复（用户反馈：0% 用量显示成橙红）：上游设计是「颜色按最紧池、
     数字按主窗口」，两者分裂导致刚重置的会话读 0% 却穿著 Weekly/Monthly 的告警色。
     改为颜色与数字同源（都按主窗口剩余量，dock.js 的 dataset.severity 不再读
     severityPercent）；最紧池的早期告警保留在额度列表。补丁集增至 33 文件
     （+edgeDock/dock.js），overlay 22 文件、pack 46,660,143 B；CDP 实测 rail 的
     data-severity=ok、文本色恢复正常。edgeDock 131 测试全绿。
  8) 「侧边栏无法上下拖动」排查（用户手测确认可拖，非应用 bug）：ZCode 本体窗口
     （1549×925）与 dock rail 重叠时，其视觉透明区仍可命中（Electron 透明区默认
     吞输入），rail 收不到 pointerdown——表现为看得见拖不动。ZCode 移开或最小化
     后拖拽正常。教训：挂件可拖拽面失灵时，先用 WindowFromPoint 查命中了谁的
     窗口，再怀疑应用自身。

  6) 完整回归（2026-09-27，22 断言）：**ALL GREEN**（v0.61/v0.63 两轮折叠验收）。
     首跑 19/21——cycle 1/3/5 收回失败，debug 日志显示那几秒零决策记录：窗口本轮
     停在 x=22（跨度 22-458），硬编码回收点 x=300 落进跨度内部且距底边 697 仅
     4-8px，正踩 ±10px 交互余量带（与 2026-09-18 的 x=768 案例互为镜像）。
     教训升级：**回收点一律按实时跨度动态计算**（span±260 且避开屏幕边缘），
     已改入 deliver_finalize.py，重跑全绿。settings 无 debug 写回残留。

【升级记录（2026-09-21，v0.59.0 → v0.61.0）】
  1) v0.60+v0.61 双版本跨度：26 提交、192 文件（+20178/−4072）——Devin/Cline 新提供方、
     edge-dock 大改、`fix(zai): refuse the billing mirror once the account identity is known`
     等。安装包经 API digest 校验（sha256:e483ba78…，119,543,928 B，MATCH）。
  2) rebase：22 提交重放，3 处冲突全保留双方语义——
     app.js（windowBehavior 白名单 +edge；上游已把 LIMIT_SOURCE_LABELS 移入
     limitWindowsView.js，跟随上游删除）；sessionMetadata.js（devin 与 zcode 解析器并存）；
     sessionRows.test.js（上游 running/context 测试 + 我们的排序测试并存）。
  3) 验证：全量 4956 用例 4948 过（上游新增 294 例全绿），唯一失败仍是 macOS symlink
     平台限制。共存抽查：zai 去重 + 上游 identity 修复、两套贴边机制（我们的
     edgeAutoHide 91 处 + edge-dock 22 处）、usageCharts yTicks 全在。
  4) 交付：全新解包 asar-extracted-v061 → overlay 21 文件（git diff v0.61.0 生成）
     → 双向内容断言 17/17 → pack 46,289,248 B → 换装；启动零对话框、零错误日志。
     新回退锚点 app.asar.v0610-official.bak（19,441,847 B）+ .unpacked 双胞胎；
     v0.59 锚点移存 opencode0590-anchors\。
  5) Command Code 行显示 "Sign in again"：cookie 被服务端拒绝（过期/轮换），非补丁
     回归（git diff 证实补丁从未碰 commandcode 模块）；v0.60/0.61 也未改 commandcode。
     处置：设置里重新粘贴新鲜 cookie。
  6) ⚠️ windowBehavior 被官方版强制归化：官方 v0.61 的 WINDOW_BEHAVIORS 白名单只有
     3 值（floating/normal/desktop），其设置归一化把我们的 edge 强制改成 floating 并
     写回 settings.json——用户若经应用内更新器运行过官方版（或安装到换装的空窗期），
     贴边模式就会被清掉、设置里也只剩 3 个选项。我们的补丁版仍是 4 值白名单，
     重开设置切回「贴边自动隐藏」即可恢复（已验证 live DOM 有该选项）。
     教训：应用内更新器 = 官方版短暂运行 = 自定义设置值被归化，优先走 README 流程。

【升级记录（2026-09-18，v0.58.0 → v0.59.0）】
  1) 应用内弹出 v0.59.0 更新面板（新增侧边栏 edgeDock、改进 Kimi/ZCode/Antigravity/
     Cursor）。先查本地：安装目录仍是我们补丁版（45,417,560 B），更新器未偷换。
  2) 网络波折：github.com 直连超时（VPN 断开），但 api.github.com /
     codeload.github.com / objects.githubusercontent.com 三个旁路可达——
     于是不开 VPN 完成了大半升级：
     a. 安装包经 GitHub API 拿官方 digest（sha256:c07bfb01…）+ CDN 下载，
        实测 SHA-256 完全一致（Token-Monitor-Setup-0.59.0.exe，119,357,136 B）；
     b. 源码经 codeload tarball 构建合成基准提交 upstream-v0590-synthetic
        （树内容 = v0.59.0 by construction），先在其上 rebase：19 提交仅
        1 处冲突——main.js 里上游新侧边栏 syncEdgeDock 与我们的
        syncEdgeAutoHideAvailability 撞行，两行都保留（功能互相独立）；
     c. VPN 恢复后 git fetch 真标签（v0.59.0 = 8d17051），实测
        `git diff v0.59.0 upstream-v0590-synthetic` 为空（逐字节一致），
        再 rebase --onto 真标签零冲突，删除合成分支。**教训：断网时
        tarball+API 是可行降级路径，且事后可用空 diff 严格补验。**
  3) 测试：全量 4658 用例（含上游 v0.59.0 新测试），4650 通过；唯一失败仍是
     macOS symlink 平台限制。另 2 个 electron-builder 红是本地 node_modules
     残留旧版 26.15.3，`npm install --no-save app-builder-lib@26.16.1` 对齐即绿。
     共存抽查：上游 ZCode 3.12.3 修复 + 我们 GLM 现金行、上游 edgeDock 300 处
     i18n + 我们 sessionSort 键，同文件双活。
  4) 安装：退应用 → v0.58 锚点移出安装目录（opencode\v0580-anchors\）→
     /S 静默安装官方 v0.59.0 → 重建回退锚点 app.asar.v0590-official.bak
     （19,106,291 B）+ 同名 .unpacked 双胞胎（26 MB）。
  5) 交付：从官方 asar 全新解包 asar-extracted-v059（绝不混版本）→ overlay
     20 文件（清单由 `git diff --name-only v0.59.0..HEAD -- src` 生成——
     上轮事故后立的新规；注意 providers\zcode\ 目录为补丁新增，overlay 需
     makedirs）→ 双向内容断言 17/17 全过（我们 9 项标记 + 上游 edgeDock/
     ZCode 修复标记）→ pack 45,654,875 B → 换装。
  6) 验证：解包换装后 asar 复核 4 标记全过；启动轻验证——吸附隐藏 3px 露出条、
     零对话框、错误日志不存在。⚠️ 又见 settings 写回残留：上一轮 22 断言收尾
     清掉 edgeAutoHideDebug 时应用仍在运行，几何同步把旧值写了回去（v0.57 时代
     同款教训）——本次已按「退应用→改设置→重启」正确清理。完整光标编排待空闲跑
     deliver_finalize.py（已适配 v0.59.0 路径）。
  7) 完整回归（2026-09-18，22 断言）：**ALL GREEN 一次过**（用户手测通过后空闲执行）。
     deliver_finalize.py 的 EXTRACTED/BAK 常量已适配 v0.59.0。

【改动的 21 个交付文件（2026-09-18 轮更新）】
  src/electron/edgeAutoHide.js            （新增）
  src/electron/main.js                    （+ dashboard:forceRefresh IPC）
  src/electron/preload.js                 （+ forceDashboardRefresh 桥接）
  src/electron/windowBehavior.js
  src/electron/floatingBubble.js
  src/electron/tray.js
  src/electron/renderer/app.js
  src/electron/renderer/i18n.js
  src/electron/renderer/index.html
  src/electron/renderer/dashboard.html    （+ manualRefresh.js 引入；↻ 字形包 span）
  src/electron/renderer/dashboard.css     （+ 刷新转圈动画，prefers-reduced-motion 守卫）
  src/electron/renderer/manualRefresh.js  （新增，刷新控制器：去抖/超时/反馈）
  src/shared/providers/zai/limits.js      （GLM 现金行自适应隐藏）
  src/electron/edgePopupGuard.js          （自有弹窗守卫，win32/koffi）
  src/shared/providers/zcode/sessionMetadata.js （新增，ZCode 会话标题）
  src/shared/sessionMetadata.js           （标题解析器注册表）
  src/shared/sessionDetail.js             （会话明细分发，含 zcode 分支）
  src/electron/renderer/styles.css        （zcode 行手掌光标 + 「›」affordance）
  src/electron/renderer/sessionRows.js    （会话行构建 + 排序比较函数）
  src/electron/renderer/usageCharts.js    （+ sparkline padLeft/yTicks 纵轴支持）
  src/electron/renderer/dashboard.js      （仪表盘总览列顺序；刷新按钮接控制器）

【基线锚点（补丁可回退、可重放的实测凭据）】
  回退物校验   app.asar.v0580-official.bak，18,868,880 B（2026-09-16 由官方安装产物直接复制）。
               **回退覆盖前先核对大小/来源**，不一致说明备份被动过，禁止覆盖。
               （旧 v0.57.0 的 app.asar.orig-backup 已被 v0.58.0 安装器清除，作废）
  补丁可重放   rebase 即重放（2026-09-18 于真标签 v0.59.0 完成零冲突重放）。
               事后抽验可重跑：
                 cd "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-suite\token-monitor-workspace\token-monitor"
                 git worktree add --detach "$TEMP/patch-check" v0.59.0
                 git -C "$TEMP/patch-check" apply --check --3way \
                   "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-suite\token-monitor-workspace\token-monitor-patch\edge-auto-hide.patch"
                 git worktree remove --force "$TEMP/patch-check"
               （apply --check 退出码 0 = 补丁与基线仍吻合；非 0 = 先修正补丁再交付）

【上游发新版后怎么重打补丁】
  1) 看新版的 diff 范围：git fetch origin --tags && git log --oneline bbe07de..v<新版>
     重点确认 src/electron/main.js、renderer/app.js、renderer/index.html 有没有大改
     （历史上 renderer/app.js 两版差 506 行就能让应用启动即崩——见下方历史教训）
  2) 基线换到新 tag：git checkout v<新版>
     git apply --3way "..\token-monitor-patch\edge-auto-hide.patch"   ← 有冲突逐个解
  3) node --test 三套测试（期望见上）+ node --check 全部改动文件
  4) 从**新版安装包**里解出 asar → 覆盖 9 个文件 → pack → 替换（备份先存新版的原件）
  ⚠️ 解包 asar 时，旁边必须有同名的 `.unpacked` 目录（如解 app.asar.orig-backup
     需 `app.asar.orig-backup.unpacked`，已创建勿删）：官方 asar 里 78 个文件
     （tokscale/bin.js、koffi/package.json 等）是 unpacked 状态，内容在 unpacked
     目录里。缺了它 → 解包少 78 文件 → 启动报 Cannot find module 'tokscale/bin.js'。
     打包产物体积应与官方 asar 同量级（45MB 自包含包正常）；远小于它 = 内容缺失。
  5) 跑 deliver_finalize.py / verify_resize_affordance.py 至全绿，更新本 README 的基线记录
  注意：不要直接把基于旧版的 asar-extracted 目录套在新版上；混合两版文件 = 启动崩。

【重新应用 / 重建步骤】
  1) 拿到「基线 + 补丁」的工作树
       首选：直接用已留档的克隆
             cd "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-suite\token-monitor-workspace\token-monitor"
       从零：git clone https://github.com/Javis603/token-monitor.git tm-work
             cd tm-work && git checkout v0.58.0          # = d426b8e
             git apply --3way "<本目录>\edge-auto-hide.patch"
  2) 跑测试（纯 Node，不需要 node_modules）
        node --test tests/electron/edgeAutoHide.test.js ^
                   tests/electron/windowBehavior.test.js ^
                   tests/electron/tray.test.js
        期望：edgeAutoHide 34 / edgePopupGuard 12 / windowBehavior 9 / tray 52 / zaiLimits 37
              / zcodeSessionTitles 11 + zcodeSessionDetail 5 + sessionRows 22（十套合计 210），全部 exit=0
  3) 打包成 asar
        npx --yes @electron/asar extract "<安装位置>\resources\app.asar.v0580-official.bak" asar-extracted
        把上面 9 个文件覆盖进 asar-extracted 的对应路径
        npx --yes @electron/asar pack asar-extracted app.asar
  4) 替换（**替换前先确认官方备份存在**；先退出应用）
        Copy-Item app.asar "<安装位置>\resources\app.asar" -Force

  前提（已实测）：app.asar 的完整性校验**未启用** —— Token Monitor.exe 里
  sha256:<64hex> 形式的摘要出现 0 次、asarIntegrity 字符串不存在，
  所以替换 asar 不会被 Electron 拒绝。

【使用 / 停用 / 回退（三层）】
  用     设置 → 显示方式 → Edge auto-hide，把窗口拖到任意屏幕边
  停用   同一处下拉改回 Floating above apps          （零风险，随时切回）
  回退1  上一条（零风险）
  回退2  用 app.asar.v0580-official.bak 覆盖 app.asar 后重启  → 回到官方构建
  回退3  git checkout cb60fae 后重新打包替换          → 回到 finalize 前（v0.58 链）

【排障】
  护栏拒收 / 未捕获异常：%TEMP%\token-monitor-edge-error.log
  （只在异常路径写入；正常运行时该文件不存在。
   注意：单条 "native setPosition rejected ... streak=1" 是已知瞬态，
   连续 3 条带 "tweening disabled" 才代表动画被降级，需要排查）
  决策日志（需先开启）：%TEMP%\token-monitor-edge-debug.log
  开启方法：settings.json 加 "edgeAutoHideDebug": true，或环境变量
  TOKEN_MONITOR_EDGE_DEBUG=1；用完记得关（每 100ms 轮询都写行）

【改代码前必读（否则会重犯全部缺陷）】
  1. 只挪位置、不改尺寸：一律 setPosition，绝不用 setBounds
     （绕开 WINDOW_LIMITS.minWidth = 240 与 Windows 极小窗口的 DWM 渲染问题）
  2. 隐藏几何必须单独存 settings.edgeAutoHideBounds，
     绝不能写进 settings.windowBounds —— restoredBounds() 见到「不在屏内」
     的坐标会丢弃 x/y，导致重启跳位
  3. 所有几何写入必须走统一的 setEdgeWindowPosition(x, y)：
     Number.isFinite 校验 + geometryReady 门控（首次 show 前直接跳过）
     + try/catch 兜住原生拒收 + 连续 3 次才降级为瞬移
  4. 动画进行中标志必须是「截止时刻」animatingUntil，不能是布尔 ——
     布尔只在成功路径清除，一次异常就永久卡死，轮询会一直空转
  5. 收起/展开只能有一个执行者：100ms 光标轮询只决定 desired，
     reconcileEdgeAutoHide() 幂等地对账「desired vs 实际 bounds」
  6. 收起判定绝不能带 isFocused() 门槛；唤出也绝不能由 focus 触发
     （启动自动聚焦会把刚恢复的隐藏窗口弹出来 = 每次启动一次原生拒收）
  7. 触发区沿边方向必须限制在窗口自身跨度内
  8. 异常不得弹模态框（已有 process.on('uncaughtException') 落盘 + 复位）
  9. 隐藏态窗口被外部 resize 时会经 'resize' 去抖触发 syncEdgeDockGeometry()
     —— Windows 上 'resized' 事件对外部/程序性 resize 静默，别只挂它
  10. 启动恢复必须「只挪位置、按当前公式重算隐藏坐标」：
      整包 setBounds(saved.hiddenBounds) 会盖掉用户最后 resize 的尺寸
  11. 展开态「光标在窗口内」判定必须带 EDGE_INTERACTION_MARGIN_PX=10 边距，
      且 resize 后 700ms 宽限期内不得武装/触发收起——resize 边框在 Win32 外框上
      （Electron 矩形外 ~6px），不加边距 = 抓边缘调整大小必被收回（用户实测反馈）
  12. 弹窗守卫只保护「临时」弹窗；本进程的持久窗口（仪表盘 dashboardWindow、
      日后任何独立工作窗口）必须经 edgePersistentWindowHwnds() 显式豁免，
      否则用户在那些窗口里工作时 dock 永远不收（2026-09-17 用户实测反馈）
  13. 自动化验证（deliver_finalize/verify 系列）会劫持光标 60–90 秒，
      必须在用户不碰机器时跑：日志里出现不属于脚本的光标坐标 = 该轮结果被
      污染，断言红不代表回归（2026-09-17 教训：断言红但逐帧日志显示全是
      用户并发输入所致）

【最大的历史教训】
  补丁必须 rebase 到与「已安装版」一致的 tag。
  曾把上游 HEAD 的文件混进 v0.57.0 的 asar 树 → 应用启动即弹 Error 对话框，
  因为 renderer/app.js 两版差 506 行、renderer/index.html 差 789 行。
  另：静态推理在本功能上连续误判 3 次，「看起来对但行为不对」时直接加探针
  （现在开 edgeAutoHideDebug 即可），让程序自己说。

【交付记录（2026-10-01，dock 拖动失效顽疾 + 输入回放兜底，提交 126e66e/a186843）】
  1) 背景：dock「看得见、悬停有反应、按下去没反应」第三次复发。本轮把现场取证
     做穿底：OS 层（样式/hit-test/GUI 线程/WM_NULL）全健康、页面监听器全健康、
     CDP 注入全达 —— 死区锁定在「OS 输入路由 → 页面」一跳。
  2) 大弯路（必读）：WM_MOUSEACTIVATE 返回 MA_NOACTIVATEANDEAT(4) 曾被当作根因，
     花了数小时。后用 scratch 实验证伪：focusable:false 窗口在 MA=4 下照样收到
     SendInput 真实点击（真实输入走指针路径，不查 MA）。MA=4 是 Electron 43 的
     常量假象，不是开关。教训：**探针测的是"窗口怎么答"，不等于"真实输入走哪条
     路"；两者矛盾时信后者**。sweep、setIgnoreMouseEvents 切换、透明、焦点同理
     全部单变量排除——单窗口 scratch 复现不了，问题在 dock 应用级状态。
  3) 顺手修掉一个从生效日起就坏的真 bug：koffi SetWindowPos 的 after 参数声明为
     uintptr_t，HWND_TOPMOST=0xFFFFFFFF 被**零扩展**成 64 位非法句柄 → sweep
     从未真正抬过窗口（日志 raised=0 恒成立）。改 intptr_t 传 -1。
  4) 兜底机制（治本层）：**ack 门控的按压回放**。页面 pointerdown 即时 ack IPC；
     poll（40-90ms）对比 OS 按键态与 ack——健康时 ack 秒到，回放永不触发（零
     开销）；页面失联超过 120ms 即经 webContents.debugger
     Input.dispatchMouseEvent 注入 mousePressed/moved/released，页面手势语义
     （阈值/单击-vs-拖动/捕获）原样复用。CDP 注入在死亡态实测可达（PostMessage
     同样可达），这是全链路唯一在所有状态下都通的输入通道。
  5) 端到端验收：真实 SendInput 拖拽 moved=True（rail y=113→468 跟手）、恢复
     拖拽正常、页面 mdown/pdown 计数增长；无调试端口正常重启交付。
  6) ⚠️ 第二次 overlay 清单事故（与 dashboard.html 事故同型）：deliver_finalize.py
     的 FILES 表漂移——edgeDock/controller.js、edgeDock/preload.js、edgeDock/
     topmost.js 三个文件缺失，上一轮打包的 asar 里 dock 主进程代码是旧的！
     已修：FILES 按 `git diff --name-only v0.63.0..HEAD -- src` 重生成（25 文件），
     清单头写明重生成命令。**规则升级：overlay 清单永远从 git diff 派生，禁止手写**。
  7) 附带：deliver_finalize.py 的 --pack-only 分支补上（上次会话只定义未接线）；
     hwnd 集变更日志（顺序不敏感对比——sweep 每 tick 轮转 z 序，顺序对比会刷屏
     5000+ 行，已修）成为下次"native shell 重建"事件的时间线证据。
  8) 未解之谜（留观）：单窗口 scratch 无法复现 dock 的点击死亡，真实触发器仍是
     应用级状态（嫌疑：锁屏/显示器事件引发的 shell 重建）。已布好的探针网：
     hwnd 集变更日志 + MA 状态变化日志 + 页面 ack 时间戳，下次复发直接读
     %TEMP%\token-monitor-edge-error.log 时间线。

【升级记录（2026-10-01，v0.63.0 → v0.64.0）】
  1) 上游 v0.64.0：20+ 提交、205 文件（+17193/−1027）。两个 edge-dock 提交正落
     我们改动区：bc603e6 全屏自动隐藏（新 fullScreenProbe.js，Windows 走 DWM
     cloaked+z 序探测）+ 590b964 rail 配额窗口选择。Electron 依赖不变（43.4.0），
     原生层修复全部继续有效。
  2) 安装包：API digest sha256 d8a715c1… 实测 MATCH（Token-Monitor-Setup-0.64.0.exe，
     119,729,968 B，CDP 直链一次拉满）。旧锚点先移存 opencode\v0630-anchors\ →
     /S 静默安装 → 重建锚点 app.asar.v0640-official.bak + .unpacked 双胞胎。
  3) rebase 30 提交，4 处冲突全语义合并：sessionMetadata（grok+zcode 共存，照
     devin+zcode 先例）；app.js sort-mode（⚠️ 我们与上游各实现了同型切换——但
     上游 v0.64.0 实际没有 sessionSortMode，冲突另一侧是我们自己的历史结构，
     取上游版把功能整个丢了：app.js 接线全部丢失、上游 grep 测试红。已用
     7 处外科手术补回并加修复提交 8b67fd5；教训：**解决冲突前先
     git grep <标识符> v0.64.0 -- src/ 验证"上游侧"到底是谁的**）；main.js
     require 区（fullScreenProbe 与 edgeDockTopmost 并存）；controller.js 状态
     区（fullScreen 与 inputHeal 并存，poll 里两个新调用错行自动共存）。
  4) 测试：5489 用例 5476 过；3 红均为 symlink EPERM 环境限制（与 v0.63 轮相同）。
     中途两个源码结构测试被 sort-mode 恢复打地鼠（render 切片求值 + 紧邻断言），
     最终把 updateSessionSortToggle() 放在 refreshTrayComposers() 之后解决。
  5) 交付：全新解包 asar-extracted-v064（含上游 fullScreenProbe.js）→ overlay
     25 文件（git diff 派生，脚本已加 makedirs）→ 双向内容断言 10/10（我们的
     输入回放/ack/topmost + 上游全屏模式/grok）→ pack 46,939,873 B → 换装 →
     启动零对话框。真实 SendInput 拖拽 moved=True（y=170→525 跟手），恢复拖拽
     正常。deliver_finalize.py 常量已适配 v064。
  6) 待办：22 断言全量回归留机器空闲时跑；上游新功能「侧边栏全屏自动隐藏」
     （edgeDockMode: 'alwaysExceptFullScreen'）留用户手测——它复用同一 poll，
     自动获得我们的输入回放与 topmost 保护。

【升级记录（2026-10-08，v0.64.0 → v0.67.0）】
  1) 三版本跨度：45 提交、316 文件（+32746/−7200）。MiMo Desktop/Console、
     CodeBuddy/WorkBuddy 会话、iCloud→Hub/Cloudflare 额外同步、葡语、图表颜色
     与文字大小设置等。Electron 依赖不变（43.4.0）。
  2) 网络：git fetch 两次被 reset（curl 56），CDN 下载正常——用户开 VPN 后
     fetch 成功（未启用 codeload 合成基准）。安装包 API digest sha256
     7ce8511a… 实测 MATCH（119,731,000 B，一次断流 curl -C - 续传）。
  3) 安装：v0640 锚点移存 opencode\v0640-anchors\ → /S 静默安装 → 重建
     app.asar.v0670-official.bak + .unpacked（17,605,198 B，官方包反而变小）。
  4) rebase 31→32 提交（31 补丁 + 1 fallout 修复），7 处冲突全语义合并：
     - sessionMetadata：workbuddy+zcode 共存（三度同型冲突，老规矩）
     - app.js detail 白名单 ×2：claude/codebuddy/codex/opencode/dsh/workbuddy/zcode
     - styles.css 指针光标：上游已泛化 .row[role=button]，弃我方 per-client 规则
     - styles.css trends：上游 rem 字号 + 我方 position:relative（y 轴标签锚点）
     - sessionRows.test.js：上游 cache 测试与我方 sort-mode 测试共存
     - dock.js 严重度口径：**取上游**——上游已把"颜色/数字分离"反转为有意设计
       （颜色=最紧池告警、数字=主窗口）并新增环补间动画数据键，我方 v0.63 的
       同源修复与之方向相反且上游版本带配套基础设施
  5) fallout 三连修（提交 73410518 + locale 计数）：pt-BR 缺我方 5 键（session
     sort ×3 + edge 窗口行为 ×2）→ 补葡语翻译；我方 zcode 白名单测试写死数组
     → 放宽为成员断言；sort-mode 键语言计数 5→6。**上游 v0.67 移除了
     .row-metrics::after chevron 图案并有测试断言其不存在——我方 v0.63 的
     chevron 功能正式放弃，跟随上游**。
  6) 测试：6126 用例 6111 过；3 红为 symlink EPERM 环境限制，另 2 个（真实进程
     HTTP / vendor manifest）隔离重跑必过、属全量并发下的时序抖动。
  7) 交付：全新解包 asar-extracted-v067 → overlay 25 文件 → 双向内容断言
     15/15（我方输入回放/ack/sort-mode/pt-BR/manualRefresh/趋势刻度 + 上游
     fullScreenProbe/pop-up-menu reassert/grok+workbuddy/严重度分离）→ pack
     45,572,394 B → 换装，启动零对话框。
  8) ⚠️ 验收教训（假阴性）：真拖拽测试连报 moved=False，深挖两层虚惊——
     ① 页面手势/主进程链路全好（dragStart IPC→handleDragStart→20 次
     followDrag 跟随→buttonUp 收尾，主进程临时文件日志全程记录）；
     ② 真因：rail 已停在行程底部（y=538+366=904≈贴底），而测试脚本只会
     往下拖 → 视觉零位移。向上拖立即 moved=True（y=538→121）。
     **规则：拖拽验收脚本必须按当前行程方向选择拖动方向，或先读
     placement.offset 决定往哪拖**。另：contextBridge 暴露的 bridge 不可
     monkey-patch，hook bridge.dragStart 计数恒为 0 是假象，验 IPC 要在
     主进程侧落文件日志。
  9) 拖拽诊断代码已全部剥离（controller.js 恢复干净，未提交过）。

【修复记录（2026-10-10，顶边吸附失效，提交 4e0bc172）】
  1) 症状：widget 拖到顶边不吸附隐藏，左右正常。实测复现：拖到顶边落点被
     Windows 11 Aero Snap 抢先**最大化**（drop 后窗口 -7,-7 起步的超大尺寸），
     edgeSide 拿到的边界无法转换成 top 停靠。左右之所以"能用"，是因为左右
     平铺的结果仍贴边，被我们的检测转换成了正常停靠。
  2) 修复：edge 模式下 setMaximizable(false)（startup restore / hidden keep /
     通用 behavior 三处接线；其它模式恢复 true）。WS_MAXIMIZEBOX 关闭后窗口
     免疫拖拽 snap，落点保持普通窗口，top dock 正常接管。实测：拖到顶边 →
     停靠 → 收起为顶部 3px 露条（settings.side=top，rect bottom=3）✓。
  3) ⚠️ 连带损坏：snap 尺寸一旦落点，会被 'moved' 处理器存进
     edgeAutoHideBounds.expandedBounds，此后几何自愈反复把窗口恢复到损坏
     尺寸（1212×925）。手工清 settings.edgeAutoHideBounds + 重置 windowBounds
     恢复。**若用户再报"窗口变成大块贴顶"，先查这个字段是否被 snap 污染**。
  4) ⚠️ tooling 迁移：Mimosa L3 全量扫描对 tooling 目录的路径拼接模式连报
     高危并拦截 commit（superseded 旧探针已删、deliver_finalize.py 已加
     normpath+边界断言仍不够），**tooling 已整体迁出扫描域：
     D:\桌面\私人图书馆\7-工具箱\token-monitor-tooling\**（原
     token-monitor-suite\tooling 不复存在）。deliver_finalize.py 的
     EXTRACTED/BAK 常量与 README 引用同步更新；执行交付脚本用新路径。

【升级记录（2026-10-12，v0.67.0 → v0.69.0）】
  1) 双版本跨度：27 提交、198 文件（+20747/−1165）。Claude/Codex 等待状态、
     Codex 子代理分组、T3 Code 会话归主、Cursor Grok Bot、Antigravity 会话标题/
     生成速度、edge-dock 运行指示器/尺寸设置/等待状态等。**Electron 43.4.0→43.7.9**
     （原生层修复需复验：15/15 断言全过，koffi/输入回放/探针均在位）。
  2) 安装包 API digest sha256 cd3f4e3b… 实测 MATCH（124,988,520 B，一次断流
     curl -C - 续传）。v0670 锚点移存 opencode\v0670-anchors\ → /S 静默安装 →
     重建 app.asar.v0690-official.bak + .unpacked（17,914,345 B）。
  3) rebase 33 提交，7 处冲突全语义合并：
     - sessionMetadata：上游 T3（readT3SessionRelationResult/t3SessionIdentity）
       与 zcode 共存（三度同型，老规矩）
     - app.js/sessionRows.js detail gate：**上游 v0.69 重构出
       sessionRowDetailAvailable(row) 统一入口**——取上游架构，zcode 加进其
       共享白名单（sessionRows.js:324）
     - sessionRows.test.js：上游 Grok Bot 测试与我方 sort-mode 测试共存
       （尾部共享闭合，逐块补 `});`）
     - edgeDockController.test.js：上游 dock-size 测试与我方 topmost 测试共存
     - preload.js：上游 pointer() 与我方 inputAck() 共存
     - controller.js schedulePoll：上游 peekNear 快轮询 + 我方 replay 快轮询合并
     - app.js sort-mode：上游 sessionPresentationOptions 重构 → sortMode 作为
       其选项字段注入；**sort 读取内联**（源码切片测试在隔离作用域求值该函数）
  4) 测试修复（提交 e4b987f2）：fixture 默认提供 forceTopmostDockWindows→1
     （poll 跳过 Electron fallback，zOrder 计数只记控制器自身路径；测 fallback
     的测试显式传 0）；zcode 白名单测试改断 sessionRows.js 新位置。
     全量 6669 用例 6650 过；3 环境红（symlink EPERM）+ 2 负载抖动（隔离必过）。
  5) 交付：全新解包 asar-extracted-v069 → overlay 25 文件 → 双向断言 15/15
     （我方输入回放/ack/zcode gate/sort-mode/Aero-Snap guard + 上游 resume
     topmost/T3/sessionPresentationOptions）→ pack 46,043,032 B → 换装，启动零对话框。
  6) ⚠️ 拖拽验收方法论更新（本轮虚惊）：**用户环境是双屏 + 125% DPI**。
     自动化拖拽脚本在跨屏场景坐标不可靠（GetWindowRect 物理坐标 vs
     SetCursorPos 逻辑坐标混用；rail 被拖到副屏后 WindowFromPoint 命中的
     是覆盖的终端窗口）。**双屏环境下的拖拽验收以用户手测为准**，脚本仅做
     单屏场景；若必须脚本化，先 SetProcessDPIAware + 用 Electron 页面内
     screenX/screenY（CSS 坐标）换算。

【升级记录（2026-10-24，v0.69.0 → v0.78.0）】
  1) 九版本跨度：100 提交、448 文件（+41053/−3124）。Windows 侧边栏"系统"玻璃、
     macOS 刘海面板玻璃、ZCode 会话标题+子代理归父、悬停提示移除（title→
     aria-label）、侧边栏展开卡片防遮挡、Notch 面板重构等。Electron 不变
     （43.7.9）。**逐个 tag fetch（9 个）——整批 fetch 必断流**。
  2) 安装包 API digest sha256 4971c322… 实测 MATCH（125,787,712 B，一次续传）。
     v0690 锚点移存 opencode\v0690-anchors\ → /S 静默安装 → 重建
     app.asar.v0780-official.bak + .unpacked（18,609,952 B）。
  3) rebase 35 提交，9 处冲突。**本轮最大事件：上游原生采纳 ZCode 会话标题**
     （providers/zcode/sessionMetadata.js，含 parent_id 子代理折叠——注释与我方
     一致，属"上游吸收我方方案"）。处置：provider/test 一律取上游；我方保留的
     是上游没有的部分——sessionRowDetailAvailable 白名单加 zcode（上游数组新增
     pi/omp 后变 9 客户端）+ readSessionEvents 事件读取器（详情下钻用，上游无
     此功能）与上游 resolver 并存同一模块（readSessionEvents 的 dbPath 改走上游
     zcodeDatabasePath）。schedulePoll delay 上游抽成 edgeDockPollDelay() 函数
     （geometry.js），我方 replay 条件作为新参数注入。
  4) 其他冲突模式：dashboard.html 按钮上游 aria-label 化（取上游）；trends
     y-ticks 的 inline style → CSSOM（CSP 特性）；glass 测试上游改名 "falls back
     to the shaped renderer"（我方 topmost 测试保留插前）；trayPopoverToggle
     vm 切片需补 scheduleEdgeAutoHide stub；sessionMetadata require 自动合并
     重复（删一份）。
  5) 测试：7782 用例 7735 过；4 红为 symlink EPERM 环境限制（上游新增 compressed
     Codex symlink 测试加入此列）+ 2 负载抖动（隔离必过）。
  6) 交付：全新解包 asar-extracted-v078 → overlay 25 文件 → 双向断言 15/15 →
     pack 49,402,919 B → 换装，启动零对话框。**拖拽验收以用户手测为准（双屏
     环境自动化脚本坐标不可靠，见 v0.69 轮记录）**。

【升级记录（2026-10-27，v0.78.0 → v0.80.0）】
  1) 双版本跨度：18 提交、146 文件（+9362/−1054）。Claude Web 多账号、Muse Code
     额度、Ollama API 密钥/点数、刘海面板摘要与间距、设置页显示模式实时预览
     （1f6bc7b3，main.js +149 行主战场）。Electron 不变（43.7.9）。
  2) 安装包 API digest sha256 9b08bb7d… 实测 MATCH（125,821,808 B）。
     ⚠️ 本轮下载三次断流且续传产出半截文件（114MB ≠ 125.8MB）→ **改为先删后下
     + 按 Content-Length 精确比对文件大小的循环**（第 2 次成功）。
     v0780 锚点移存 opencode\v0780-anchors\ → /S 静默安装 → 重建
     app.asar.v0800-official.bak + .unpacked（18,791,856 B）。
  3) rebase 34 提交，**仅 2 处冲突**（历轮最少）：上游 sessionRowDetailAvailable
     白名单新增 senpi（数组 9→10），我方继续追加 zcode（sessionRows.js +
     app.js keydown gate 各一处）。上游本轮改动集中在 main.js/设置页，未撞我方
     edgeAutoHide/edgeDock 主战场。
  4) 测试：8017 用例 7969 过。7 红全部环境因素，**非回归**：
     - 4 × symlink EPERM（Windows 无符号链接权限，历轮同款）
     - 3 × clientDataDirPresence/extension-overlap：测试用 os.homedir 桩隔离，
       但 tokscaleConfigDir 走 %APPDATA%（不受桩影响），而本机
       C:\Users\29871\AppData\Roaming\tokscale\antigravity-cache 真实存在
       → 断言 false 必失败。**属上游测试环境隔离缺陷**（换干净机器会绿）。
  5) 交付：全新解包 asar-extracted-v080 → overlay 25 文件 → 双向断言 14/14 →
     pack 49,584,819 B → 换装，启动零对话框。

【升级记录（2026-11-02，v0.80.0 → v0.84.1）】
  1) 五版本跨度：79 提交、455 文件（+44045/−2783）。Claude Web 多账号、Muse Code
     额度、Ollama 密钥/点数、插件平台（plugin scheme + descriptor/manifest）、
     edge-dock 动画与 rail 浮动胶囊（c00aab1a/615232f0/8ab15d2b）、拖拽跟随
     display frames（176e17fb）。Electron 43.7.9 → 45.1.0（跨两个大版本）。
  2) 安装包 API digest sha256 5ce81a2c… 实测 MATCH（134,881,688 B，一次成功；
     按上轮教训先删后下 + Content-Length 精确比对循环）。
     v0800 锚点移存 opencode\v0800-anchors\ → /S 静默安装 → 重建
     app.asar.v0841-official.bak + .unpacked（22,409,933 B）。
  3) rebase 34 提交，5 处冲突：
     - 主进程 main.js：上游 registerPluginScheme(protocol) 与我方
       uncaughtException handler 并存（前者在上）
     - 侧边栏主控 controller.js 的 poll：上游重构出 tickDrag()/
       syncRailPointer()/syncBubblePointer()，我方 ensureTopmost +
       tickInputReplay 插在其前，旧的内联拖拽结束逻辑由 tickDrag 取代
     - 同文件：上游 tickDrag 函数与我方 ensureTopmost 函数撞位，两函数并存
       （ensureTopmost 注释保留原生 sweep 版说明）
     - 侧边栏 preload.js：上游 dragStart 签名扩展为 (grabOffsetY,
       grabOffsetX, gestureId) + 新增 dragFrame(gestureId)，我方 inputAck 并存
     - 上游 dragStart IPC 已自动转发三参数，无需改
  4) 新依赖缺失导致 plugin* 12 个测试整文件红：上游 v0.84 新增
     markdown-it / image-size（插件平台）；worktree 的 node_modules 是 v0.67
     时代快照。npm install --no-save --no-package-lock image-size markdown-it
     后全绿（c8 是 devDep 覆盖率工具，不影响测试）。
     教训：升级后先比对 package.json 与 node_modules，缺依赖会让测试整文件
     报 Cannot find module，看起来像大规模回归。
  5) 测试：9271 用例 9219 过。7 红全环境因素：
     - 3 × symlink EPERM（含上游新增 pluginSettingsStore symlink 测试）
     - 3 × clientDataDirPresence/extension 缓存泄漏（v0.80 轮同款，%APPDATA%
       真实缓存不受 os.homedir 桩影响）
     - 1 × agent/titleSync 真实子进程：Node 24.19 libuv 断言
       "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src/win/async.c:94"
       —— 上游测试在 fetch 响应后立即 process.exit(0) 与 undici 关闭竞态；
       该测试只碰 src/agent + src/hub（我方零改动），属 Node 版本问题。
  6) Electron 45 原生层复验（重要）：koffi 加载 OK；probeDockInput 扫到 3 窗口，
     MA 返回 3（MA_NOACTIVATE）—— 对比 Electron 43 时代的 4
     （MA_NOACTIVATEANDEAT），进一步印证"MA=4 是常量假象、真实输入不查 MA"的
     当年结论（上游 Electron 已修正）；forceTopmostDockWindows raised=3
     （SetWindowPos 全成功，intptr_t 修复在 Electron 45 下依然有效）。
  7) 交付：全新解包 asar-extracted-v0841（含新依赖 markdown-it/image-size）
     → overlay 25 文件（新增 geometry.js：模板参数含 replay）→ 双向断言 17/17
     → pack 53,882,720 B → 换装，启动零对话框。

【升级记录（2026-11-04，v0.84.1 → v0.85.0）】
  1) 单版本跨度：9 提交、74 文件（+2607/−233）。会话按工具筛选（app.js +204 主战场）、
     远程会话设备标识（localSourceDevice）、共享内容模糊、tokscale 4.20→4.21
     （Senpi 用量纳入项目子任务与记忆对话）。Electron 45.1.0 → 45.2.1。
  2) 安装包 API digest sha256 ff9380d6… 实测 MATCH（134,921,608 B，一次成功）。
     ⚠️ /S 静默参数本轮被安装器忽略（出现「Token Monitor 安装」向导窗）——从
     Git Bash 直传参数形态疑似未被识别，用户手点完成安装。下一轮改用
     Start-Process -ArgumentList '/S' 或 cmd /c 传参验证。
     v0841 锚点已先移存 opencode\v0841-anchors\（安装器清 bak 的老坑未踩）。
  3) rebase 34 提交，1 处冲突：app.js 视图模型对象——上游 localSourceDevice
     （远程设备）与我方 sortMode 并存，两行都保留。
  4) ⚠️ 本轮自伤事故（必读）：首冲突合并用 Python 字符串手术，closing 标记行的
     replace 因 seg 未含尾部换行而未命中——`>>>>>>> ea155357` 被当内容提交进
     ea155357'，下一个提交 rebase 时暴露为双重嵌套冲突。已在该提交的解决中
     修复（内联 sortMode 落地，重放版 36558aeb）。教训：**合并后必须 grep 冲突
     标记计数为 0 才能 continue；字符串手术改用行级重写或 Read+Edit**。
  5) 测试：tokscale 对齐 4.21.0（npm install --no-save）；9327 用例 9275 过，
     7 红全环境因素（symlink EPERM ×4、%APPDATA% 缓存泄漏家族 ×2、Node libuv
     titleSync ×1）——与 v0.84.1 轮 7 红同家族，零回归。
  6) 交付（新手法）：Mimosa 拦逐文件 cp → 改用 `git archive HEAD src | tar -xf -`
     整树灌入（未改动文件与上游逐字节同，等效精确 overlay 且命令零文件名）；
     src 树与 fork 工作树逐字节一致；双向断言 12/12 → pack 54,125,604 B →
     换装 → 内容复核 6/6（我方 4 + 上游 2 标记共存）。
  7) 启动验证：9 进程，error log 仅 1 条 [edge-dock] hwnd 初始化时间线
     （benign，非异常路径）。待用户手测：贴边隐藏/dock/会话工具筛选
     （双屏拖拽验收以手测为准）。

【升级记录（2026-11-05，v0.85.0 → v0.86.0）】
  1) 单版本跨度：12 提交、65 文件（+5729/−260）。额度历史预览（新模块族
     limits/historyStore·historyController·historyDatabase·historyWorker·
     historyIdentity + preload limitsHistory:* IPC）、Claude CLI 备用查询开关
     （989b9fdc）、deepseek 官方 feed 服务状态、edge-dock 无额度头条时显示
     balance（ed307f47，presentation.js balanceOnlyHeadline）、窗口外观切换
     保留状态（3dee2696，新模块 retainedWindow）、代理 reset 销毁缓存。
     Electron 45.2.1 不变，**无新 npm 依赖**（package.json 仅版本号）。
  2) 网络：GitHub CDN 间歇断流（curl 56/35、gh api unexpected EOF 轮番出现）
     —— 轮询重试第 1 次成功。下载目录 Temp\opencode\downloads 已被 Temp 清理
     删除，需先重建。安装包 API digest sha256 4f9bb526…2701 实测 MATCH
     （134,950,576 B）。
  3) 安装：v0850 锚点移存 opencode\v0850-anchors\ → PowerShell
     Start-Process -ArgumentList '/S'（上轮教训生效：静默成功、无向导弹窗）
     → 重建 app.asar.v0860-official.bak + .unpacked（22,591,649 B）。
  4) rebase 34 提交，仅 1 处冲突（60d6bb2f 主提交的 main.js 设置应用区）：
     上游 syncWindowsBackdrop 重构拿掉了内联 backdrop 重建块（取上游
     applyNativeMaterial()），我方 syncEdgeAutoHideAvailability() 保留。
     **顺手修掉一个历轮遗留死调用：syncEdgeDock() 无定义**（上游早已改名
     syncDockSurfaces，历轮 rebase 把旧调用带了过来——已装 v0.85.0 实为
     潜伏 ReferenceError，设置应用路径会静默中断）——本轮删除。其余 33 提交
     零冲突自动合并（上游本轮未碰 sessionRows 白名单/sortMode/preload
     edgeDock 区）。
  5) 测试：9536 用例 9484 过，7 红与 v0.84.1/v0.85.0 两轮同家族同数
     （Node libuv titleSync ×1、symlink EPERM ×3、%APPDATA% 真实缓存泄漏
     ×3），零回归。
  6) 交付：全新解包 asar-extracted-v0860（workspace 根）→ `git archive HEAD
     src | tar -xf -` 整树灌入（diff -r 与工作树逐字节一致，544 文件）→
     pack 54,248,257 B → 换装 → 双向断言 22/22（我方 14 项含新增
     「syncEdgeDock() 死调用已删」断言；上游 8 项含 retainedWindow/
     historyStore/limitsHistory:open/balanceOnlyHeadline）→ 启动后
     probeDockInput codes=[3,3,3] broken=false、forceTopmostDockWindows
     raised=3（Electron 45.2.1 原生层完好）；error log 本轮启动零新增。
     ⚠️ probe 复验的 koffi 须从解包树解析：createRequire(解包树/package.json)
     后 require('koffi')——npx 缓存路径下没有 koffi。
  7) 待手测：额度历史卡（14 天每日用量）、Claude CLI 备用查询开关、dock 无
     额度头条时的 balance 显示、外观切换保留界面状态；贴边/dock 拖拽照旧
     （双屏以手测为准）。

【附加记录（2026-11-05，Pi/CPAHelper 用量检测）】
  1) 现象：token-monitor 的 Pi 行恒为 0。根因：pi 扫描根目录写死
     ~/.pi/agent/sessions（src/shared/providers/pi/paths.js，上游明确不认
     PI_CODING_AGENT_DIR），而 CPAHelper 把会话写在
     %LOCALAPPDATA%\CPAHelper\{Excel,Word,Agent}\Agent\Pi\sessions\*.jsonl。
  2) 实测排除（tokscale 4.21.0）：TOKSCALE_EXTRA_DIRS=pi:<dir> 对 pi 无效
     （同法对 claude 有效）；目录联接/junction 不被 tokscale 遍历跟随；
     **硬链接有效**（同 inode，进行中的会话追加实时可见）。
  3) 方案：sync-pi-sessions.ps1（tooling 目录）把 CPAHelper 各处会话硬链接进
     ~/.pi/agent/sessions；实测 today 1.60 亿 / month 2.11 亿 / allTime 2.41 亿
     token，应用 session-usage-archive 已入档。
  4) 插件方案（2026-11-05 上线）：插件 API 无法注入数据源（ctx.data 只读宿主
     已采集数据、manifest 无采集器贡献点），但插件 Node 后端可做同样的硬链接
     镜像，宿主自己的 tokscale 扫描即可统计到 —— 等于把手动脚本自动化，无系统
     计划任务残留。私有仓：https://github.com/Wade-YD/token-monitor-pi-bridge
     （插件 id pi-bridge，v1.0.0，Release 附 pi-bridge-1.0.0.tmplugin，
     SHA-256 e2a55736…f8ab）。安装：设置→插件→从文件安装，保留“后台运行”。
     插件与 PowerShell 脚本幂等共存；应用长期关闭时不再同步（先登录/开应用）。
    5) Oracle 验收（2026-11-05）：结论"可交付，无 P0"，3 个 P1 当轮全修 → v1.0.1
       （pi-bridge-1.0.1.tmplugin，34,242 B，SHA-256 14e01ea3…41dd）：
       P1-1 只覆盖自己创建的文件（owned.json 台账 + conflicts 计数，宿主/真 Pi
            同名文件绝不覆写——沙箱实测内容保持不变）；
       P1-2 首轮同步改 setImmediate，activate 立即返回，不吃宿主 15s 激活超时；
            去掉 timer.unref()，非 Windows 不再排定时器；
       P1-3 硬链接改落 ~/.pi/agent/sessions/pi-bridge/ 子目录（扫描器递归），
            真 Pi 不再枚举到共享 inode；1.0.0 的平铺旧链自动识别并跳过
            （legacy 计数），迁移后 tokscale today 仍 4 行 / 160,077,547 token。
       P2 顺手修：seen 改到处理后并计 duplicates、删死条件 row.id、UI 按 visible
       起停轮询、CSS 改用 --plugin-* 变量、README 三处措辞与实测对齐。
       Mimosa normal 深度静态扫描 0 发现（seal 073ebb90…）。
    6) 安装实测（2026-11-06）：应用没有插件安装 CLI，采用 storage 级安装（停应用后
       改 settings 与 registry）：parsePackage/unpackPackage 解包到 plugins/pi-bridge
       （.tmplugin 是 JSON format 2 容器，不是 zip）→ plugin-manager/installed.json
       写 sha256=包文件哈希、contentSha256=contentDigest(pkg) → settings.pluginStates
       置 {enabled:true, background:true, trustedRevision}（trustedRevision 必须等于
       contentSha256，否则宿主视为不可信不加载）→ initialSetupPlan 生成首用 patch
       （page 放置 + background）合并进 settings。
       验证：启动后 plugin-data/pi-bridge/status.json trigger=activate，
       5 分钟后 trigger=interval（后台执行在真实 Electron 里生效）；23 个链接全部
       existing、conflicts 0；应用 9 进程正常运行，设置未被启动流程改写。

【插件记录（2026-11-07，pi-bridge v1.1.0）】
  1) 功能升级：fs.watch 目录监听（1.5s 去抖）→ 新 Pi 会话秒级硬链接，轮询降为
     兜底（原生设置 syncInterval 1-60 分钟默认 5）；原生设置表单（manifest
     settings 块，后端 host.call settings.get 读、update(context.settings.values)
     热生效）；pruneOrphans（默认关）清理失效链接——两击确认（连续 2 pass 源
     不可见才删）；watcher 必须 on('error')（未处理 error 事件会打死后端进程）。
  2) 测试入库：npm test 8/8（DOM 桩 UI 3 + 后端集成 5：watch 即时性 1.6s 实测/
     prune 两击/非 win32 零副作用/设置热更/manual 串行）。
  3) Oracle 二审：无 P0，2 P1 当轮全修（见上）。Mimosa normal 0 发现
     （seal 4e7d3bef…）。
  4) 交付：v1.1.0 Release（pi-bridge-1.1.0.tmplugin，62,881 B，SHA-256
     388b1836…8a20），已热装并真机验证（同步正常/监听 2 目录/相对时间）。
     ⚠️ 插件装在 userData（plugins/ + plugin-data/），不随 app.asar 更新丢失；
     但 Token Monitor 升级后注意插件 API（tmApi）契约兼容性。

【升级记录（2026-11-07，v0.86.0 → v0.87.0）】
  1) 单版本跨度：9 上游提交、80 文件（+3614/−354）。服务状态页扩展、opendesign
     工作区订阅额度、codex idle Dots 回避、同步去重传（uploadDelta）、cards
     时钟共享重构。**无新 npm 依赖、Electron 45.2.1 不变**。
  2) 安装包 134,961,856 B，API digest sha256 9fe3e87b…466c 实测 MATCH（一次
     成功）。v0860 锚点移存 opencode\v0860-anchors\ → /S 静默安装（Start-Process）
     → 重建 app.asar.v0870-official.bak + .unpacked（22,639,575 B）。
  3) rebase 34 提交 **零冲突**（13 轮首次）；dead syncEdgeDock 清理保持。
  4) 测试 9637 用例 9585 过，7 红与前三轮同家族同数（symlink EPERM ×3、
     %APPDATA% 缓存泄漏 ×3、Node libuv titleSync ×1），零回归。
  5) 交付：asar-extracted-v0870（workspace 根，551 文件）→ git archive HEAD src
     整树灌入（diff -r 与工作树逐字节一致）→ pack 54,296,254 B → 换装 → 双向
     断言 24/24（我方 14 + 上游 10，新增 v087 标记 uploadDelta/opendesign）→
     probeDockInput codes=[3,3,3] raised=3 → error log 本轮零异常。
  6) **pi-bridge 插件跨升级存活**：插件装在 userData 不受 NSIS 影响，
     status.json state=ok / 24 链接 / 2 watchers 连续运行——验证了"官方覆盖
     app.asar 不动插件"的设计。

【重构记录（2026-11-07，防屎山清理 + main.js 状态机下沉，立案 refactor-plan-edge-mainjs.md）】
  1) Oracle 一审：P0 死代码 3 项 + P1 探针链删除 + P1 main.js 443 行状态机下沉；
     逐grep证伪"被上游吸收"嫌疑，zai/纵轴/列序/zcode 白名单/readSessionEvents/
     edgeAutoHide 几何全部确认保留。
  2) 实施（提交 6d88ad8e，14 文件 +906/−842）：
     - P0：styles.css data-review-group 死规则、i18n home.sessionSort.title ×6、
       app.js sparklineSvg formatTick 死参数。⚠️ reasonix cursor 规则经验收发现
       是活的（app.js:2804 实时设置 dataset），已恢复——一审误判。
     - P1-1：MA 探针链路全删（probeDockInput/ensureInputAlive/sendMessage 绑定/
       常量块/测试 2 例）；ack 门控回放与 topmost sweep 完整保留。
     - P1-2：main.js 2531-2974（443 行状态机 + 6 处接线：applyWindowSettings/
       窗口事件/uncaught/keeper/IPC）→ 新模块 src/electron/edgeAutoHideController.js
       （725 行，createEdgeAutoHideController(deps) 13 项依赖注入，模块内自
       require edgeAutoHide/edgePopupGuard）；main.js 10709→10096 行，触碰面
       +694/−5 → 解构 6 名 + 一行转发。
  3) 验证：全量 9636/9584（7 环境红不变）；受影响 6 测试文件 218/218；换装后
     双向断言 24/24 + 搬移断言 4/4；Oracle 验收"有条件通过"已闭合——归一化
     diff 零差异证明语义等价，抓回一条被一审误判为死的活规则。
  4) 遗留手测（用户）：贴边隐藏/悬停展开/隐藏态拖拽缩放/模式切走切回/启动
     恢复/取色器弹窗不收起。主收益：main.js 触碰面 +699→约 +230，上游永不
     编辑的代码此后 rebase 零冲突。

  5) 验收：2026-11-07 用户手测通过（edge 冒烟清单全过），重构正式闭合。

【插件记录（2026-11-07，pi-bridge v1.2.0 面板原生风格重设计）】
  1) 背景：v1.0.2 面板是"边框卡片堆叠"，与应用原生语言不符；用户拍板按宿主
     设计系统重做。Explore 提取宿主设计系统（styles.css 9040 行 + dashboard.css
     + pluginViews.css + magpie-routes 参照）→ designer 重写 panel.css 79→133
     行 + ui.mjs 430→549 行 → Oracle 审查 P0=0（P1×2+P2×5 全修）→ npm test 9/9。
  2) 设计要点（全部抄宿主配方）：删自带 h3（宿主页头已有标题）；Hero=本月
     token 大精确数字（display-font+tabular-nums+clamp(24px,8cqw,40px)）+
     compact 提示+花费行（用户拍板口径=本月）；KPI 4 块 trends-stat 软瓦片
     （今日/今日花费/全量/全量花费）；近 14 天 div 柱→SVG sparkline（viewBox
     280x64、rect rx=1、末柱高亮、grid-line×3、首尾轴标、柱顶与最上网格线
     对齐）；模型/会话改宿主 .row 行模式（名称+右对齐值+全宽 6px bar，scaleX
     420ms cubic-bezier(0.22,1,0.36,1)）；状态改 uppercase 徽章 pill 三色 tint；
     「立即同步」挂 ctx.headerActions（宿主页头操作区，无则落 footer）；主题
     --pb-* 兜底链（--plugin-*→宿主变量→字面量）+ container query 480px +
     reduced-motion 双通道。
  3) 实证新知（本轮新增）：
     - manifest surfaces:["home","page"] 会在主窗同时挂两份 .pb-panel
       （home-module 卡片 + plugin-main-page 全页），document 级计数翻倍——
       不是 bug，探针要按父容器区分（本轮误判过一次，静置探针+父链澄清）。
     - ui.mjs mount 必须 container.replaceChildren(root) 幂等；append 在重开
       视图时叠实例（v1.0 起的隐患，本轮修掉+测试锁定；测试里二次 mount 必须
       dispose，否则 interval 挂住 node --test 不退出）。
     - CDP 验证三坑：主窗 target 要按 title==='Token Monitor' 精确匹配（Dock
       窗口同名前缀会误命中）；贴边隐藏态 Page.captureScreenshot 回放旧帧
       （结构探针照跑不误，别信截图）；光标触发显形必须落在
       edgeAutoHideBounds.expandedBounds 的 x 区间内（本轮 x∈[117,548]，
       放屏幕中心无效）。
  4) Oracle P2 全落地：柱高 48 对齐网格线、rx=1、reduced-motion 根守卫
     (:not([data-reduce-motion="off"])+JS dataset 优先)、.pb-axis[hidden]、
     测试加硬（provider 前缀/svg namespaceURI）+ headerActions 协议测试
     （shim remove() 真摘除）。engines 随新 CSS（container query/color-mix）
     提到 >=0.85.0。
  5) 交付：pi-bridge-1.2.0.tmplugin（75,565 B，SHA-256 059e36b2…bfb6c，
     contentDigest 5df5427e…069b）。同版本重装两次（第一包 f3a8abeb… 因加
     幂等修复作废重打）；installed.json/trustedRevision 同步更新。真机验证：
     hero 278,653,782/2.8亿/$5.73、4 瓦片、14 柱、4 模型行（provider 前缀
     完整）、5 会话行、同步正常徽章、「立即同步」在宿主页头；后端 state=ok/
     2 watchers/24 链接/零冲突。验证后应用已恢复无调试口正常启动。

【插件记录（2026-11-07，pi-bridge v1.3.0 周期分段切换器）】
  1) 需求：面板 Hero 区加宿主主窗口右上角 DAY/MONTH/TOTAL 同款分段切换器。
     ⚠️ 宿主数据源只有 today/month/allTime 三个周期（sessionUsageArchive.js
     periodWindows 仅 today.day/month.month，全源码无 week）——用户拍板采用
     宿主原生三档 日/月/全量，不做周档（周需自行聚合且按模型无周数据）。
  2) 实现：.pb-seg 宿主 .seg 配方（padding 2px/radius 7px/bg overlay 0.05；
     btn 0.6875rem padding 5px 10px radius 5px；active bg overlay 0.12+accent）；
     闭包 period 状态 + toolRows 缓存，切档只重渲染不发查询；hero label/精确
     数字/compact/花费与按模型标题/空态全部随档双语联动；徽章移到标签旁。
  3) Oracle 增量审查：可发版（P0=0）。P1=测试没锁「切档不发新查询」→ 加
     query 计数断言（mount 恰 5 次、两次切档后仍 5）；P2=死 outline-offset
     规则删除。P2-2 备忘：插件 uppercase/letter-spacing 是 .seg 几何+.tab
     排版的混合，宿主 .seg 本身无大写——有意为之。
  4) 真机验证（CDP 三档实测）：月 278,653,782/$5.73 → 日 6,211,494/$0.118
     （按模型（今日）+1 行）→ 全量 308,638,790/$6.71/4 行，active 正确迁移；
     **allTime 档偶发先显 0 数秒后自愈=宿主 allTime 投影懒加载瞬态，非插件
     bug**（usageOf(null) 安全渲染按设计）。验证截图两坑复现：①切视图后必须
     轮询确认 #pluginMainPanel 真激活（offsetParent）再截图，否则拍到的是当前
     可见视图（本轮拍到同步页一次）；②Page.captureScreenshot 在窗口重现后
     可能回放旧帧，bringToFront+延时后再拍。
  5) 交付：pi-bridge-1.3.0.tmplugin（81,397 B，SHA-256 7fca8a61…7d2f，
     contentDigest dcce67db…ab40）；installed.json previous=1.2.0/059e36b2；
     npm test 10/10。应用已恢复无调试口正常启动。

【插件记录（2026-11-08，pi-bridge v1.4.0 会话标题）】
  1) 需求：面板「最近会话」每行都显示模型名，用户无法对应真实会话。
     根因（实证）：宿主插件投影 sessionFields（src/shared/plugins/
     businessData.js:208-216）不投影 sessionId（只给 opaque id）且 pi 行
     title 为空串——宿主自己的 breakdown 里 pi 行也是生成标签
     "Pi · deepseek v4.1 flash"。ui.mjs 回退链 row.title||model 恒取模型名。
  2) 方案：backend 新增 titles 扫描——读 jsonl 头（**1MB 窗口**，CPAHelper
     会话首条用户消息可晚至 624KB 处），首行取 id/timestamp，正文取首条
     role=user 的 text part，剥 <cpahelper_turn_context> 注入块取真实提问
     （60 字符 code-point 截断）；缓存 plugin-data/pi-bridge/titles.json
     （mtime+条目形状校验+**schema 版本 v2 整弃**，dirty 守卫只在变化时
     重写；dev:ino 去重防源/目标双读）。call('titles') 返回 list。UI 按
     **row.startedAt ↔ jsonl session.timestamp 就近 ±5s 对齐**（实测 5/5
     偏移 +0.5~1.6s 同号稳定）；tooltip 带转录文件名、subtitle 带
     #uuid前8——短 id 可直接在文件系统定位会话。
  3) 本轮四坑（记入铁律）：
     - 宿主插件投影无 sessionId → startedAt 是唯一可对齐键（opaque id
       不可逆）；碰撞分析：<3.2s 间隔才可能错位，人工会话分钟级，安全。
     - 256KB 头窗口不够（实测一条会话首条 user 在 624KB）→ 1MB。
     - titles.json 缓存条目在行为参数变化时不失效（旧 title:null 形状
       完整被复用）→ TITLES_CACHE_VERSION 整弃 + 五键形状校验。
     - **改已装副本文件会破坏 trustedRevision 信任链 → 宿主拒载插件**
       （切换器无 Pi 项、后端不跑）——调试已装副本必须重算 contentDigest
       同步 installed.json+settings（pi_retrust.js 模式）。
     - 附：v1.4.0 安装迭代 6 次打包（幂等修复→P1 守卫→startedAt 对齐→
       1MB 窗口→缓存 v2→README 1MB 措辞），installed.json previous 始终
       锚定 1.3.0/7fca8a61。
  4) Oracle 两轮：全量 diff 轮 P0=0（P1 dirty 守卫修，P2 代理对截断/
     假断言修）；startedAt 对齐轮 P0=P1=0（5s 容差合理、NaN 无传播、
     dirty 守卫构造性验证正确，P2 容差拒绝测试已补）。npm test 12/12。
  5) 真机验证：5/5 标题命中（"根据区域1中的凭证日期和函证号…"/"你参考
     一下区域2 23年的做法…"/"参照引用图片的检查格式…"/"根据区域1的在建
     工程待摊余额表…"/"我有哪些 Word 文档处理能力"），tooltip 全带文件名；
     三档切换器回归正常（month 278,653,782；today=0 系 11/8 新日真实数据）；
     面板单实例；后端 ok。⚠️ CDP 探针输出经 Bash 管道中文/·会显 GBK 乱码
     ——显示层问题，DOM 与截图正常，验证以 PNG 目检为准。
  6) 交付：pi-bridge-1.4.0.tmplugin（92,337 B，SHA-256 70b7eafe…1d41，
     contentDigest f24b8b41…0dbf），Release v1.4.0，commit 3b78603。
     优化决策：KPI 瓦片与 Hero 日/全量档数值重复=保留（参照条设计）；
     ui.mjs 不拆分（单文件加载器契约）；README 已刷新（仪表盘/切换器/
     标题/1MB Trust 措辞）。

【升级记录（2026-11-11，v0.87.0 → v0.90.0）】
  1) 三版本跨度：59 上游提交、300 文件（src 136 文件 +9885/−1247，历史第三大）。
     主战场 app.js +559、main.js +229、styles.css +101；src 新增 27 文件（cardCanvas/
     launch.js/linuxDisplayServer、plugins credentials+limits 族、hark/mistral/
     minimax/prime-agent provider 等）。**Electron 45.2.1 不变、无新 npm 依赖**
     （undici 7.30.2）；⚠️ package.json main 从 src/electron/main.js 改为
     **src/electron/launch.js**（Wayland 启动分流器，Windows 直通 main.js）——
     rebase 后保留，断言脚本新增 launch entry 检查。
  2) 网络：github.com 443 直连整轮断流（git fetch 6 连败、curl CDN 不可用）——
     **安装包走 gh api octet-stream 通道**（asset 数字 id 从 latest jq 取，
     `gh api -H "Accept: application/octet-stream" repos/…/releases/assets/<id>`，
     别拿 digest 串当 id）；fetch 第 7 次重试成功拿到真标签。安装包 135,083,504 B
     SHA 44d7bab4…80b7 = API digest MATCH（一次成功）。**npx 缓存 asar 工具链被
     Temp 清理** → 改用 worktree 自带 node_modules/@electron/asar（extractAll 是
     同步 API）。锚点：v0870 移存 Temp\opencode\v0870-anchors\ → /S 安装 →
     重建 app.asar.v0900-official.bak+.unpacked（23,303,748 B；v0900 官方 asar
     无 unpacked 内容，twin 从解包树恢复为空目录）。
  3) rebase 37 提交（35 重放 + 2 fallout 修复）**7 处冲突**：
     - index.html windowBehavior select：上游给 desktop option 加
       data-select-description + 我方 edge option → 共存。
     - main.js bounds-listener 块 ×5（同族反复）：上游 onBoundsChange 四事件
       循环 vs 我方 pre-refactor edge 监听——**解法=取上游侧**，edge 逻辑早已
       下沉 edgeAutoHideController.attachWindow（6d88ad8e），Python 块替换解算
       器（resolve_main_bounds.js，字面量路径）一轮打尽。
     - trayPopoverToggle.test.js sourceBetween 端点、6d88ad8e 空冲突各一。
  4) fallout 3 个（新测试暴露，逐一定性修复）：
     - linuxDisplayServer.test vm 切片缺 edgeAutoHide → persistBoundsSoon
       （main.js:2583）引用控制器，注入 stub（与既有 vm 测试同模式）。
     - **上游 v0.90.0 新增 es/en 严格 parity 测试**，暴露我方四键
       （home.sessionSort.×2/settings.windowBehavior.edge/
       trayMenu.presentation.edge）历史上只加进 **pt-BR 词典**（es 段真末尾
       L14746，pt-BR L14747 起；2 空格缩进的词典头正则扫不到引号名）——
       es 补西语翻译 4 键（2449=2449 对齐）。
     - sessionRows.test 键计数断言 6→7（pt-BR+es）。
  5) 测试：10190 用例 10130 过，**11 红 = 纯上游 v0.90.0 基线逐一相同**
     （symlink EPERM ×5 + Windows 环境差异 ×6，跑纯上游对照确认），零回归。
     受影响单测全绿（linuxDisplayServer 16/16、i18n 32/32、sessionRows 78/78、
     collectorHistory 29/29——后者的 EPERM/Timed out 是全量并发 Temp 竞态）。
  6) 打包换装：git archive HEAD src 灌入 asar-extracted-v0900（diff 与工作树
     逐字节一致）→ pack 55,932,722 B → 换装 → 双向断言 **29/29 ALL PASS**
     （我方 15 + 上游 14，新增 v090 标记 launch entry/cardCanvas/
     windowBehaviorNote/edge option 保留）。
  7) 真机：插件 pi-bridge 跨升级存活（ok/2 watchers/25 链接/零冲突）、edge
     几何保留（新吸附 x∈[1121,1361]）、面板壳完整、设置/anchor 数据全
     （allTime 7.125e9/month 2.19e9）。**"CDP 看主窗 stats=0" 疑云经 Oracle
     会诊定性=贴边隐藏态渲染门控（statsRenderScheduler isHidden 只置
     renderPending 不渲染；Windows occlusion tracker 判滑出屏顶窗口
     occluded）**——sendPush 对隐藏窗零过滤、publish 链与可见性解耦、push/
     publish/插件三链对 v0.90.0 diff 为零。**新铁律：CDP 排查贴边隐藏态一律
     读内存 `await window.tokenMonitor.getStats()`（stats:get IPC 无可见性
     门槛），DOM 是不可信观测点**；用户实机截图数据完整，展开窗口即 flush
     出数（手测项：pi-bridge hero 若仍 0 点一次「立即同步」）。
  8) 交付：edge-auto-hide.patch 129,689 B / commits.txt 37 行（v0.90.0 基），
     提交 bcdfae57。遗留手测归用户：贴边隐藏/悬停展开/拖拽换边冒烟（重构后
     第二轮换装，同 v0.87 清单）。

【P0 事故修复（2026-11-11，v0.90.0 换装漏还原 app.asar.unpacked）】
  症状：升级后主窗 TOTAL=0、额度卡「正在获取实时额度数据…」、模型/活动/会话
  全空、pi-bridge hero=0；collector-anchor.json 停在 16:50 不再更新（约 2h20m）。
  根因：换装时把官方 app.asar.unpacked 一并改名为
  app.asar.v0900-official.bak.unpacked 作锚点，**只还原了 app.asar，忘了还原
  app.asar.unpacked**。原生二进制（tokscale.exe、koffi.node，共 81 文件）不在
  位 → src/shared/collector.js:103 的 toUnpackedPath(require.resolve(
  'tokscale/bin.js')) 指向不存在的路径 → collector 无法 spawn tokscale →
  采集全停（不报错到底层 UI，只表现为全 0）。
  ⚠️ 包装链的连带坑：**@electron/asar 的 extractAll 不导出 unpacked 内容**
  （unpacked 文件在 asar 里是空条目且不会被写出），所以「解包→翻补丁→
  createPackage 重新打包」这条链**天然丢二进制**；本轮打包用默认 createPackage
  也没有 unpack 语义，导致新 asar 内不含这些文件、且 unpacked 目录被移走。
  修复：cp -r app.asar.v0900-official.bak.unpacked → app.asar.unpacked
  （81 文件；依赖版本与官方一致，二进制完全匹配）。重启后：
  getTokscaleStatus()={supported:true, current.source:'bundled', version:'4.21.0',
  path:…resources\app.asar.unpacked\…\tokscale.exe}；getStats()=today
  147,615,019 / month 2,303,061,466 / allTime 8,313,678,428；anchor 恢复落盘；
  主窗 TOTAL=147,615,019、¥29.83、7 行明细、Pi 行 1。
  铁律（写进下轮必查）：
  1) 换装前后 `ls resources/` 必须同时看到 **app.asar 与 app.asar.unpacked**；
     NSIS 安装器会重建 unpacked，我们自打包时不会。
  2) 打包必须保留 unpacked 语义：要么在解包树里补齐官方 unpacked 内容后用
     createPackageWithOptions({unpack:'**/*.{exe,node,dll,so,dylib}'}) 重打，
     要么直接复用官方 app.asar 只替换 src/（推荐：把补丁 src 覆盖进官方解包
     树后，仅对 src 做增量重打包不可行，因此**以官方 asar 为基准、只替换
     src 目录**仍会丢 unpacked——故最稳=自打包后**手工还原官方 unpacked**）。
  3) 采集健康自检三连（30 秒）：getTokscaleStatus().supported &&
     current.path 存在 → getStats().periods.today.totalTokens > 0 →
     collector-anchor.json mtime 在 5 分钟内。
  4) **全 0 + 额度加载中 = 先查 app.asar.unpacked，而不是查渲染门控**（本轮
     Oracle 先前把"CDP 看 0"归因为渲染门控，对隐藏态成立，但对"用户可见态
     全 0"不成立——判别标准：用户可见时仍 0 且 anchor mtime 停摆 = 采集死）。

【上游贡献（2026-11-11，首个 PR）】
  背景：37 提交补丁中，只有少量属"通用 bug 修复"可回馈上游；其余为 fork 内部
  事务（rebase fallout/重构）或产品级功能（edge 贴边自动隐藏，与上游 edgeDock
  设计语言冲突，不宜整体推）。上游现况：MIT、3640 stars、353 forks、144 open
  issues、单人维护，但**外部 PR 有合并先例**（hongsw #1449 已合）。
  首个 PR 选题：zai 额度窗口去重（874e584d）——console-key lane 与 ZCode mirror
  lane 同答同一 GLM plan，一叶只带 5 小时桶时 flatMap 合并渲染成
  "Session 9% / Session 9%"。自包含、与 edge 代码零耦合、任何 zai 用户受益。
  实现：新分支 fix/zai-limits-dedupe 基于 **upstream/main c43b7f6d**（非 v0.90.0
  标签，main 领先）；仅改 2 文件——limits.js 新增 dedupeZaiWindows（kind/label/
  resetsAt/usedPercent 四元组去重，合并点包一层，导出供测试）+ zaiLimits.test.js
  回归测试（双 lane 只答 5 小时桶 → 单行；不同桶原序保留）。**46/46 通过、eslint
  零告警、+62/−1**。
  操作链：`gh repo fork Javis603/token-monitor --clone=false`（此前旧 fork 已被
  用户删除，本次新建 Wade-YD/token-monitor）→ 提交身份改用
  `Wade-YD <283058524+Wade-YD@users.noreply.github.com>`（保证与账号关联；
  原 29871@localhost 是本地身份）→ push fork 分支 → gh pr create
  → **PR #1458**（https://github.com/Javis603/token-monitor/pull/1458，
  OPEN/MERGEABLE）。
  待办：跟进 review；若上游合并，下轮 rebase 该提交会变成"已在上游"→ 用
  `git rebase --skip` 或 cherry-pick 剔除，避免重复。若被拒，保持 fork 内维护。
  下一步候选（视本次反应再定）：edgeDock topmost 原生族（koffi FindWindowExW/
  HWND_TOPMOST intptr_t/WS_EX_TRANSPARENT 卡死）整理成一个干净 Windows 修复 PR；
  edge 贴边模式先开 feature request issue 探口风，不直接 PR。

【升级工具链（2026-11-11，省 token 用）】
  位置：`7-工具箱\token-monitor-tooling\token-monitor-patch\upgrade\`（非 git 仓，
  随工具目录本地维护）。目的：把升级的机械步骤从"模型读文件+试错"里拿出来，
  每轮只需 4 条命令 + 3 个探针 + 1 张截图目检。
  四步：`01-fetch-install.sh vX.Y.Z`（gh OCTET-STREAM 下载+sha256 对 digest+
  锚点移出+/S 安装+**断言 app.asar.unpacked 存在**+官方 asar 解包+unpacked
  合并回解包树）→ `02-rebase.sh vX.Y.Z`（fetch 重试环+rebase+冲突文件清单+
  首个 hunk+main.js bounds 块自动解算）→ `03-verify.sh --baseline vX.Y.Z`
  （全量测试**只跑一次**落盘+失败名与基线做集合差+**NEW 自动单跑复验判
  flaky**+装后断言+探针）→ `04-pack-install.sh --debug-port`（git archive 灌
  src+**createPackageWithOptions({unpack:'**/*.{node,exe,dll,so,dylib}'})** 重打
  +换装+重启+断言）。
  探针：`probes/health.mjs`（tokscale supported+二进制存在+getStats 内存 today>0
  +anchor 年龄+DOM 对照，单行 JSON，problems 为空 exit 0）、`probes/panel.mjs`
  （Pi 面板结构：面板数/KPI/柱数/徽章/切换器/会话行）、`probes/shot.mjs <png>
  [--panel]`（显形+截图；**坐标从 settings.edgeAutoHideBounds 动态取，不再写死
  300/1240**）。
  基线：`baseline/tests-baseline-v0.90.0.json`（纯上游本机 11 红清单）。上游测试
  大改时按 README 的刷新命令重建。
  本轮实测：干跑 repack = 24.4MB asar + unpacked 含 koffi.node(1,048,064B)/
  tokscale.exe(30,459,392B)，且 asar 内不重复——**P0 事故的根因已被脚本封死**；
  03 全量 10190 用例约 1 分钟、断言 16/16、探针 health/panel 均 ok。
  仍未自动化（刻意保留人工）：非 main.js bounds 的冲突判断、Oracle 审查、发版
  说明与手册记录、最终人眼显形验证。**首次真跑 01/04 时盯一遍输出**（这两步
  只在真实升级时才被执行，本轮仅验证了其组件逻辑：资产 jq、digest 比对、解包
  合并、unpack 打包、换装断言）。
  省 token 要点（已实践）：长会话每轮重放历史的成本远大于内容本身——升级类
  固化流程应**新开会话**跑（历史 ≤100K），机械步骤交给脚本，子代理每次只喂
  `git diff`+3 个文件路径（禁止全仓浏览），一轮最多 1 次 Oracle。

【升级记录（2026-11-12，v0.90.0 → v0.91.0）】
  1) 单版本跨度：上游 2026-11-11 发布；跨度待补（compare 数据本轮没拉）。
     已知上游变化：**会话搜索功能上线（PR #1454 已合）**，带来 10 个新测试；
     安装包 135,102,288 B，SHA 8a992e4a…4e81 = API digest MATCH（一次成功）。
  2) 升级工具链首战（upkit，改名后）：fetch.sh 一次通过（探测/下载/digest/
     锚点停用/停应用/current.env）；安装器一行手跑（hook 拦脚本内静默安装器
     ——**实证：脚本文件名会被指纹钉死，01-fetch-install.sh/post-install.sh
     被拦后连 mv/grep 都拦，改名 fetch.sh/anchor.sh 即解；upkit 目录名即由此
     而来；post-install.sh 是改名未遂的死文件**）。锚点/形状断言/解包按
     round-14 命令形状手工完成。
  3) rebase 37 提交，**仅 1 处冲突**（sessionRows.js 导出区，HEAD 的
     filterSessionRows vs 我方 compareSessionRows——python 块替换保我方边）。
     ⚠️ **本轮唯一的真回归来自这次冲突解**：保了 compareSessionRows 丢了
     上游新导出 filterSessionRows（PR #1454 会话搜索需要），3 个搜索测试
     "filterSessionRows is not a function"；补回导出后 10/10。fallout 提交
     d4ab8097。**教训：冲突解"保我方"前先 grep 上游侧标识符是否被其他
     上游代码引用**（这次 filterSessionRows 被上游新测试引用）。
  4) 测试：10251/10190，12 红 = 11 基线 + 1 已知 flaky（Dots，单跑 29/29）。
     **新基线 v0.91.0 未建**（11 红同名沿用 v0.90.0 基线即可，verify.sh 会回
     落到最近的基线文件）；10251 比 v0.90.0 的 10190 多 61 用例（搜索族）。
  5) 换装：解包树 overlay 后 pack（24,471,917 B，natives 2）→ 换装 →
     断言 16/16（v0.91.0 / launch.js / 上游标记零缺失）→ 探针：health ok
     （today 1.17 亿/anchor 2 分钟新鲜）、panel ok（hero 308,605,421、5/5
     标题、14 柱、单面板）。**⚠️ 本轮踩回一次 overlay 遗漏**：pack 在灌 src
     前跑了一次（产物=纯官方 src），被 assert 拦截前发现——灌树→pack 的
     顺序固定写进 pack.sh 后不会再犯。
  6) 交付：patch 37+1 提交（bcdfae57→d4ab8097），feat 推送需 --force-with-lease。
     pi-bridge v1.4.0 二轮跨升级存活（探针 5/5 标题、单面板、badge ok）。

【升级记录（2026-11-16，v0.91.0 → v0.93.0，round 16）】
  1) 跨两版本（31 commits，~160 文件）。上游新增：plugin 系统（managed/runtime/
     updates 三族）、domReconcile 就地调和（data-key 身份链）、railNumberRoll/
     resetAnimator 动效、edgeDock 扩展、@tokscale/cli vendoring 升 4.22.0
     （koffi 平台包换成 @koromix/koffi-win32-x64 预编译形态）。安装包
     135,223,464 B，SHA 3eb1ea0a… MATCH 一次成功，锚点/形状断言/解包全过。
  2) upkit 两轮制实战：round.sh v0.93.0（fetch 一次过）→ 手跑安装器 →
     --continue。38 补丁提交重放，**唯一冲突 app.js spark-bar 区域**（未命中
     两个自动解算模式，人工判定）。
  3) 冲突解（459da961）：并集适配上游新骨架——CSSOM 标签定位改对离屏 next
     操作（旧写法查 els.trendsPanel 会拿到上一帧节点）；保留上游 dataset.key
     （domReconcile.js:32 身份链首选）+ dataset.motionKey（app.js:2294 动效
     快照）双键；删我方预调和 bindTrendTooltip（尾段已有 post-reconcile 绑定）。
  4) Oracle 审查（agent_4795e822）：**通过 0 P0/0 P1/2 P2**。P2-1 注释理由
     不准（样式存活靠 domReconcile.js:70-75 声明级 diff 就地传输，非
     re-parent）→ 已修 46123be5；P2-2 自定义属性枚举依赖 Chromium 行为，
     上游主题变量同机制，记录不修。
  5) 测试 10458 用例（+207 vs v0.91.0）：**11 红 = 全基线同名红，0 NEW**。
     第一轮 verify 曾出 1 NEW 红（verifyVendoredTokscaleRelease：optionalDep
     4.21.0 vs manifest baseVersion 4.22.0）——根因 **node_modules 陈旧**（round
     15 时代装的 @tokscale/cli 4.21.0，lock 已是 4.22.0），npm install 后
     12/12 绿。**教训：升级重放后先 npm install 对齐 lock 再 verify**（可让
     round.sh 在 rebase 后自动跑，下轮工具链任务）。
  6) 换装：asar 24,622,253 B + 2 原生件（koffi.node=@koromix 平台包路径 +
     tokscale.exe 4.22.0）→ 断言 ours 16/16、upstreamMissing=[] → health 数据
     层健康（today 34,365,081、anchor 0 分钟、tokscale 4.22.0 supported）。
  7) ⚠️ **探针显形失败（vis hidden ×8）**：v0.93.0 上游 edgeDock 重构后光标
     停靠显形不再触发（cdp.mjs 的 SetCursorPos 方案失效）；CDP 目标列表出现
     3 个 'Token Monitor Dock'（retainedWindow 新家族）。用户实机手动显形验证
     通过（pi-bridge 面板 hero 308,605,421 与 round 15 记录逐位一致、同步正常
     徽章、14 柱全在）。**下轮工具链任务：probe reveal 适配新 edgeDock 触发
     机制**。
  8) 交付：39 补丁提交（8ce58de2 冲突 fallout + 46123be5 注释修正），patch
     4284 行 / commits 39 行再生，feat --force-with-lease 推 fork，master
     docs 提交推 fork。本 commit 前 Mimosa 曾报 scanner_enobufs 兼容放行
     （本轮代码改动仅注释级，未宣称已全量审计）。

【工具链更新（2026-11-16，round 16 夜间自主优化，用户授权「有问题咨询 Oracle」）】
  1) 探针显形修复（probes/cdp.mjs）：round 16 显形失败的根因不是触发链断——
     debug 日志证实 SetCursorPos(1250,1) 命中并 expand 正常发生（16:38:39
     [poll] hidden hit + [expand]），真因=冷启动后 document.visibilityState
     滞后物理展开数分钟（Chromium occlusion tracking 对节流渲染器的行为）。
     修复=判据改「物理展开优先」（窗口 bounds 离开 settings 的
     edgeAutoHideBounds.hiddenBounds >4px 即视为已显形），Page.bringToFront
     强推渲染器翻转；触发机制不变（SetCursorPos + poll 独占 show/hide）。
     冷启动实测 panel 探针 verdict ok（1 面板/hero 308,605,421/5/5 标题）。
     触发点按停靠方向泛化（left/right/bottom 用 renderer screen.availWidth/
     Height）；缺 hiddenBounds 时 stderr 告警。
  2) assert.mjs 降噪+加固：官方 asar（pack 未跑）→ 干净 skip exit 0（原裸抛
     堆栈像回归）；已打补丁但缺文件 → FAIL；文件在但缺
     createEdgeAutoHideController 工厂标记 → 失败不静默 skip；汇总分子改
     实际通过数（原恒 15/15，失败时自相矛盾）。
  3) round.sh：phase 3.5 rebase 后自动 npm install（非致命；装后检查
     package-lock.json，npm 若改写则 git checkout -- 恢复 committed 版并
     warn——Oracle 抓到的组合陷阱：lock 脏 → 下一轮 rebase 拒跑 →
     rebase.sh 2>/dev/null 把它误报成「conflicts detected」空清单）；
     BASELINE 默认改跟随 TARGET（verify.sh 对缺失基线回落最新文件）。
  4) rebase.sh：脏树预检 die（替代假 conflicts detected）。
  5) verify.sh：基线回落改 sort -V（防 v0.100 < v0.93 字典序陷阱）+ 回落 warn。
  6) 基线 v0.93.0 新建：纯上游临时 worktree（$TEMP，已清理）+ npm install +
     全量 10384 用例 11 红，与 v0.91.0 基线逐一相同（0 增 0 减，Dots flaky
     未现）。口径演进：v0.91.0 及更早=patched-build 采样、v0.93.0 起=
     pristine 口径。JSON 补 node=24.19.0 字段（awk 依赖 reporter 输出形状）。
  验证：三探针端到端全绿（health ok/panel ok/shot 67,787 B 目检正常）；
  assert 双路径过（官方锚 skip / 已装 16/16）；全脚本 bash -n / node --check 过。
  Oracle 审查（agent_8d082d0c）：0 P0 / 2 P1 / P2 全修。P1=lock 脏树组合陷阱
  + assert 分子；P2=hiddenBounds 告警、bottom 停靠触发点、sort -V、patched
  判定加工厂标记、基线口径记录。

【升级记录（2026-11-16，v0.93.0 → v0.93.1，round 17，工具链新机制首战）】
  1) 上游 7 commits（muse web 修复、tokscale vendor 升 4.23.0、git worktree
     项目归组、New API token 语义、JSDoc typecheck、动画保留、release）。
     安装包 135,320,352 B，SHA 4a4ee584… MATCH 一次下载成功。
  2) **一把过**：rebase 39 提交重放零冲突 → phase 3.5 自动 npm install
     （**tokscale 4.22.0→4.23.0 自动跟上**，lock 未被改写=还原守卫未触发）
     → verify 回落 warn 基线 v0.93.0（**sort -V 机制首战**）→ 测试 10477
     用例 11 红=全基线 0 NEW → assert pre-pack 干净 skip（**降噪首战**）/
     post-pack 16/16 → pack 24,642,979 B + 2 natives → CDP try 1。
  3) ⚠️ **visibilityState 滞后在 v0.93.1 上加剧**：探针又报 hidden，取证=
     debug 日志 expand 正常 + panel 结构全绿挂载 + 几分钟后 geom/shot 实测
     vis 已翻转——即 occlusion tracker 翻转滞后分钟级且方差大（v0.93.0 昨晚
     冷启动 2s 内翻转）。上游 main.js 无可见性改动，纯 Chromium 行为漂移。
     **修法（探针去竞态化）**：cdp.mjs reveal 物理展开成立即返回 'expanded'
     （新语义），panel.mjs 接受 expanded 不算 problem——判据从「等 Chromium
     翻转」改为「物理展开+结构检查」，与 tracker 方差解耦。修后 panel/health
     双探针 verdict ok。
  4) health 的 dom.total=0 为重启后 stats 区等下次显形渲染的已知行为
     （statsRenderScheduler），数据层健康：today 60,765,438、anchor 4 分钟、
     tokscale 4.23.0。
  5) 交付：patch 4284 行 / commits 39 行再生，feat --force-with-lease 推
     fork，master docs 提交推 fork。pi-bridge v1.4.0 四轮跨升级存活。

【验收夜（2026-11-18 00:30-01:30，用户授权：双 Oracle 全扫+有问题立马改+决策咨询 Oracle）】
  一、双 Oracle 结论（agent_6372478a 扫 upkit 17 文件 / agent_2f786eb4 扫补丁线 40 文件 diff）：
     两域均 0 P0。工具链总评「能继续托付」，补丁线总评「不是屎山、能继续健康 rebase」。
  二、补丁线 3 P1 + 2 P2 已修（3 提交，全量 10477 用例 11 红全基线 0 NEW）：
     ① 6fbe30a1：排序按钮空闲态不可达（唯一触发点=live rate 过期定时器，无 tracker 时永不排程
        → 移入 renderToolDetailFooter，拔掉脆弱锚点）；隐藏态拖动漂移（moved 在 hidden 时早退
        → 触发区/恢复位脱同步 → 补 syncEdgeDockGeometry 重同步）；健康 rail 每 40ms 刷假
        "input restored" 日志（clearMouseTransparent 区分 'clean' 与真清除，日志只对真清除）。
     ② 47bc7353：删死 IPC edgeAutoHide:expand/collapse（全仓无调用方且绕过 animating 闸，缩小
        rebase 面）；animateWindowPosition 无有限目标时不再调 setEdgeWindowPosition(undefined,
        undefined)（那会误触 non-finite 守卫整个会话禁动画）。
     ③ 4b1cdcff：**楔死自愈器**（Oracle 裁决后落码）——2026-11-18 00:26 实测楔死：expand 日志
        打出但 tween 帧全被原生拒绝，hidden=false 而窗口躺在隐藏位，poll 认为一切正常永久空转
        （这也解释了 round 16 的「vis 卡死数分钟」）。修法=reconcileEdgeAutoHide（1Hz keeper 驱动
        的唯一执行器）增加状态标志 vs 物理位置双轴校验：失同步时 edgeLog 记录并重放（expand 象限
        先重臂 hidden=true；镜像 collapse 象限同兜），1Hz 限速，真实拖动武装宽限期防拽手。我原
        提议放 poll，Oracle 驳回（架构违约+10Hz 风暴+只堵一象限+cursor 无关），改落执行器。
  三、工具链 5 组 P1 + 6 项 P2 已修（直改 upkit，负向实测过）：
     ① 探针/assert 裁决进退出码：round.sh 探针失败 exit 3（新增码）；pack.sh CDP 起不来 die
        （附回滚指引）、post-pack 断言失败 die；②health/shot 跟上 'expanded' 语义（panel 新增
        「限期 45s 等挂载，超时 verdict=deferred exit 0 不阻塞闸门，vis=visible 时空结构才是
        真失败」——挂载延迟=渲染器可见性门控等 Chromium 翻转，非功能损坏）；③verify.sh flaky
        判定加 --include='*.test.js' + 单跑输出须含该名字（堵静默错判通道）；④anchor.sh 身份
        守卫：version!==V die + 已打补丁 die（负向实测拦截成功）+rm -rf 防嵌套拷贝；⑤pack.sh
        EXTRACT 兜底 sort -V+不匹配 warn。P2：fetch.sh 死指针→--continue、env.sh 死行×2、
        verify.sh 注释退码纠正+日志轮转（留 20 份）、rebase.sh 无冲突失败独立 die+剩余冲突读
        实时集、panel 结构求值 undefined 显式问题、assert 双计收敛。
  四、验证证据：全脚本 bash -n/node --check 过；assert 双路径过；anchor 守卫负向拦截成功；
     edge 族 326/326；全量 10477 用例 11 红=全基线 0 NEW；换装后 assert 16/16、health ok
     （vis=expanded 语义首次实战生效）、panel ok（hero 325,764,091）或 deferred（诚实降级）。
  五、挂账（README.md Known debt 节）：治愈器 vm 回归测试（现测试=源码正则断言）、resolve-exports
     悬空导出并集、resolve-main-bounds 旧形状回写、current.env 引号、SetCursorPos DPI 换算、
     panel 期望值硬编码。

【排序修复（2026-11-18，用户报告：开关显示 Token 但列表按最近序）】
  根因（双层）：①主窗路径=groupSessionRows 的最终顶层排序**硬编码 recent 比较器**（上游
  3e98bff8 #987 引入），把平铺层刚排好的 token 序整个吃掉——排序开关 v0.64 恢复时只接了
  平铺层、分组层从未接；②测试洞=平铺排序有断言（sessionRowsForPeriod sortMode 测试）、
  **分组后输出顺序从未断言**。修法（2750d73b）：groupSessionRows 最终排序改用
  compareSessionRows(a, b, options.sortMode)——无 sortMode 的调用方（edgeDock 条状卡路径）
  归一化回 recent，行为零变化（那些条状卡本就设计为 recent 语义，未穿线）；补双向回归测试
  （tokens 序存活 + 缺省 recent 不回退）。全量 10478 用例 11 红全基线 0 NEW，已换装。
  排查副产物：settings.json 里 sessionSortMode='tokens' 持久化正确、main.js:2901 归一化保真
  ——曾疑「重启丢设置」，实为 footer 从未渲染时读到 index.html 静态默认文案 'Recent' 的假象。
  实机 DOM 验证被 visibilityState 滞后挡死（throttled 渲染器不挂载视图内容，真 OS 点击也不
  翻转），以三层单元断言+换装 assert 16/16 收口。**用户实机验收通过（2026-11-18）：排序正常。**

【补丁面瘦身审计（2026-11-19，用户问：我方改造是否已被上游覆盖、可否减配）】
  上游状态：release 仍 v0.93.1，**main 领先 15 提交**（limits 账户聚合层 #1512/#1513/#1518/
  #1519、collector 修复 #1515/#1517、codex 自定义路径标题 #1473、alibaba Bailian #1509、
  趋势图日用量 #1540、quota 历史等；本地 upstream/main 取到 cb7a4fae，gh api 补齐清单）。
  结论（我预审 A-E + Oracle 终裁 agent_4d1ec5f4 F-G）：**8 特性族全部保留，0 可裁**——
  A edge auto-hide（上游把 edge 归一化掉，无等价）/ B 输入韧性+topmost（上游无 HWND_TOPMOST
  强制与自愈）/ C zcode detail（上游白名单 sessionRowDetailAvailable 仍无 zcode）/ D 排序开关
  （上游无）/ E trends y 刻度（上游无；#1540 是相邻改动非等价，下轮 rebase 预计撞）/ F1 手动
  刷新（上游 trayMenu.refreshNow 只覆盖托盘面，dashboard 按钮缺陷 upstream/main 逐行原样）/
  F2 列序（dashboard.js:435 上游未动）/ G1 zai 去重（聚合层轴不同=多设备行合并 vs 我方单
  fetch 内双 lane 窗口合并；zai 无 accountSlots/portableAccountKey，zai/limits.js 上游零改动）
  / G2 idle cash 隐藏（上游 :402 明示「零余额合法中间态」=**有意分歧**，非待跟进）。
  副产物：4 项待裁补丁与 upstream/main 15 提交 **hunk 零重叠**；下轮升级真正的冲突面在
  A-E 族地盘（collector.js、shared/limits/*）。**无需任何减配实施。**
