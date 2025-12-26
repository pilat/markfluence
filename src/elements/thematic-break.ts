import type { ThematicBreak } from 'mdast'
import { registerConverter } from '../registry.js'

// Horizontal rule (---, ***, ___)
registerConverter<ThematicBreak>('thematicBreak', () => {
  return '<hr/>'
})
