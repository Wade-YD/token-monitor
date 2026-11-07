# 补丁栈防屎山重构立案（2026-11-07）

依据：Oracle 代码审查报告（agent_6ebd6db0，全部结论有 grep/上游对比实证）。
对象：feat/edge-auto-hide 34 提交栈（基线 v0.87.0，diff +1811/−34）。

## 目标
不改变任何用户可见行为，压缩补丁体积与 rebase 冲突面。
验收基线：全量测试 9637 用例 9585 过（7 环境红不变）+ edge 模式手动冒烟清单。

## 范围

### Step 1（低风险，一次交付）
- **P0-1** styles.css 删 2 条死 cursor 规则（6948-6949：data-review-group 零发射、
  reasonix×detail-unavailable 组合不可达）
- **P0-2** i18n.js 删 `home.sessionSort.title` ×6 语言（零消费者）
- **P0-3** app.js 删 sparklineSvg 死参数 formatTick（usageCharts 从不读取）
- **P1-1** 删 MA 探针链路：topmost.js probeDockInput+常量块（~34 行）、controller.js
  ensureInputAlive/inputHeal.broken/INPUT_PROBE_INTERVAL_MS（~26 行）、main.js 接线 4 行、
  相关测试 2 个。**保留 ack 门控回放（tickInputReplay/lastAckAt）与 topmost sweep**。

### Step 2（手术，单独交付）
- **P1-2** main.js 2532-2974（443 行内联贴边状态机）下沉为
  `src/electron/edgeAutoHideController.js`（工厂 createEdgeAutoHideController(deps)，
  依赖注入：mainWindow/dashboardWindow/settings/saveSettings/displayForBounds/
  persistWindowBounds/motionPreferenceApi/windowChrome 三件套/edgePopupGuard）。
  一并下沉：applyWindowSettings 两个 edge 分支、createWindow 事件接线、
  uncaughtException 处理器、keeper interval、2 个 IPC handler。
  main.js 触碰面 +699 → 约 +230。
- **P1-3** edgePopupGuard.js 保留（上游无等价物），require 移入新模块。
- 测试：edgeAutoHide.test.js 51 处源码契约断言改指新模块；trayPopoverToggle vm stub、
  edgePopupGuard.test.js 接线断言同步。

## 明确不做
- 4 个 fallout 提交不前折（交付物是最终态 diff，历史重写零收益）。
- zai/limits、usageCharts 纵轴、dashboard 列序、zcode 白名单、readSessionEvents、
  edgeAutoHide 几何——Oracle 已证伪"被上游吸收"，全部保留。
- normalizeSessionSortMode 3 行重复不合并（不值得新增依赖边）。

## 验证门（每步交付都要过）
1. `node --check` 全部改动文件
2. 全量测试（7 环境红不变）
3. `npm run` 打包 → 双向断言（assert_v0870 基线 + 视情况增补）→ 换装
4. 启动验证（9 进程、error log 零异常、原生层 probe [3,3,3]/raised=3）
5. edge 模式手动冒烟（Step 2 后）：隐藏/悬停展开/隐藏态拖拽缩放/模式切走切回/
   启动恢复/取色器弹窗不收起
6. Oracle 事后验收：语义等价审查（旧内联块 vs 新模块）

## 回退
git（每步独立提交）+ 官方 asar 锚点（v0870-official.bak）。

## 执行结果
2026-11-07 完成：Step 1+2 全部落地（提交 6d88ad8e），Oracle 验收有条件通过已闭合（详见 README.txt 重构记录）。遗留：用户 edge 模式手测。
