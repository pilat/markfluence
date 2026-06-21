import type { Image } from 'mdast'
import { registerConverter } from '../registry.js'
import { escapeAttr } from '../utils.js'

registerConverter<Image>('image', (node, context) => {
  const url = node.url
  const title = node.title
  const { alt, width, height } = parseAltSize(node.alt || '')

  const altAttr = alt ? ` ac:alt="${escapeAttr(alt)}"` : ''
  const titleAttr = title ? ` ac:title="${escapeAttr(title)}"` : ''
  // width/height come from \d+ matches, so they need no escaping.
  const widthAttr = width ? ` ac:width="${width}"` : ''
  const heightAttr = height ? ` ac:height="${height}"` : ''
  const attrs = `${altAttr}${titleAttr}${widthAttr}${heightAttr}`

  const isRemote = url.startsWith('http://') || url.startsWith('https://')
  if (isRemote) {
    return `<ac:image${attrs}><ri:url ri:value="${escapeAttr(url)}"/></ac:image>`
  }

  // data: URIs can't be uploaded as attachments and Confluence won't render them inline.
  // Drop them with a warning rather than emit a bogus <ri:attachment> with the whole URI as a filename.
  if (url.startsWith('data:')) {
    console.warn('Skipping unsupported data: URI image')
    return ''
  }

  // Local file: preprocessImages records the uploaded (content-hashed) name keyed by url.
  // Fall back to the basename when it wasn't uploaded (missing file, or converter run without preprocess).
  const filename = context.localImages.get(url) ?? (url.split('/').pop() || url)
  return `<ac:image${attrs}><ri:attachment ri:filename="${escapeAttr(filename)}"/></ac:image>`
})

interface AltSize {
  alt: string
  width?: string
  height?: string
}

// Obsidian-style sizing lives after the last `|` in the alt text: `alt|300` or `alt|300x200`.
// A segment that isn't `<digits>` or `<digits>x<digits>` is left verbatim in the alt text.
function parseAltSize(alt: string): AltSize {
  const idx = alt.lastIndexOf('|')
  if (idx === -1) return { alt }

  const sizePart = alt.slice(idx + 1).trim()
  const m = /^(\d+)(?:x(\d+))?$/.exec(sizePart)
  if (!m) return { alt }

  return { alt: alt.slice(0, idx).trim(), width: m[1], height: m[2] }
}
