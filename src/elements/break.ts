import type { Break } from 'mdast'
import { registerConverter } from '../registry.js'

// Hard line break (two spaces + newline or backslash + newline)
registerConverter<Break>('break', () => {
  // NO extra space - this was the bug in other tools!
  return '<br/>'
})
