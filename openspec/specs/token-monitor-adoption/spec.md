# token-monitor-adoption Specification

## Purpose
TBD - created by archiving change adopt-token-monitor. Update Purpose after archive.
## Requirements
### Requirement: Reconcile the adopted tool against an independent ground-truth baseline before relying on it

Before the adopted monitoring tool is treated as the primary source, its readings SHALL be reconciled against independently verified baseline values for every monitored vendor. Reconciliation SHALL compare stable anchors first — window count, quota caps, and reset timestamps identifying the same period — and only then the floating values, which are usage percentages that advance in real time between the two tools' sampling moments. A reconciliation that compares only percentages SHALL NOT be accepted as evidence of correctness. A mismatch on any stable anchor SHALL block the cutover until the cause is identified, and MUST NOT be dismissed as rounding.

#### Scenario: Reconcile the GLM windows

- **WHEN** the adopted tool reports GLM Coding Plan usage
- **THEN** it reports two windows (session and weekly)
- **AND** the reported caps are 2000 and 10000
- **AND** the reported percentages are within a small tolerance of the independently verified 1% and 10%

#### Scenario: Reconcile the CommandCode windows

- **WHEN** the adopted tool reports CommandCode usage
- **THEN** the reported caps are 14 for the five-hour window and 35 for the weekly window
- **AND** the reported percentages are within a small tolerance of the independently verified 10.76% and 8.2%

#### Scenario: Reconcile the DeepSeek balance

- **WHEN** the adopted tool reports DeepSeek balance
- **THEN** the reported currency matches and the magnitude is consistent with the independently observed balance

#### Scenario: Reconcile the OpenCode Go windows

- **WHEN** the adopted tool reports OpenCode Go usage
- **THEN** it reports three windows (rolling, weekly, monthly)

#### Scenario: A stable anchor mismatch blocks the cutover

- **WHEN** any stable anchor differs from the baseline
- **THEN** the cutover is blocked
- **AND** the cause is identified before the adopted tool is relied upon
- **AND** the mismatch is not recorded as an acceptable rounding difference

#### Scenario: Percentage-only comparison is rejected

- **WHEN** a reconciliation compares only usage percentages
- **THEN** it is not accepted as evidence that the adopted tool reads correctly
- **AND** the stable anchors are compared instead

### Requirement: Record the reconciliation result as a durable artifact

The reconciliation SHALL be recorded with the adopted tool's exact version, the date, each compared vendor and metric, the anchors observed, and any tolerated deviations. Because percentages drift with usage, the record SHALL include the anchor values so that a later reader can re-interpret the result without re-deriving them.

#### Scenario: Record created

- **WHEN** a reconciliation completes
- **THEN** a record exists naming the tool version, the date, each vendor and metric compared, the anchors observed, and the deviations found

#### Scenario: A deviation is explained

- **WHEN** a floating value falls outside the stated tolerance
- **THEN** the record states the observed value from both sources and the reason for the difference

#### Scenario: Tool version is pinned in the record

- **WHEN** the record is written
- **THEN** it names the exact adopted tool version that was validated
- **AND** a later unexplainable numeric change can be attributed to a version change

### Requirement: Surface known-incorrect metrics rather than presenting them as authoritative

Where the adopted tool derives a metric from a value that our own measurements contradict, that metric SHALL be presented as indicative rather than authoritative, and the discrepancy SHALL be documented with the numbers on both sides. A metric known to be computed against a wrong denominator MUST NOT be displayed alongside verified metrics as if the two were equivalent.

#### Scenario: The CommandCode monthly metric is flagged

- **WHEN** the adopted tool reports a CommandCode monthly percentage
- **THEN** the user is informed that its denominator is a hardcoded plan value that our measurements contradict
- **AND** the two numbers are stated: the hardcoded 70 versus the measured grant of 74.107
- **AND** the user is informed that the five-hour and weekly windows remain authoritative

#### Scenario: Verified metrics are identified

- **WHEN** metrics are presented to the user
- **THEN** the five-hour and weekly windows are identified as derived from the vendor's own response payload
- **AND** the monthly metric is identified as derived from a hardcoded catalogue value

#### Scenario: An account holding bonus credits

- **WHEN** the monitored account holds additional credited quota beyond the published plan
- **THEN** the monthly percentage is understood to be a ratio against the wrong denominator
- **AND** this is stated as a property of the metric rather than an error in the reading

### Requirement: Migrate the GLM credential to the correct regional endpoint

The adopted tool SHALL be configured with the regional endpoint matching the origin site of the credential. The default region selects the global endpoint, so because the credential originates from the mainland-China site, that region SHALL be set explicitly and SHALL be confirmed by a successful reading rather than by the setting appearing selected.

#### Scenario: Region set to the credential's origin site

- **WHEN** the GLM credential is entered
- **THEN** the region is set to the mainland-China endpoint
- **AND** a successful reading is obtained from that endpoint

#### Scenario: The default global region is detected and corrected

- **WHEN** the default global region is still selected
- **THEN** it is corrected before any reading is trusted
- **AND** the failure is not mistaken for an invalid credential

#### Scenario: The credential is not auto-sourced and this is recorded

- **WHEN** the adopted tool does not read this credential from the other application's credential store
- **THEN** the credential is supplied manually
- **AND** the manual step is recorded as a known setup difference from the baseline tool

### Requirement: Avoid doubling vendor request rates during the overlap period

While both the adopted tool and the retained baseline tool are active, the combined polling SHALL NOT introduce vendor-side throttling. If throttling is observed, the retained tool SHALL be stopped except when a reconciliation is being performed.

#### Scenario: No throttling introduced

- **WHEN** both tools poll the same vendors concurrently
- **THEN** no vendor reports throttling
- **AND** both tools continue to produce readings

#### Scenario: Throttling observed

- **WHEN** a vendor reports throttling
- **THEN** the retained baseline tool is stopped except during a reconciliation
- **AND** the adopted tool's readings are confirmed to be unaffected

