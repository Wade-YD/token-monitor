# 交接：token-monitor 内存占用问题

> 采集时间：2026-09-15 24:01（本机，应用已运行约 30 分钟）
> 采集者：OpenCode 会话 `ses_f5d58bb8fffeTYvUTV528ZYyxk`
> 所有数字均为**本机实测**；标注「推断」的部分未经证实，不要当结论用。

---

## 1. 现象

token-monitor 是 Electron 应用，常驻 **4 个进程**，总占用在本机波动很大：

```
历史采样（WorkingSet 合计）  618 → 334 → 243 → 180.5 → 159.7 → 302.6 → 559.2 MB
本次采样                     402 MB（WorkingSet） / 897.5 MB（Private）
```

**波动幅度约 3.5 倍**，且看不出与「有无操作」直接相关。

---

## 2. 本次实测：按进程角色拆分（关键表）

| 角色 | PID | WorkingSet | **Private** | CPU 累计 |
|---|---|---|---|---|
| `browser`（主进程） | 43096 | 145.6 MB | 206 MB | 135.9 s |
| `renderer` | 36132 | 132.3 MB | 148 MB | 14.8 s |
| **`gpu-process`** | 51816 | 71.9 MB | **531.4 MB** | 94.8 s |
| `utility` | 45884 | 52.2 MB | 12.1 MB | 0.4 s |
| **合计** | 4 | **402 MB** | **897.5 MB** | |

**两个可疑点**

1. **`gpu-process` 的 Private 是 WorkingSet 的 7.4 倍（531.4 vs 71.9 MB）** —— 提交了大量未驻留的内存。
   本机当前开着毛玻璃／亚克力：`systemGlass = true`、`windowsBackdrop = accent`、
   `glassBlur = 32`、`glassOpacity = 75`。**推断**：模糊/合成相关的 GPU 资源是主要贡献者。
   （`msedge` 同为 Chromium，12 进程 756.9 MB，说明 Electron 的量级并不离谱，但差距仍在。）
2. **主进程 CPU 累计 135.9 s / 30 分钟** —— 平均约 7.5% 单核占用（有空转）。
   应用内 `refreshMs = 15000`，即每 15 秒一轮状态刷新。

---

## 3. 与参照物对比

| | 进程数 | 内存 |
|---|---|---|
| token-monitor | 4 | **402 MB**（WS）/ 897.5 MB（Private） |
| **TokenHub**（自研，Python + tkinter，同样监控 4 厂商用量） | 1 | **42.0 MB** |
| Microsoft Edge（同期，12 进程） | 12 | 756.9 MB |

⇒ 完成同类任务，TokenHub 的占用是它的 **约 1/10**。这是「值不值得用 Electron 做这个挂件」的根本问题。

---

## 4. 已排除的原因

| 假设 | 实测 | 结论 |
|---|---|---|
| 磁盘归档无限增长 | userData 最大项是缓存（`Cache/` 2.3 MB、`GPUCache/` 1.6 MB）；JSON 归档 `session-usage-archive.json` 845.8 KB、`collector-anchor.json` 417.4 KB、`daily-history-archive.json` 97.8 KB；且都在 00:00–00:01 被重写 | **磁盘不是内存来源**，且无失控增长迹象 |
| 本机被扫的客户端太多 | `clients` 字段实际只有 **3 个逗号分隔项**（21 字符） | 不是「配置了太多客户端」 |
| 上传/同步导致的持有 | `syncUploadIntervalMs = 0`（**无上传**） | 排除 |

---

## 5. 上游已知情况（已核实）

