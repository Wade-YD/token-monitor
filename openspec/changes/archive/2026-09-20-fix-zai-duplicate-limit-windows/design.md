## Context

zai 提供方（GLM 计划）的额度窗口由两条并行通道合并：控制台 key 通道（quota + finance + subscription）与 ZCode 镜像凭据通道（同一 BigModel 配额端点，可能附 ZCode 计费桶）。合并为纯 `flatMap` 拼接。首页额度模块原样渲染全部窗口，因此通道间同一窗口的重复会直接可见（"Session 9% / Session 9%"）；额度详情视图按 kind 取首个，不受影响——这正是"列表与详情不一致"的来源。

瞬态触发条件：BigModel 偶发只对部分（或全部）请求返回 5 小时桶而缺席 Weekly 桶；某一通道拿到不完整响应时，合并结果出现重复 session 窗口。下一轮采集（分钟级）自愈。

## Goals / Non-Goals

**Goals:**
- 合并点去重：相同窗口（kind/label/resetsAt/usedPercent 四元组）只保留一个。
- 去重为纯函数并可独立单测；不触碰 status/source/accountKey/balance 语义。
- 回归测试固化"双通道同答仅 5 小时桶"场景。

**Non-Goals:**
- 不做跨提供方去重（不同 provider 之间本就可能同名）。
- 不改变通道请求协议、重试策略与频率。
- 不在渲染层（首页模块/详情视图）做去重——数据层修复让所有消费方受益。

## Decisions

### D1：数据层去重，位置在 lane flatMap 之后、normalizeLimitProvider 之前
- 理由：normalizeLimitProvider 是所有提供方共用的漏斗，加 zai 专属去重会污染通用层；渲染层修复则各自要写一遍。合并点只有一个调用方，最小作用域。
- 身份四元组 kind/label/resetsAt/usedPercent：真实不同的桶至少差一个字段（Start 桶与 5h 桶 reset 不同、MCP 桶 kind=billing、现金桶 metric=credits）；相同四元组在物理上只可能是同一窗口的两次应答。
- 备选否决：按 limitId 去重（镜像桶有 id 而配额窗口没有，覆盖面不足）；按 resetsAt 单字段（不同窗口可能同刻重置，误杀）。

### D2：渲染层不改
首页模块透传去重后的数组自然修复；详情视图本就按 kind 取首个，维持不变。

## Risks / Trade-offs

- [两账号 reset 瞬间恰好相同且用量相同被误合并] → ZCode 镜像凭据与控制台 key 指向同一 GLM 账号（这正是重复的来源），不存在"两个真实不同账号合并进同一 provider 条目"的路径；真双账号走独立 provider 条目。
- [未来上游返回字段漂移导致 identity 键不稳定] → 四元组任一字段差异即视为不同窗口，键"失效"的方向是少去重（退回现状），不会误删。

## Migration Plan

纯增量函数 + 合并点单行接线，随下一轮 asar 交付生效；回滚 = 还原该提交。

## Open Questions

无。
