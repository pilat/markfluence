import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { ConfluenceApiError, ConfluenceClient } from './confluence/client.js'
import type { Page } from './confluence/types.js'
import { convert } from './converter.js'
import { closeBrowser, preprocessMermaid } from './mermaid/index.js'
import { parse } from './parser.js'
import type { AttachmentInfo, Config, ConversionContext } from './types.js'

export interface SyncResult {
  file: string
  title: string
  pageId: string
  url: string
  action: 'created' | 'updated' | 'skipped'
}

export async function syncFiles(files: string[], config: Config): Promise<SyncResult[]> {
  const results: SyncResult[] = []
  const client = new ConfluenceClient(config)

  // Expand directories
  const allFiles = expandFiles(files)

  try {
    for (const file of allFiles) {
      try {
        const result = await syncFile(file, config, client)
        results.push(result)
      } catch (error) {
        if (error instanceof ConfluenceApiError) {
          console.error(`Error syncing ${file}:`)
          console.error(error.getHelpText())
        } else {
          throw error
        }
      }
    }
  } finally {
    // Close puppeteer browser if it was opened for mermaid rendering
    await closeBrowser()
  }

  return results
}

async function syncFile(file: string, config: Config, client: ConfluenceClient): Promise<SyncResult> {
  const absolutePath = resolve(file)
  const markdown = readFileSync(absolutePath, 'utf-8')
  const { frontmatter, ast, title } = parse(markdown, file)

  const context: ConversionContext = {
    config,
    frontmatter,
    attachments: new Map(),
    pageId: frontmatter['confluence-page-id'],
  }

  // Pre-render mermaid diagrams (populates context.attachments)
  await preprocessMermaid(ast, context)

  const content = convert(ast, context)
  const contentHash = createHash('md5').update(content).digest('hex')

  // Check if page exists
  let existingPage: Page | null = null
  const pageId = frontmatter['confluence-page-id']

  if (pageId) {
    existingPage = await client.getPage(pageId)
  } else {
    existingPage = await client.getPageByTitle(config.space, title)
  }

  if (config.dryRun) {
    const action = existingPage ? 'updated' : 'created'
    console.log(`[DRY RUN] Would ${action === 'created' ? 'create' : 'update'}: ${title}`)
    return {
      file,
      title,
      pageId: existingPage?.id || 'new',
      url: existingPage?._links.webui || '',
      action,
    }
  }

  let result: Page
  let action: 'created' | 'updated' | 'skipped'

  if (existingPage) {
    // Check if content changed
    const existingContent = existingPage.body?.storage?.value || ''
    const existingHash = createHash('md5').update(existingContent).digest('hex')

    if (contentHash === existingHash) {
      if (config.verbose) {
        console.log(`Skipped (no changes): ${title}`)
      }
      return {
        file,
        title,
        pageId: existingPage.id,
        url: `https://${config.domain}/wiki${existingPage._links.webui}`,
        action: 'skipped',
      }
    }

    // Update existing page
    result = await client.updatePage(existingPage.id, title, content, existingPage.version.number)
    action = 'updated'
    if (config.verbose) {
      console.log(`Updated: ${title}`)
    }
  } else {
    // Create new page
    result = await client.createPage(config.space, title, content, config.parentPageId)
    action = 'created'
    if (config.verbose) {
      console.log(`Created: ${title}`)
    }
  }

  // Upload attachments (mermaid diagrams, etc.)
  if (context.attachments.size > 0) {
    await uploadAttachments(result.id, context.attachments, client, config)
  }

  return {
    file,
    title,
    pageId: result.id,
    url: `https://${config.domain}/wiki${result._links.webui}`,
    action,
  }
}

async function uploadAttachments(
  pageId: string,
  attachments: Map<string, AttachmentInfo>,
  client: ConfluenceClient,
  config: Config,
): Promise<void> {
  // Get existing attachments to avoid duplicates
  const existing = await client.getAttachments(pageId)
  const existingMap = new Map(existing.map((a) => [a.title, a]))

  for (const [filename, info] of attachments) {
    const existingAttachment = existingMap.get(filename)

    if (existingAttachment) {
      // Update existing attachment
      await client.updateAttachment(pageId, existingAttachment.id, filename, info.data, info.contentType)
      if (config.verbose) {
        console.log(`  Updated attachment: ${filename}`)
      }
    } else {
      // Upload new attachment
      await client.uploadAttachment(pageId, filename, info.data, info.contentType)
      if (config.verbose) {
        console.log(`  Uploaded attachment: ${filename}`)
      }
    }
  }
}

function expandFiles(files: string[]): string[] {
  const result: string[] = []

  for (const file of files) {
    const absolutePath = resolve(file)

    if (!existsSync(absolutePath)) {
      console.error(`File not found: ${file}`)
      continue
    }

    const stat = statSync(absolutePath)

    if (stat.isDirectory()) {
      const dirFiles = readdirSync(absolutePath)
        .filter((f) => extname(f) === '.md')
        .map((f) => resolve(absolutePath, f))
      result.push(...dirFiles)
    } else if (extname(absolutePath) === '.md') {
      result.push(absolutePath)
    }
  }

  return result
}
