import type { Delete, Emphasis, Strong } from 'mdast'
import { registerConverter } from '../registry.js'

registerConverter<Strong>('strong', (node, _context, convertChildren) => {
  return `<strong>${convertChildren(node)}</strong>`
})

registerConverter<Emphasis>('emphasis', (node, _context, convertChildren) => {
  return `<em>${convertChildren(node)}</em>`
})

registerConverter<Delete>('delete', (node, _context, convertChildren) => {
  return `<del>${convertChildren(node)}</del>`
})
