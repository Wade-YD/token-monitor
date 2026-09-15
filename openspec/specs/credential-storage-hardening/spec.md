# credential-storage-hardening Specification

## Purpose
定义本机凭证的存储与暴露面要求：持久化凭证文件的读取权限必须限制在属主账户、系统账户与管理组之内；禁止把外部凭证存储中的密钥复制进本项目自有配置；禁止凭证值出现在日志文件、标准输出、标准错误、错误消息与异常栈中；禁止可分发的构建产物携带含凭证的配置。
## Requirements
### Requirement: Restrict read access to the persisted configuration file

Persisted credentials in the configuration file SHALL NOT be readable by accounts other than the owning user. Because the application creates the configuration file and it inherits its directory access control list, the containing directory's access control list SHALL be hardened to the owning user as a one-time setup step, and that hardening SHALL persist across subsequent rewrites of the configuration file.

The same protection SHALL extend to any additional credential store introduced by adopting a third-party monitoring tool. Where such a tool holds API keys and session cookies, the store's files SHALL be readable only by the owning account, the operating system account, and the administrators group, and the hardening SHALL be applied before any credential is entered into that store. Hardening MUST be applied per file and MUST NOT use a recursive mode that rewrites inherited entries on child files, because that mode strips the access control entries of every file beneath the target and leaves them inaccessible to the owning account.

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

#### Scenario: Third-party credential store is hardened

- **WHEN** an adopted third-party tool maintains a credential store on this machine
- **THEN** the access control list of that store's files lists only the owning account, the operating system account, and the administrators group
- **AND** the accounts that appear in the unhardened default are no longer listed

#### Scenario: Hardening is applied before credentials are entered

- **WHEN** a credential is about to be entered into the third-party store
- **THEN** the hardening step has already been applied to that store
- **AND** the credential is never briefly written under the unhardened access control list

#### Scenario: Recursive hardening mode is not used

- **WHEN** the hardening step is applied to any directory or file
- **THEN** no file beneath the target loses its access control entries
- **AND** every file beneath the target remains readable and writable by the owning account
- **AND** the procedure documentation states that the recursive mode MUST NOT be used and why

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

