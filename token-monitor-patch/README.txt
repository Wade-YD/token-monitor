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
  完整 git 克隆   D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor
                  分支 feat/edge-auto-hide（基线 v0.58.0，含 12 个提交）
                  这是首选留档，含完整历史
  本补丁          D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor-patch\edge-auto-hide.patch
                  129 KB（基线 v0.58.0），含全部源码改动 + 测试改动
  已安装应用      C:\Users\29871\AppData\Local\Programs\Token Monitor（v0.58.0 + 补丁）
  官方原包备份    <安装位置>\resources\app.asar.v0580-official.bak   18,868,880 B
                  + 同名 .unpacked 双胞胎（勿删，解包该 bak 时必需）
  交付/验证脚本   deliver_finalize.py（v0.57 交付轮，22 项运行时断言；FILES 表已补 10 文件）
                  verify_resize_affordance.py（调整大小场景，8 项断言）
                  verify_v0580.py（2026-09-16 v0.58.0 交付轮验证，7 项断言）
                  第一轮脚本已归档到 superseded\（deliver_hardened.py 等 7 个）

【基线（重要，别弄错）】
  当前基线：tag v0.58.0 -> 提交 d426b8e（chore: release v0.58.0）
    2026-09-16 已把整条补丁链 rebase 到 v0.58.0 并重新交付（见下「升级记录」）。
    231f075 的提交信息仍写着 "(rebased onto v0.57.0)"，是历史信息别被误导——
    它的父提交就是 d426b8e。
  历史基线：tag v0.57.0 -> 提交 bbe07de（annotated tag，tag 对象 9e5cc83，
    不要把 tag 对象当提交号；v0.57.0 版补丁链哈希见 workspace git 历史里的旧 commits.txt）。
  上游仓库：https://github.com/Javis603/token-monitor.git（浅克隆，本机无 push 权限）
  提交链（见 commits.txt，15 个提交，从旧到新）：
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
  规模（相对 v0.58.0）：20 files changed, +2434/−32（14 个 src + 6 个测试文件）

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

【改动的 13 个交付文件】
  src/electron/edgeAutoHide.js            （新增）
  src/electron/main.js
  src/electron/windowBehavior.js
  src/electron/floatingBubble.js
  src/electron/tray.js
  src/electron/renderer/app.js
  src/electron/renderer/i18n.js
  src/electron/renderer/index.html
  src/shared/providers/zai/limits.js      （GLM 现金行自适应隐藏）
  src/electron/edgePopupGuard.js          （自有弹窗守卫，win32/koffi）
  src/shared/providers/zcode/sessionMetadata.js （新增，ZCode 会话标题）
  src/shared/sessionMetadata.js           （标题解析器注册表）
  src/shared/sessionDetail.js             （会话明细分发，含 zcode 分支）

【基线锚点（补丁可回退、可重放的实测凭据）】
  回退物校验   app.asar.v0580-official.bak，18,868,880 B（2026-09-16 由官方安装产物直接复制）。
               **回退覆盖前先核对大小/来源**，不一致说明备份被动过，禁止覆盖。
               （旧 v0.57.0 的 app.asar.orig-backup 已被 v0.58.0 安装器清除，作废）
  补丁可重放   已实测：在干净 v0.58.0 检出上 `git apply --check --3way edge-auto-hide.patch`
               无冲突通过（2026-09-16）。以后换机器/怀疑补丁与基线脱节时先重验：
                 cd "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor"
                 git worktree add --detach "$TEMP/patch-check" v0.58.0
                 git -C "$TEMP/patch-check" apply --check --3way \
                   "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor-patch\edge-auto-hide.patch"
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
             cd "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor"
       从零：git clone https://github.com/Javis603/token-monitor.git tm-work
             cd tm-work && git checkout v0.58.0          # = d426b8e
             git apply --3way "<本目录>\edge-auto-hide.patch"
  2) 跑测试（纯 Node，不需要 node_modules）
        node --test tests/electron/edgeAutoHide.test.js ^
                   tests/electron/windowBehavior.test.js ^
                   tests/electron/tray.test.js
        期望：edgeAutoHide 34 / edgePopupGuard 12 / windowBehavior 9 / tray 52 / zaiLimits 37
              / zcodeSessionTitles 11 + zcodeSessionDetail 5（合计 160），全部 exit=0
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
