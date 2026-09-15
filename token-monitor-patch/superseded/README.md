# 被取代 / 被删除的产物（归档）

本目录保存变更 `harden-edge-auto-hide` 在**范围裁剪**过程中丢弃的两份产物原文。
它们**从未提交进 git**（裁剪发生在该变更首次提交之前），所以只能从 OpenCode 会话数据里恢复。

| 本目录文件 | 原名 | 为什么在这里 |
|---|---|---|
| `tasks-full-scope-52.md` | `tasks.md`（52 项 / 9 组 / 3 能力） | 被裁剪为 38 项版本后覆盖 |
| `upstream-patch-maintenance-spec.md` | `specs/upstream-patch-maintenance/spec.md` | 第三能力被整体删除 |
| `_extracted_session.json` | 会话数据提取（7.6 MB） | 恢复脚本的输入，随归档移入本目录 |
| `deliver_hardened.py` / `verify_final.py` | 第一轮交付/验证脚本 | 已被 `..\deliver_finalize.py` 等取代 |
| `check_fork.py` / `instrument_edge.py` / `probe2.py` / `probe3.py` / `strip_probes.py` | 第一轮探针与状态检查 | 排障手段已内化为 `edgeAutoHideDebug` 诊断开关 |

## 时间线

```
① 按「完整方案」创建变更 harden-edge-auto-hide（3 个能力 / 52 项任务）
② 用户质疑体量（"为什么做贴边隐藏会动这么多东西"）→ 选定「中档」
     → 覆盖 tasks.md（52 → 38）、删除第三个能力 spec、proposal 的 Capabilities 3 → 2
③ 该变更首次提交 5c3d96b（已是裁剪后版本）   ← 52 任务版从此只存在于会话数据里
④ 实现完成 + 用户亲手实测通过 → 归档 d0862e2
⑤ 另一执行者（zcode）新建变更 finalize-edge-auto-hide（提交 d729af5）
     把被推迟的项目大部分做完：启动几何门控 / 窄条 frame 补偿 / 启动恢复保尺寸 /
     resize 对账 / 可开关诊断 / 删死代码
     并改了行为：win.on('focus') 不再唤出，唯一唤出入口改为光标触发区
⑥ 本目录两份文档从会话数据恢复（原始 HTML 已按用户要求于 2026-09-16 删除；
   本目录 `_extracted_session.json` 是该会话数据的唯一机器可读备份）
```

## 现在还剩什么没做

对照 `tasks-full-scope-52.md` 逐条核过：**被推迟的项目已全部实现**（2026-09-15）。

- ✅ `upstream-patch-maintenance` 已按「文档级」收口（本轮，不建代码）：
  回退物 SHA-256 已实测钉进 `..\README.txt`（基线锚点节）；补丁在干净 v0.57.0
  检出上 `git apply --check --3way` 无冲突通过，且重验命令已文档化；
  「上游发新版后重打补丁」流程已写入 `..\README.txt`。
- ⚠️ 另注：`finalize-edge-auto-hide` 的 proposal 还把自己的「不做」列为：
  tray/UI 诊断开关（settings 键 + 环境变量已够）、`bottom` 停靠的补偿（本就精确）、
  多显示器动态 overhang 测量
- 评估时明确**不做**的：逐轮询周期全量决策日志（100ms 一条会刷爆日志文件，
  事件级日志足够）、收拢 `collapseTimer`（现有"计时器只翻 desired + 单一对账"
  已满足语义，重构只带来回归风险）

## 恢复方法（可复现）

```powershell
# 会话数据（383 条消息）
$S = "D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor-patch\superseded\_extracted_session.json"
# 用本目录里的脚本遍历 write/edit 载荷，按目标路径筛选并导出
python "superseded\recover_superseded.py"
```

`recover_superseded.py`：递归遍历会话 JSON，收集所有 `{tool, state.input}` 节点，
按 `filePath` 与内容关键字筛出目标写入，导出到临时目录。
（脚本的关键判据：52 任务版的识别条件是 `filePath` 以 `tasks.md` 结尾且勾选行数 ≥ 45。）
