## MODIFIED Requirements

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
