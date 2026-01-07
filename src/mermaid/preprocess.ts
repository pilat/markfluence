import type { Code, Node, Parent } from 'mdast'
import type { ConversionContext } from '../types.js'
import { getMermaidFilename, isMermaidAvailable, renderMermaid } from './render.js'

interface MermaidBlock {
  code: string
  filename: string
}

function collectMermaidBlocks(node: Node, blocks: MermaidBlock[]): void {
  if (node.type === 'code') {
    const codeNode = node as Code
    if (codeNode.lang === 'mermaid' && codeNode.value) {
      const filename = getMermaidFilename(codeNode.value)
      // Avoid duplicates
      if (!blocks.some((b) => b.filename === filename)) {
        blocks.push({ code: codeNode.value, filename })
      }
    }
  }

  if ('children' in node && Array.isArray((node as Parent).children)) {
    for (const child of (node as Parent).children) {
      collectMermaidBlocks(child, blocks)
    }
  }
}

export async function preprocessMermaid(ast: Node, context: ConversionContext): Promise<void> {
  // Skip if mermaid disabled in config
  if (context.config.mermaid === false) return

  const blocks: MermaidBlock[] = []
  collectMermaidBlocks(ast, blocks)

  if (blocks.length === 0) return

  // Check if mermaid-cli is available
  const available = await isMermaidAvailable()
  if (!available) {
    throw new Error(
      'Mermaid diagrams found but @mermaid-js/mermaid-cli is not installed.\n' +
        '  Install with: npm install @mermaid-js/mermaid-cli\n' +
        '  Or disable mermaid rendering with: mermaid: false in config',
    )
  }

  // Render all blocks in parallel
  const results = await Promise.allSettled(
    blocks.map(async (block) => {
      const png = await renderMermaid(block.code)
      return { block, png }
    }),
  )

  // Store successful renders in context
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { block, png } = result.value
      context.attachments.set(block.filename, {
        filename: block.filename,
        data: png,
        contentType: 'image/png',
      })
    } else {
      console.warn(`Failed to render mermaid diagram: ${result.reason}`)
    }
  }
}
