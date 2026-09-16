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

【零件位置】
  完整 git 克隆   D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor
                  分支 feat/edge-auto-hide（含 6 个提交），958 文件 / 53.9 MB
                  这是首选留档，含完整历史
  本补丁          D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor-patch\edge-auto-hide.patch
                  84 KB，含两轮全部源码改动 + 测试改动
  已安装应用      C:\Users\29871\AppData\Local\Programs\Token Monitor
  官方原包备份    <安装位置>\resources\app.asar.orig-backup   18,753,883 B
  交付/验证脚本   deliver_finalize.py（finalize 轮，22 项运行时断言）
                  verify_resize_affordance.py（调整大小场景，8 项断言）
                  第一轮脚本已归档到 superseded\（deliver_hardened.py 等 7 个）

【基线（重要，别弄错）】
  tag v0.57.0  ->  提交 bbe07de   （chore: release v0.57.0）
  注意：v0.57.0 是 annotated tag，tag 对象是 9e5cc83，**不要把它当提交号**。
  上游仓库：https://github.com/Javis603/token-monitor.git（浅克隆，本机无 push 权限）
  提交链（见 commits.txt）：
    11a3e6e feat(edge): 功能（rebase 到 v0.57.0）
    56bd66d / 9da4de1 / c229c3f / 6488c3b   harden 四连修
    4688fee fix(edge): finalize（收口）
    ec477de fix(edge): resize-affordance（调整大小时不收回）
    48ac2b8 fix(zai): 隐藏订阅用户恒零的现金行
    e1326c6 fix(edge): 原生弹窗守卫（调色盘等弹窗期间不收回）
  规模：14 files changed, +1803/−23（相对 v0.57.0）

【改动的 10 个交付文件】
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

【基线锚点（补丁可回退、可重放的实测凭据，2026-09-15 核验）】
  回退物校验   app.asar.orig-backup  SHA-256 =
               fbc2764be3611d658159437c2c94bbc244b08bf8fa86fcc9a5f3200b45490bd1
               大小 18,753,883 B。**回退覆盖前先核对哈希**，不一致说明备份被改坏，禁止覆盖。
  补丁可重放   已实测：在干净 v0.57.0 检出上 `git apply --check --3way edge-auto-hide.patch`
               无冲突通过（2026-09-15）。以后换机器/怀疑补丁与基线脱节时先重验：
                 cd "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor"
                 git worktree add --detach "$TEMP/patch-check" bbe07de
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
             cd tm-work && git checkout v0.57.0          # = bbe07de
             git apply --3way "<本目录>\edge-auto-hide.patch"
  2) 跑测试（纯 Node，不需要 node_modules）
        node --test tests/electron/edgeAutoHide.test.js ^
                   tests/electron/windowBehavior.test.js ^
                   tests/electron/tray.test.js
        期望：edgeAutoHide 34 / edgePopupGuard 8 / windowBehavior 9 / tray 52 / zaiLimits 37，全部 exit=0
  3) 打包成 asar
        npx --yes @electron/asar extract "<安装位置>\resources\app.asar.orig-backup" asar-extracted
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
  回退2  用 app.asar.orig-backup 覆盖 app.asar 后重启   → 回到官方构建
  回退3  git checkout 6488c3b 后重新打包替换          → 回到 finalize 前

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

【最大的历史教训】
  补丁必须 rebase 到与「已安装版」一致的 tag。
  曾把上游 HEAD 的文件混进 v0.57.0 的 asar 树 → 应用启动即弹 Error 对话框，
  因为 renderer/app.js 两版差 506 行、renderer/index.html 差 789 行。
  另：静态推理在本功能上连续误判 3 次，「看起来对但行为不对」时直接加探针
  （现在开 edgeAutoHideDebug 即可），让程序自己说。
