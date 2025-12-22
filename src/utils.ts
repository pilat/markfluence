const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

export function escapeXml(str: string): string {
  return str.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] || char)
}

export function escapeAttr(str: string): string {
  return escapeXml(str)
}

// Confluence macro helpers
export function macro(name: string, params: Record<string, string> = {}, body?: string): string {
  const paramEntries = Object.entries(params)
  const paramsXml = paramEntries
    .map(([key, value]) => `<ac:parameter ac:name="${escapeAttr(key)}">${escapeXml(value)}</ac:parameter>`)
    .join('')

  if (body !== undefined) {
    return `<ac:structured-macro ac:name="${escapeAttr(name)}">${paramsXml}<ac:rich-text-body>${body}</ac:rich-text-body></ac:structured-macro>`
  }

  if (paramsXml) {
    return `<ac:structured-macro ac:name="${escapeAttr(name)}">${paramsXml}</ac:structured-macro>`
  }

  return `<ac:structured-macro ac:name="${escapeAttr(name)}"/>`
}

export function plainTextMacro(name: string, params: Record<string, string> = {}, body?: string): string {
  const paramEntries = Object.entries(params)
  const paramsXml = paramEntries
    .map(([key, value]) => `<ac:parameter ac:name="${escapeAttr(key)}">${escapeXml(value)}</ac:parameter>`)
    .join('')

  if (body !== undefined) {
    return `<ac:structured-macro ac:name="${escapeAttr(name)}">${paramsXml}<ac:plain-text-body><![CDATA[${body}]]></ac:plain-text-body></ac:structured-macro>`
  }

  return `<ac:structured-macro ac:name="${escapeAttr(name)}">${paramsXml}</ac:structured-macro>`
}
