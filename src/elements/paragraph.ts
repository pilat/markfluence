import type { Paragraph } from 'mdast'
import { registerConverter } from '../registry.js'

registerConverter<Paragraph>('paragraph', (node, _context, convertChildren) => {
  return `<p>${convertChildren(node)}</p>`
})
