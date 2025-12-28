import type { List, ListItem, Parent } from 'mdast'
import { registerConverter } from '../registry.js'
import type { ConversionContext } from '../types.js'

registerConverter<List>('list', (node, context, convertChildren) => {
  // Check if this is a task list
  const isTaskList = node.children.some((item) => item.type === 'listItem' && typeof item.checked === 'boolean')

  if (isTaskList) {
    return renderTaskList(node, context, convertChildren)
  }

  const tag = node.ordered ? 'ol' : 'ul'
  return `<${tag}>${convertChildren(node)}</${tag}>`
})

registerConverter<ListItem>('listItem', (node, _context, convertChildren) => {
  // For task list items, this is handled by renderTaskList
  return `<li>${convertChildren(node)}</li>`
})

function renderTaskList(node: List, _context: ConversionContext, convertChildren: (node: Parent) => string): string {
  const items = node.children
    .filter((item): item is ListItem => item.type === 'listItem')
    .map((item) => {
      const checked = item.checked === true
      const content = convertChildren(item)
      // Remove wrapping <p> tags from task content for cleaner output
      const cleanContent = content.replace(/^<p>(.*)<\/p>$/s, '$1')

      return `<ac:task>
<ac:task-status>${checked ? 'complete' : 'incomplete'}</ac:task-status>
<ac:task-body>${cleanContent}</ac:task-body>
</ac:task>`
    })
    .join('')

  return `<ac:task-list>${items}</ac:task-list>`
}
