# tokenhub-fallback-retention Specification

## Purpose
TBD - created by archiving change adopt-token-monitor. Update Purpose after archive.
## Requirements
### Requirement: Retain the existing tool as a runnable baseline

The existing tool SHALL remain installed, launchable, and able to produce readings for every vendor it supported, for as long as it serves as the verification baseline. It MUST NOT be deleted, uninstalled, or rendered non-functional as part of adopting another tool.

#### Scenario: Still launchable after adoption

- **WHEN** the baseline tool is launched after another tool has been adopted
- **THEN** it starts successfully
- **AND** it produces readings for its configured vendors

#### Scenario: Not removed

- **WHEN** adoption of the other tool is complete
- **THEN** the baseline tool's source, configuration, and credentials are still present
- **AND** no uninstall or source removal has been performed

#### Scenario: Baseline remains reproducible

- **WHEN** a reconciliation against the baseline is required
- **THEN** the baseline tool reproduces the values that were previously verified
- **AND** the reproduction does not require reconstructing deleted configuration

### Requirement: Freeze features but permit security fixes

Feature development on the baseline tool SHALL stop, because its retained purpose is measurement rather than capability. Security fixes SHALL remain permitted, because the baseline tool holds credentials and an unpatchable baseline becomes a risk of its own.

#### Scenario: A non-security feature is declined

- **WHEN** a non-security feature is requested for the baseline tool
- **THEN** the request is deferred
- **AND** the reason is stated: the baseline exists to verify another tool, not to grow

#### Scenario: A security fix is permitted and recorded

- **WHEN** a security defect is found in the baseline tool
- **THEN** the defect is fixed
- **AND** the change is recorded in the changelog

### Requirement: Preserve verified baseline behaviors

The behaviors previously verified in the baseline tool SHALL NOT regress, because a drifting baseline has no value as a comparison. The preserved set SHALL include at minimum: the edge-reveal trigger responds only within the window's own extent along the docked edge, a credential obtained from an external credential store is not copied into any file owned by the tool, the configuration directory is access-restricted to the owning account, and no credential value appears in logs or build artifacts.

#### Scenario: Trigger scope preserved

- **WHEN** the window is hidden at a screen edge
- **THEN** only pointer positions within the window's own extent along that edge reveal it
- **AND** pointer positions along the same edge but outside that extent do not reveal it

#### Scenario: External-store credential is not persisted

- **WHEN** a credential is read from an external credential store
- **THEN** no file owned by the baseline tool contains that value

#### Scenario: Access restriction preserved

- **WHEN** the baseline tool rewrites its configuration file
- **THEN** the access control list still lists only the owning account, the operating system account, and the administrators group

#### Scenario: No credential values in logs or artifacts

- **WHEN** logs or build artifacts are produced
- **THEN** no credential value appears in them

### Requirement: Document the baseline's new role

The project documentation SHALL state that the tool is retained as a verification baseline and fallback rather than as the primary monitor, and SHALL name the tool that is primary. A reader MUST be able to determine the tool's current status without reading change history.

#### Scenario: Status visible in the project documentation

- **WHEN** a reader opens the project documentation
- **THEN** the tool's current role and the name of the primary tool are stated
- **AND** the reader does not need to read change history to learn this

#### Scenario: Freeze boundary stated

- **WHEN** the documentation describes the tool's status
- **THEN** the feature-freeze boundary is stated, including that security fixes remain permitted

#### Scenario: Role change recorded in the changelog

- **WHEN** the role change is made
- **THEN** it is recorded in the changelog with the reason

