import type { Text } from 'mdast'
import { registerConverter } from '../registry.js'
import { escapeXml } from '../utils.js'

registerConverter<Text>('text', (node) => {
  return escapeXml(node.value)
})
