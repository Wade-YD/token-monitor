## ADDED Requirements

### Requirement: Restrict read access to the persisted configuration file

Persisted credentials in the configuration file SHALL NOT be readable by accounts other than the owning user. Because the application creates the configuration file and it inherits its directory access control list, the containing directory's access control list SHALL be hardened to the owning user as a one-time setup step, and that hardening SHALL persist across subsequent rewrites of the configuration file.

#### Scenario: Hardening applied
- **WHEN** the hardening step has been applied to the project directory
- **THEN** the access control list of the configuration file lists only the owning account, the operating system account, and the administrators group

#### Scenario: Hardening survives a rewrite
- **WHEN** the application rewrites the configuration file after hardening
- **THEN** the restricted access control list is still in effect

#### Scenario: Hardening not applied
- **WHEN** the hardening step has not been applied
- **THEN** the setup documentation states that other local accounts are able to read the persisted credentials
- **AND** the documentation provides the command to verify the current access control list

### Requirement: Never persist credentials obtained from an external credential store

When a credential is obtained from an external credential store owned by another application, the system MUST NOT copy that credential value into any file owned by this application.

#### Scenario: Auto-sourced credential not copied
- **WHEN** a credential is successfully read from an external store and used for a request
- **THEN** no file owned by this application contains that credential value

#### Scenario: External store is the single source of truth
- **WHEN** the credential value is rotated in the external store
- **THEN** the next request uses the rotated value without any change to this application's configuration

### Requirement: Keep credential values out of logs and output streams

The system SHALL NOT write any credential value — session cookie, bearer token, or API key — to the log file, standard output, standard error, error messages, or exception tracebacks. Any credential-related log entry SHALL record at most a masked identifier or a boolean configured/unconfigured indicator.

#### Scenario: Configuration is loaded
- **WHEN** the configuration is loaded and logged
- **THEN** each credential is logged only as a masked identifier or a configured/unconfigured indicator

#### Scenario: Configuration is saved
- **WHEN** the configuration is saved and logged
- **THEN** no credential value appears in the log entry

#### Scenario: Request URL is logged
- **WHEN** a request URL is logged
- **THEN** no credential value appears in the logged URL

#### Scenario: Request fails
- **WHEN** an HTTP or network error is logged
- **THEN** the logged error text contains no credential value

#### Scenario: Concurrent requests across vendors
- **WHEN** more than one vendor request is in flight
- **THEN** no vendor's credential value appears in any log entry

### Requirement: Keep persisted credentials out of distributable build artifacts

The build process MUST NOT carry a configuration file containing credentials across builds or into a distributable artifact. Any build cleanup step SHALL delete such a configuration file from the output directory rather than preserving or restoring it.

#### Scenario: Build cleanup runs
- **WHEN** the build cleanup step runs
- **THEN** any configuration file present in the distribution output directory is deleted

#### Scenario: Rebuild does not restore a previous configuration
- **WHEN** a build completes after an earlier build had produced a configuration file in the output directory
- **THEN** the output directory contains no configuration file carried over from the earlier build
- **AND** no credential value survives the rebuild

#### Scenario: Distribution contains no credentials
- **WHEN** the distribution output directory is packaged for sharing
- **THEN** it contains no file holding a credential value
