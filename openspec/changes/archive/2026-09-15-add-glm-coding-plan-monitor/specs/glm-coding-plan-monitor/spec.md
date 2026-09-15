## ADDED Requirements

### Requirement: Display GLM Coding Plan quota block

The system SHALL render a GLM vendor block in the floating window containing exactly two metrics: a 5-hour rolling quota and a weekly quota. Each metric SHALL display a percentage and a time-to-reset countdown. The block SHALL NOT display a monthly quota metric or a plan level.

#### Scenario: GLM enabled with a resolvable credential
- **WHEN** the GLM vendor is enabled and a credential is successfully resolved
- **THEN** the floating window renders a GLM block with exactly two metric cells labeled 滚动用量 and 每周用量
- **AND** each cell shows a percentage and a `距离重置: …` line

#### Scenario: GLM disabled
- **WHEN** the GLM vendor is disabled in settings
- **THEN** no GLM block is rendered
- **AND** the window height is recomputed for the reduced provider count

#### Scenario: Quota request fails
- **WHEN** the GLM quota request fails
- **THEN** both GLM metric cells are reset to `--` with `距离重置: --`
- **AND** the OpenCode, CommandCode, and DeepSeek blocks retain their previously displayed values

### Requirement: Poll the GLM quota endpoint on the CN host

The system SHALL request `https://open.bigmodel.cn/api/monitor/usage/quota/limit` using HTTP GET with the header `Authorization: <credential>` and no `Bearer` prefix. The system SHALL NOT transmit the GLM credential to any host other than `open.bigmodel.cn`.

#### Scenario: Successful poll
- **WHEN** the CN quota endpoint returns `code: 200` with a `data.limits` array
- **THEN** the system parses the limits and updates the two GLM metrics

#### Scenario: Credential rejected
- **WHEN** the endpoint responds with an authentication failure such as `code: 401`
- **THEN** the system surfaces a GLM-specific error and leaves other vendors unaffected

#### Scenario: Endpoint unreachable
- **WHEN** the request times out or the host is unreachable
- **THEN** the system surfaces a GLM-specific error and leaves other vendors unaffected

#### Scenario: Credential destination is constrained
- **WHEN** the GLM credential is sent
- **THEN** the only destination it is ever sent to is `open.bigmodel.cn`

### Requirement: Classify GLM quota windows by reset magnitude rather than by unit code

The system SHALL determine which credit-window entry is the 5-hour window and which is the weekly window without relying on the `unit` field, because observed `unit` values for the same logical window are inconsistent. The system SHALL accept entries whose `type` is either `CREDIT_LIMIT` (the value observed live) or `TOKENS_LIMIT` (the legacy name in older fixtures), and SHALL exclude `TIME_LIMIT` entries, which represent the MCP/tool quota. The system SHALL order candidate entries by their `nextResetTime` value, mapping the earliest to the 5-hour metric and the later to the weekly metric. The system MUST validate the resulting mapping against the invariants that the 5-hour window's remaining time is at most 18000 seconds and the weekly window's remaining time is at most 604800 seconds, and MUST swap the mapping when an invariant is violated. Because the upstream type name has already changed once without notice, the system SHALL fall back to any entry whose `type` is a non-empty string other than `TIME_LIMIT` when no listed type matches, so that a future rename degrades instead of silently producing an empty display.

#### Scenario: Two credit-window entries present
- **WHEN** the response contains two `CREDIT_LIMIT` entries with distinct `nextResetTime` values
- **THEN** the entry with the earlier reset time populates the 5-hour metric
- **AND** the entry with the later reset time populates the weekly metric

#### Scenario: Legacy type name still accepted
- **WHEN** the response uses the legacy type name `TOKENS_LIMIT` rather than `CREDIT_LIMIT`
- **THEN** the entries are classified exactly as they would be under the current type name

#### Scenario: Unrecognized credit window type name
- **WHEN** no entry matches any listed type name
- **AND** the response does contain limit entries
- **THEN** the system falls back to entries whose type is a non-empty string other than `TIME_LIMIT`
- **AND** records that an unrecognized type name was encountered

#### Scenario: Unit codes are inconsistent or unexpected
- **WHEN** the `unit` values do not match the documented 3 and 6 codes
- **THEN** the reset-magnitude ordering still produces the correct 5-hour and weekly mapping

