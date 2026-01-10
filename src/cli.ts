#!/usr/bin/env node

import { Command } from 'commander'
import { type CliOptions, ConfigError, loadConfig } from './config.js'
import { ConfluenceApiError } from './confluence/client.js'
import { syncFiles } from './sync.js'

const program = new Command()

program
  .name('markfluence')
  .description('The best Markdown to Confluence converter. Modern, fast, correct.')
  .version('0.1.0')
  .argument('[files...]', 'Markdown files or directories to sync')
  .option('-d, --domain <domain>', 'Confluence domain (e.g., mycompany.atlassian.net)')
  .option('-s, --space <key>', 'Confluence space key')
  .option('-p, --parent <id>', 'Parent page ID for new pages')
  .option('-u, --user <email>', 'Confluence user email')
  .option('-t, --token <token>', 'Confluence API token')
  .option('-c, --config <path>', 'Config file path')
  .option('--dry-run', 'Show what would be synced without making changes')
  .option('--no-mermaid', 'Disable Mermaid rendering')
  .option('-v, --verbose', 'Verbose output')
  .action(async (files: string[], options: CliOptions) => {
    try {
      // Default to current directory if no files specified
      const filesToSync = files.length > 0 ? files : ['.']

      const config = await loadConfig(options)
      const results = await syncFiles(filesToSync, config)

      // Print summary
      const created = results.filter((r) => r.action === 'created').length
      const updated = results.filter((r) => r.action === 'updated').length
      const skipped = results.filter((r) => r.action === 'skipped').length

      console.log()
      console.log(`Sync complete: ${created} created, ${updated} updated, ${skipped} skipped`)

      // Print URLs for created/updated pages
      const changed = results.filter((r) => r.action !== 'skipped')
      if (changed.length > 0) {
        console.log()
        for (const result of changed) {
          console.log(`  ${result.action}: ${result.title}`)
          console.log(`    ${result.url}`)
        }
      }
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error('Configuration error:')
        console.error(error.message)
        process.exit(1)
      }

      if (error instanceof ConfluenceApiError) {
        console.error('Confluence API error:')
        console.error(error.getHelpText())
        process.exit(1)
      }

      throw error
    }
  })

program.parse()
