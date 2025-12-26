import type { Html } from 'mdast'
import { registerConverter } from '../registry.js'

// Raw HTML in markdown - pass through as-is
// Confluence may or may not render it depending on the HTML content
registerConverter<Html>('html', (node) => {
  return node.value
})
