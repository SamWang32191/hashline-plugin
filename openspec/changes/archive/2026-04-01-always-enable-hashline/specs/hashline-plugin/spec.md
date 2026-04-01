## ADDED Requirements

### Requirement: Plugin always enables core hashline behavior
The system SHALL register the hashline edit capability and apply hashline-aware read enhancement whenever the plugin is loaded, without requiring hashline-specific configuration flags.

#### Scenario: Plugin loads with default options
- **WHEN** the host loads the plugin without hashline-specific options
- **THEN** the plugin SHALL register the edit tool and apply hashline-aware read enhancement for supported read output

#### Scenario: Legacy hashline toggle values do not disable behavior
- **WHEN** the caller provides former hashline enable/disable flags in plugin options
- **THEN** the plugin SHALL keep the edit tool and read enhancement enabled

## REMOVED Requirements

### Requirement: Plugin configuration controls hashline behavior
**Reason**: Hashline edit and read enhancement are now part of the plugin's fixed core behavior and should not depend on per-feature enable/disable flags.
**Migration**: Stop using `hashline_edit` and `hooks.hashline_read_enhancer` to control activation. Only load the plugin in environments where hashline behavior should be available.
