> **【已删除 · 仅作归档】**
>
> 这是变更 `harden-edge-auto-hide` 原计划的**第三个能力** `upstream-patch-maintenance` 的规格，
> 在范围裁剪时被整体删除（其最小必要部分降为一个任务：把补丁从 `%TEMP%` 另存到持久位置）。
>
> - **来源**：OpenCode 会话 `ses_f5d58bb8fffeTYvUTV528ZYyxk` 的 write 载荷（**从未提交进 git**）。
> - **状态**：**未实现**。后续变更 `finalize-edge-auto-hide`（提交 `d729af5`）在 proposal 的
>   「不做」小节里明确列入了「`upstream-patch-maintenance` 正式化」。
> - **若要重启这件事**：这份 spec 可直接作为起点 —— 它已按 OpenSpec 的
>   `## ADDED Requirements` 格式写好，含需求与场景，只需放进一个新变更的
>   `specs/upstream-patch-maintenance/spec.md` 即可。
>
> ---
>
> （以下为原文，未作任何修改。）
>
> ## ADDED Requirements

### Requirement: The upstream baseline MUST be recorded

对第三方应用打补丁时，MUST 记录补丁所基于的上游版本（tag 与 commit）以及该版本发行包的校验值。任何未标注基线的补丁 MUST NOT 被交付。

#### Scenario: Recording the baseline
- **WHEN** 首次在 fork 中落地补丁
- **THEN** 基线 tag、commit 与发行包 SHA-256 被写入文档，并与上游发布页公布的校验值逐位核对一致

#### Scenario: Upstream releases a new version
- **WHEN** 上游发布新版本
- **THEN** 交付流程的第一步是重新确认基线并重新应用补丁，MUST NOT 直接把基于旧版本的改动套到新版本的文件上

### Requirement: Patches MUST be re-appliable and verifiable against the baseline

补丁 MUST 以可重新应用的形式保存（例如 git 分支上的提交，或可 `git apply` 的补丁文件），并且 MUST 能在基线的干净检出上无冲突地应用。MUST NOT 依赖「只在某个已修改的工作树里才成立」的状态。

#### Scenario: Reapplying onto a clean checkout of the baseline
- **WHEN** 在基线的干净检出上应用补丁
- **THEN** 应用成功且无冲突；若有冲突则说明补丁已与基线脱节，必须先修正补丁

#### Scenario: Detecting version skew before delivery
- **WHEN** 补丁文件来自基线之外的其他版本
- **THEN** 交付前 MUST 通过与基线逐文件比对发现该错配，MUST NOT 把不同版本的源文件混合打包

### Requirement: A rollback artifact MUST exist before any replacement

在覆盖第三方应用的任何构建产物之前，MUST 先保留一份未经修改的原件副本，并记录其大小与校验值。回退步骤 MUST 被写入文档。

#### Scenario: Replacing the packaged application archive
- **WHEN** 准备用带补丁的包替换已安装应用的构建产物
- **THEN** 原件的备份副本已存在且校验值已记录

#### Scenario: Rolling back
- **WHEN** 需要撤销补丁
- **THEN** 按文档步骤用备份副本覆盖回去并重启应用即可恢复，无需重装

### Requirement: Verification MUST cover functional-failure signals, not only value correctness

补丁的验证 MUST 同时断言「功能是否仍然可用」，而 MUST NOT 只断言「数值是否正确」。至少 MUST 覆盖：应用启动后主窗口存在、全程不出现主进程错误框、以及目标行为在连续多轮中可重复。

#### Scenario: A crash occurs during verification
- **WHEN** 验证过程中主进程弹出错误框或主窗口缺失
- **THEN** 验证判定为失败，即使被比较的数值本身是预期的

#### Scenario: First cycle succeeds but later cycles fail
- **WHEN** 目标行为在第 1 轮通过而在后续轮次失效
- **THEN** 验证判定为失败（此类「首轮通过、后续失效」正是本次的真实失效形态）

#### Scenario: Preconditions of the verification
- **WHEN** 被测行为依赖某个前置状态（例如窗口需停靠在边缘）
- **THEN** 验证脚本 MUST 先构造该前置状态；在前置状态不成立时 MUST NOT 把「行为未发生」判为缺陷

### Requirement: Patches and tooling MUST be preserved outside ephemeral locations

补丁、验证脚本与交付步骤 MUST 被保存到可持久访问的位置，MUST NOT 只存在于临时目录中。

#### Scenario: Working copy lives in a temporary directory
- **WHEN** 用于开发的克隆位于系统临时目录
- **THEN** 收尾前 MUST 把补丁与脚本另存到持久位置，并核对可重新取回
