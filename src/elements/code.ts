import type { Code, InlineCode } from 'mdast'
import { registerConverter } from '../registry.js'
import { escapeXml, plainTextMacro } from '../utils.js'

registerConverter<InlineCode>('inlineCode', (node) => `<code>${escapeXml(node.value)}</code>`)

registerConverter<Code>('code', (node) => {
  const lang = node.lang || ''
  const params: Record<string, string> = {}
  if (lang) params.language = mapLanguage(lang)
  return plainTextMacro('code', params, node.value)
})

function mapLanguage(lang: string): string {
  const m: Record<string, string> = {
    js: 'javascript', ts: 'typescript', py: 'python', rb: 'ruby',
    sh: 'bash', shell: 'bash', yml: 'yaml', md: 'text', dockerfile: 'bash'
  }
  return m[lang.toLowerCase()] || lang.toLowerCase()
}
