## ADDED Requirements

### Requirement: 多通道窗口合并去重
zai 提供方的额度窗口由多条数据通道（控制台 key 通道、ZCode 镜像凭据通道）合并而来；合并 SHALL 折叠完全相同的窗口——`kind`、`label`、`resetsAt`、`usedPercent` 四个字段完全一致的窗口视为同一窗口，仅保留首个。真实不同的桶（如 5 小时窗、Weekly 桶、Start/Weekend 计划桶、MCP 月桶、现金余额）至少在一个字段上不同，MUST 全部保留。

#### Scenario: 双通道对同一 5 小时窗口各应答一次
- **WHEN** 控制台 key 通道与 ZCode 镜像凭据通道都只返回同一个 5 小时桶（相同 kind/label/resetsAt/usedPercent）
- **THEN** 合并后的提供方窗口数组只包含一个该 session 窗口

#### Scenario: 不同窗口不受去重影响
- **WHEN** 合并的窗口中存在 kind、label、resetsAt、usedPercent 任一字段不同的窗口
- **THEN** 这些窗口全部保留

#### Scenario: 空输入
- **WHEN** 合并结果为空数组或 null
- **THEN** 去重返回空数组，不抛出异常

### Requirement: 去重不得破坏既有状态语义
去重 MUST 只作用于窗口数据数组，MUST NOT 改变提供方的 status、source、accountKey、balance 等其余字段的既有语义（错误分类、notConfigured/unavailable 判定维持原样）。

#### Scenario: 部分通道失败的既有状态分类保持
- **WHEN** 合并去重后提供方仅剩 ZCode 计划桶窗口
- **THEN** 提供方的 status/source 字段与去重前的既有分类规则一致（计划桶窗口保留）
