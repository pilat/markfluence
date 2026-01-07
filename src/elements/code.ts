import type { Code, InlineCode } from 'mdast'
import { getMermaidFilename } from '../mermaid/render.js'
import { registerConverter } from '../registry.js'
import { escapeXml, plainTextMacro } from '../utils.js'

registerConverter<InlineCode>('inlineCode', (node) => {
  return `<code>${escapeXml(node.value)}</code>`
})

registerConverter<Code>('code', (node, context) => {
  const lang = node.lang || ''
  const code = node.value

  // Handle mermaid code blocks
  if (lang === 'mermaid') {
    // If mermaid is disabled, render as regular code
    if (context.config.mermaid === false) {
      return plainTextMacro('code', { language: 'text', title: 'Mermaid' }, code)
    }

    const filename = getMermaidFilename(code)

    // Diagram must be pre-rendered by preprocessMermaid
    if (!context.attachments.has(filename)) {
      throw new Error(
        `Mermaid diagram not pre-rendered. This is a bug - preprocessMermaid should have been called.\n` +
          `Filename: ${filename}`,
      )
    }

    // ac:width limits display size, ac:thumbnail="true" makes it clickable to view full size
    return `<ac:image ac:align="center" ac:layout="center" ac:width="800" ac:thumbnail="true"><ri:attachment ri:filename="${filename}"/></ac:image>`
  }

  const params: Record<string, string> = {}
  if (lang) {
    params.language = mapLanguage(lang)
  }

  return plainTextMacro('code', params, code)
})

// Map common language aliases to Confluence code macro language values
function mapLanguage(lang: string): string {
  const aliases: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'text',
    dockerfile: 'bash',
  }
  return aliases[lang.toLowerCase()] || lang.toLowerCase()
}