#### Scenario: Only one credit-window entry present
- **WHEN** the response contains exactly one credit-window entry
- **AND** its remaining time exceeds 86400 seconds
- **THEN** that entry populates the weekly metric and the 5-hour metric is left unavailable

#### Scenario: Only the MCP tool quota is present
- **WHEN** the response contains only a `TIME_LIMIT` entry
- **THEN** both GLM metrics display `--`
- **AND** the fallback does not select the `TIME_LIMIT` entry

#### Scenario: Invariant violated after ordering
- **WHEN** the entry assigned to the 5-hour metric has a remaining time greater than 18000 seconds
- **AND** the entry assigned to the weekly metric has a remaining time within 18000 seconds
- **THEN** the system swaps the two assignments

#### Scenario: No credit-window entries present
- **WHEN** the response contains no credit-window entry
- **AND** contains no limit entries at all
- **THEN** both GLM metrics display `--`

#### Scenario: Reset timestamp missing
- **WHEN** a matched entry has a null or absent `nextResetTime`
- **THEN** that metric still displays its percentage
- **AND** its countdown line displays `--`

### Requirement: Resolve the GLM credential from the OpenCode auth store without persisting it

The system SHALL resolve the GLM credential at request time by reading the `zhipuai-coding-plan` entry from the OpenCode auth store. The system MUST NOT write the resolved credential value into `config.json` or any other file owned by the application. `config.json` SHALL record only the credential source mode and the target host.

#### Scenario: Credential resolved at request time
- **WHEN** the OpenCode auth store contains a `zhipuai-coding-plan` entry with a key
- **THEN** that key is used for the GLM quota request

#### Scenario: Auth store absent
- **WHEN** the OpenCode auth store file does not exist
- **THEN** the GLM block reports a missing-credential state
- **AND** the application does not crash and other vendors continue to update

#### Scenario: Auth store present but entry missing
- **WHEN** the auth store exists but contains no `zhipuai-coding-plan` entry
- **THEN** the GLM block reports a missing-credential state

#### Scenario: Auth store malformed
- **WHEN** the auth store file is not valid JSON
- **THEN** the GLM block reports a missing-credential state without raising an unhandled exception

#### Scenario: Credential not persisted
- **WHEN** a GLM quota request has completed successfully
- **THEN** `config.json` contains no GLM credential value

### Requirement: Never emit the GLM credential to logs or the interface

The system SHALL NOT write the GLM credential value to the log file, standard output, error messages, or exception tracebacks. The settings interface SHALL display only a source status such as an auto-read indicator or an absent-credential indicator, and SHALL NOT provide a field that displays or stores the credential value.

#### Scenario: Credential present during logging
- **WHEN** the GLM credential is resolved and a request is logged
- **THEN** the log records only a masked or boolean status indicator
- **AND** the log contains no substring of the credential value

#### Scenario: Request fails during logging
- **WHEN** the GLM request fails and an error is logged
- **THEN** the logged error text contains no substring of the credential value

#### Scenario: Settings section opened
- **WHEN** the user opens the settings window
- **THEN** the GLM section shows a read-only source status and no credential input field

### Requirement: Provide a GLM section in the settings interface

The system SHALL provide a GLM section in the settings window containing an enable/disable control and a read-only credential source status, and SHALL persist the enablement choice to the configuration file.

#### Scenario: Credential auto-detected
- **WHEN** the user opens settings and the OpenCode auth store contains a usable credential
- **THEN** the GLM section indicates that the credential is being read automatically

#### Scenario: Credential not found
- **WHEN** the user opens settings and no usable credential is present
- **THEN** the GLM section indicates that no credential was found and states where it is expected

#### Scenario: Enablement saved
- **WHEN** the user disables the GLM block and saves
- **THEN** the configuration persists the GLM vendor as disabled
- **AND** the floating window stops rendering the GLM block

### Requirement: Address provider visibility by provider identity rather than positional arguments

The system SHALL accept provider enablement state keyed by provider identity. The system MUST NOT accept provider enablement as a sequence of positional booleans whose order must be kept in sync by the caller.

#### Scenario: Enabling only GLM
- **WHEN** the caller reports provider visibility with only the GLM flag changed
- **THEN** exactly the GLM block appears or disappears
- **AND** the visibility of OpenCode, CommandCode, and DeepSeek is unchanged

#### Scenario: All call sites updated
- **WHEN** provider visibility is reported anywhere in the application
- **THEN** every call site addresses providers by identity rather than by argument position