| issue | 状态 | 内容 | 对本案的意义 |
|---|---|---|---|
| **#495** `fix(collector): bound memory during tracked-client changes` | **closed / 合于 2026-08-24** | 750 ms latest-wins 合并配置变更；只重建 usage runtime；**中止被取代的 Tokscale / Cursor / history / WSL 采集**；变更后回收 watcher worker（等旧线程退出）；拒绝来自旧 runtime 的迟到回调 | **已在我们构建里**（早于 v0.57.0 的 2026-09-13） |
| **#621** `feat(watcher): use native fs.watch recursive on macOS to reduce memory` | **closed / 合于 2026-09-07** | 动机是真实的病理：**chokidar 的「每目录一个 watch descriptor」模型**在 macOS 上把原生分配器高水位顶到 **~2.2 GB**（OpenClaw 的 `~/.openclaw/agents/` ≈ 15k 目录 / 116k 文件） | 已在构建里，但是 **macOS 专用**；其揭示的机理对 Windows 同样值得警惕 → 见 §6 |
| **#601** `[Windows] After boot GUI stays empty until manual refresh — first auto full scan never completes` | **open / needs-info**（报于 0.52.0，Windows 11 26200） | 首次自动全量扫描从未完成；主进程 CPU 空转、零网络、无卡死子进程；怀疑 `performTick`/`collectUsageOnce` 里某条 await 永不返回。手动刷新秒级完成 | **与本机同平台**。挂起的采集可能长期持有内存 → 值得对照排查 |
| **#588** `3070 ti显卡，32G内存运行经常出现卡顿` | open / bug, needs-info | 用户的诊断报告转储（24 客户端 / 21 provider） | 用户侧体感卡顿，未定位 |

### 重要结论：钉在 v0.57.0 **没有**缺内存修复

```
v0.57.0..origin/main = 7 个提交（浅克隆可能不全）
其中标题含 memory / leak / 内存 / watch / collector / diag 的：0 个
```
⇒ 我们为了打补丁而钉住的 `v0.57.0`（提交 `bbe07de`）**并不缺上游的内存修复**。
（真正的上游内存修复 #495 / #621 都在 v0.57.0 之前。）

---

## 6. 可操作的杠杆（按性价比排序）

> 全部通过 `C:\Users\29871\AppData\Roaming\Token Monitor\settings.json` 修改；
> **改前先备份**（`settings.json` 当前 37.4 KB）。
> 注：zcode 在 22:20 已留过一份 `settings.json.pre-finalize.bak`，可参考其做法。

| # | 动作 | 键 | 预期 |
|---|---|---|---|
| 1 | **关毛玻璃/模糊**（最可能压 GPU 的 Private） | `systemGlass = false`；或 `windowsBackdrop = 'off'`；`glassBlur` 降到 0–16；`glassOpacity` 提高（更不透明） | 直接打击 `gpu-process` 的 531 MB Private |
| 2 | **减少被监听的目录树**（#621 揭示的机理：内存 ∝ watch descriptor 数） | `projectsEnabled = false`；`wslScanEnabled = false`；`historyEnabled = false`（按需）；`sessionUsageArchiveEnabled = false` | 减少 watcher 规模；对小目录树用户无效 |
| 3 | **拉长采集/刷新间隔** | `refreshMs` 15000 → 60000；`collectionIntervalMs` 300000 → 600000 | 降低空转 CPU 与峰值 |
| 4 | **对照 #601 排查挂起** | 观察 `collector-anchor.json` 的 `fullScanAt` 是否在重启后停滞不前（该 issue 的判据） | 若停滞 → 命中同一个已知 bug |
| 5 | **升级官方版**（不改变内存，但获取后续修复） | — | 需先在克隆里 rebase 我们的补丁（见 `token-monitor-patch\README.txt`） |

**不建议**：加 `--disable-gpu` 之类的启动参数。会破坏窗口材质与渲染路径，且未经验证，可能引入更难定位的问题。

---

## 7. 如何复现采样（原样可用）

