import type { Image } from 'mdast'
import { registerConverter } from '../registry.js'
import { escapeAttr } from '../utils.js'

registerConverter<Image>('image', (node, _context) => {
  const url = node.url
  const alt = node.alt || ''
  const title = node.title

  // Check if it's a remote URL or local file
  const isRemote = url.startsWith('http://') || url.startsWith('https://')

  if (isRemote) {
    // External image
    const titleAttr = title ? ` ac:title="${escapeAttr(title)}"` : ''
    const altAttr = alt ? ` ac:alt="${escapeAttr(alt)}"` : ''
    return `<ac:image${altAttr}${titleAttr}><ri:url ri:value="${escapeAttr(url)}"/></ac:image>`
  }

  // Local file - will be uploaded as attachment
  // The filename is the last part of the path
  const filename = url.split('/').pop() || url
  const titleAttr = title ? ` ac:title="${escapeAttr(title)}"` : ''
  const altAttr = alt ? ` ac:alt="${escapeAttr(alt)}"` : ''

  return `<ac:image${altAttr}${titleAttr}><ri:attachment ri:filename="${escapeAttr(filename)}"/></ac:image>`
})
