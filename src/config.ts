import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Config } from './types.js'

const CONFIG_FILES = [
  'md2confluence.config.js',
  'md2confluence.config.mjs',
  'md2confluence.config.cjs',
  '.md2confluencerc.js',
]

export interface CliOptions {
  domain?: string
  space?: string
  parent?: string
  user?: string
  token?: string
  config?: string
  dryRun?: boolean
  mermaid?: boolean
  verbose?: boolean
}

export async function loadConfig(cliOptions: CliOptions): Promise<Config> {
  // Start with environment variables
  const config: Partial<Config> = {
    domain: process.env.CONFLUENCE_DOMAIN,
    space: process.env.CONFLUENCE_SPACE,
    auth: {
      email: process.env.CONFLUENCE_EMAIL || '',
      token: process.env.CONFLUENCE_API_TOKEN || '',
    },
    mermaid: true,
    dryRun: false,
    verbose: false,
  }

  // Load config file if exists
  const configFile = cliOptions.config || findConfigFile()
  if (configFile) {
    const fileConfig = await loadConfigFile(configFile)
    mergeConfig(config, fileConfig)
  }

  // CLI options override everything
  if (cliOptions.domain) config.domain = cliOptions.domain
  if (cliOptions.space) config.space = cliOptions.space
  if (cliOptions.parent) config.parentPageId = cliOptions.parent
  if (cliOptions.user) config.auth!.email = cliOptions.user
  if (cliOptions.token) config.auth!.token = cliOptions.token
  if (cliOptions.dryRun !== undefined) config.dryRun = cliOptions.dryRun
  if (cliOptions.mermaid !== undefined) config.mermaid = cliOptions.mermaid
  if (cliOptions.verbose !== undefined) config.verbose = cliOptions.verbose

  // Validate required fields
  validateConfig(config)

  return config as Config
}

function findConfigFile(): string | null {
  for (const filename of CONFIG_FILES) {
    const filepath = resolve(process.cwd(), filename)
    if (existsSync(filepath)) {
      return filepath
    }
  }
  return null
}

async function loadConfigFile(filepath: string): Promise<Partial<Config>> {
  if (filepath.endsWith('.cjs')) {
    // CommonJS config
    const { default: config } = await import(pathToFileURL(filepath).href)
    return config
  }

  // ESM config
  const { default: config } = await import(pathToFileURL(filepath).href)
  return config
}

function mergeConfig(target: Partial<Config>, source: Partial<Config>): void {
  if (source.domain) target.domain = source.domain
  if (source.space) target.space = source.space
  if (source.parentPageId) target.parentPageId = source.parentPageId
  if (source.mermaid !== undefined) target.mermaid = source.mermaid
  if (source.dryRun !== undefined) target.dryRun = source.dryRun
  if (source.verbose !== undefined) target.verbose = source.verbose
  if (source.auth) {
    if (source.auth.email) target.auth!.email = source.auth.email
    if (source.auth.token) target.auth!.token = source.auth.token
  }
}

function validateConfig(config: Partial<Config>): void {
  const errors: string[] = []

  if (!config.domain) {
    errors.push('Missing Confluence domain. Set --domain or CONFLUENCE_DOMAIN')
  }

  if (!config.space) {
    errors.push('Missing Confluence space. Set --space or CONFLUENCE_SPACE')
  }

  if (!config.auth?.email) {
    errors.push('Missing Confluence email. Set --user or CONFLUENCE_EMAIL')
  }

  if (!config.auth?.token) {
    errors.push('Missing Confluence API token. Set --token or CONFLUENCE_API_TOKEN')
  }

  if (errors.length > 0) {
    throw new ConfigError(errors.join('\n'))
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}
