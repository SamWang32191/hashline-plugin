export type HashlinePluginOptions = {
  hashline_edit?: boolean
  hooks?: {
    hashline_read_enhancer?: boolean
  }
}

export type HashlineConfig = {
  hashlineEditEnabled: boolean
  readEnhancerEnabled: boolean
}

export function loadConfig(options?: Record<string, unknown>): HashlineConfig {
  const typed = (options ?? {}) as HashlinePluginOptions
  const hashlineEditEnabled = typed.hashline_edit === true
  const readEnhancerEnabled =
    typed.hooks?.hashline_read_enhancer ?? hashlineEditEnabled

  return {
    hashlineEditEnabled,
    readEnhancerEnabled,
  }
}