```powershell
# 进程角色拆分（按 Electron 的 --type 归类）
Get-CimInstance Win32_Process -Filter "Name like '%Token Monitor%'" | ForEach-Object {
  $cl = [string]$_.CommandLine; $type = 'browser(main)'
  foreach ($t in 'renderer','gpu-process','utility','crashpad-handler','zygote') { if ($cl -like "*--type=$t*") { $type = $t; break } }
  $ps = Get-Process -Id $_.ProcessId
  "{0,-18} {1,7} MB WS   {2,7} MB Private" -f $type, [math]::Round($ps.WorkingSet64/1MB,1), [math]::Round($ps.PrivateMemorySize64/1MB,1)
}
Get-CimInstance Win32_Process -Filter "Name like '%Token Monitor%'" |
  ForEach-Object { (Get-Process -Id $_.ProcessId).WorkingSet64 } | Measure-Object -Sum |
  ForEach-Object { "合计 {0} MB" -f [math]::Round($_.Sum/1MB,1) }

# userData 构成（找增长源）
Get-ChildItem "$env:APPDATA\Token Monitor" -Force | ForEach-Object {
  if ($_.PSIsContainer) { $s=(Get-ChildItem $_.FullName -Recurse -File -Force|Measure-Object Length -Sum).Sum; [pscustomobject]@{N=$_.Name+'/';KB=[math]::Round($s/1KB,1)} }
  else { [pscustomobject]@{N=$_.Name;KB=[math]::Round($_.Length/1KB,1)} }
} | Sort-Object KB -Descending | Select-Object -First 12
```

**采样注意**：至少间隔数分钟取 3–5 个点——单次读数没有意义（历史波动范围 160–620 MB）。
若要判断「是否泄漏」，看长时间趋势而不是绝对值；若要区分「泄漏 vs 峰值」，对比
`Private`（提交量，更能反映泄漏）与 `WorkingSet`（可被系统回收）。

---

## 8. 尚未做的事（建议下一步）

1. **确认 GPU Private 531 MB 是否由毛玻璃引起** —— 关掉 `systemGlass` 后重新采样对比。这是**最便宜、收益最可能最大**的一步，尚未执行。
2. **建立基线曲线** —— 连续数小时采样 `Private` 合计，区分「稳态高」与「持续增长」。
3. **对照 #601** —— 检查本机 `collector-anchor.json` 的 `fullScanAt` 是否随重启停滞后恢复。
4. **与上游对齐** —— 若确认是 Electron/Chromium 层面的固有量级，考虑在 issue 里提供本机数据（该仓库维护者响应很积极）。

---

## 9. 一句话给接手者

**内存异常的主要去向很可能是 `gpu-process` 的提交量（531 MB Private），而它旁边正开着毛玻璃；
磁盘与配置规模都已排除；上游的内存修复我们并不缺。先关一次毛玻璃再采样，就能定性。**


---

## 10. 2026-09-16 追记：接手者（zcode）已完成的实验

**§8.1 毛玻璃对照（已做）**：同条件成熟期采样（systemGlass=true/false 各一轮，均运行 2.5~4 分钟）：

| 配置 | WS 合计 | Private 合计 | GPU Private |
|---|---|---|---|
| Accent Blur（原配置） | 286.7 | 464.1 | 209.8 |
| Acrylic（试验后还原） | 278.8 | 446.9 | 194.2 |
| systemGlass=false（试验后还原） | 283.2 | 415.0 | 192.5 |

⇒ 毛玻璃稳态代价约 **+50 MB Private**（不是数百 MB 级）；Acrylic 与 Accent Blur 差 ~17 MB（噪声级），
且 Acrylic 失焦会退化不透明 → **两者都不值得换，维持 Accent Blur**。

**「越跑越涨」定性（已做，6 分钟三点采样）**：运行约 20 分钟的实例 Private
568.7 → 462.2 → 437.1 MB——**不是单调增长，而是在回落**。
结论修正为：**「交互/刷新高峰期的峰值积累 + Chromium 后台缓慢回收」**，无泄漏证据。
历史 160–620 MB 的 WS 波动与此一致。旧实例的 688 MB 是峰值态而非稳态。

**最终建议（替代 §6/§8 的待办）**：无需任何修复或配置变更。
若峰值期内存观感不佳，可选杠杆只剩：降 `refreshMs` 轮次、调低 `glassBlur`、
或低峰定时重启（应急手段）。**值得警惕的信号只有一条**：Private 单调上涨且
数小时不回落——出现时用 §7 脚本按小时取点，拿曲线去上游提 issue。
