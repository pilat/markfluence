import { describe, expect, it } from 'vitest'
import { convert } from '../src/converter.js'
import { getMermaidFilename } from '../src/mermaid/render.js'
import { parse } from '../src/parser.js'
import type { ConversionContext } from '../src/types.js'

function createContext(): ConversionContext {
  return {
    config: {
      domain: 'test.atlassian.net',
      space: 'TEST',
      auth: { email: 'test@example.com', token: 'xxx' },
      mermaid: true,
      verbose: false,
    },
    frontmatter: {},
    attachments: new Map(),
  }
}

function md2confluence(markdown: string): string {
  const { ast } = parse(markdown)
  return convert(ast, createContext())
}

describe('Basic elements', () => {
  it('converts headings', () => {
    expect(md2confluence('# H1')).toBe('<h1>H1</h1>')
    expect(md2confluence('## H2')).toBe('<h2>H2</h2>')
    expect(md2confluence('###### H6')).toBe('<h6>H6</h6>')
  })

  it('converts paragraphs', () => {
    expect(md2confluence('Hello world')).toBe('<p>Hello world</p>')
  })

  it('converts bold', () => {
    expect(md2confluence('**bold**')).toBe('<p><strong>bold</strong></p>')
  })

  it('converts italic', () => {
    expect(md2confluence('*italic*')).toBe('<p><em>italic</em></p>')
  })

  it('converts strikethrough', () => {
    expect(md2confluence('~~strike~~')).toBe('<p><del>strike</del></p>')
  })

  it('converts inline code', () => {
    expect(md2confluence('`code`')).toBe('<p><code>code</code></p>')
  })

  it('escapes XML entities in text', () => {
    expect(md2confluence('Use `<div>` & "quotes"')).toBe('<p>Use <code>&lt;div&gt;</code> &amp; &quot;quotes&quot;</p>')
  })
})

describe('Code blocks', () => {
  it('converts code blocks without language', () => {
    const result = md2confluence('```\nconst x = 1\n```')
    expect(result).toContain('<ac:structured-macro ac:name="code">')
    expect(result).toContain('<![CDATA[const x = 1]]>')
  })

  it('converts code blocks with language', () => {
    const result = md2confluence('```javascript\nconst x = 1\n```')
    expect(result).toContain('<ac:parameter ac:name="language">javascript</ac:parameter>')
  })

  it('maps language aliases', () => {
    const result = md2confluence('```ts\nconst x = 1\n```')
    expect(result).toContain('<ac:parameter ac:name="language">typescript</ac:parameter>')
  })
})

describe('Lists', () => {
  it('converts unordered lists', () => {
    const result = md2confluence('- Item 1\n- Item 2')
    expect(result).toBe('<ul><li><p>Item 1</p></li><li><p>Item 2</p></li></ul>')
  })

  it('converts ordered lists', () => {
    const result = md2confluence('1. First\n2. Second')
    expect(result).toBe('<ol><li><p>First</p></li><li><p>Second</p></li></ol>')
  })

  it('converts task lists', () => {
    const result = md2confluence('- [x] Done\n- [ ] Todo')
    expect(result).toContain('<ac:task-list>')
    expect(result).toContain('<ac:task-status>complete</ac:task-status>')
    expect(result).toContain('<ac:task-status>incomplete</ac:task-status>')
  })
})

describe('Tables', () => {
  it('converts tables with alignment', () => {
    const result = md2confluence('| L | C | R |\n|:--|:-:|--:|\n| a | b | c |')
    expect(result).toContain('<table>')
    expect(result).toContain('<th style="text-align: left">L</th>')
    expect(result).toContain('<th style="text-align: center">C</th>')
    expect(result).toContain('<th style="text-align: right">R</th>')
  })
})

describe('Links', () => {
  it('converts external links', () => {
    expect(md2confluence('[text](https://example.com)')).toBe('<p><a href="https://example.com">text</a></p>')
  })

  it('converts anchor links', () => {
    const result = md2confluence('[link](#section)')
    expect(result).toContain('<ac:link ac:anchor="section">')
  })
})

describe('Images', () => {
  it('converts external images', () => {
    const result = md2confluence('![alt](https://example.com/img.png)')
    expect(result).toContain('<ac:image')
    expect(result).toContain('<ri:url ri:value="https://example.com/img.png"/>')
  })

  it('converts local images as attachments', () => {
    const result = md2confluence('![alt](./image.png)')
    expect(result).toContain('<ri:attachment ri:filename="image.png"/>')
  })
})

describe('Blockquotes', () => {
  it('converts regular blockquotes', () => {
    expect(md2confluence('> Quote')).toBe('<blockquote><p>Quote</p></blockquote>')
  })

  it('converts NOTE admonition', () => {
    const result = md2confluence('> [!NOTE]\n> Content')
    expect(result).toContain('<ac:structured-macro ac:name="info">')
  })

  it('converts WARNING admonition', () => {
    const result = md2confluence('> [!WARNING]\n> Content')
    expect(result).toContain('<ac:structured-macro ac:name="warning">')
  })

  it('converts TIP admonition', () => {
    const result = md2confluence('> [!TIP]\n> Content')
    expect(result).toContain('<ac:structured-macro ac:name="tip">')
  })
})

describe('Breaks', () => {
  it('converts hard line breaks without extra space', () => {
    const result = md2confluence('Line 1  \nLine 2')
    expect(result).toBe('<p>Line 1<br/>Line 2</p>')
  })

  it('converts thematic breaks', () => {
    expect(md2confluence('---')).toBe('<hr/>')
  })
})

describe('Parser', () => {
  it('extracts frontmatter', () => {
    const { frontmatter, title } = parse('---\ntitle: Test\n---\n# Heading')
    expect(frontmatter.title).toBe('Test')
    expect(title).toBe('Test')
  })

  it('derives title from h1 if no frontmatter', () => {
    const { title } = parse('# My Title\n\nContent')
    expect(title).toBe('My Title')
  })

  it('derives title from filename if no h1', () => {
    const { title } = parse('Content only', 'readme.md')
    expect(title).toBe('readme')
  })
})

describe('Edge cases and errors', () => {
  it('handles empty markdown', () => {
    expect(md2confluence('')).toBe('')
  })

  it('handles whitespace-only markdown', () => {
    expect(md2confluence('   \n\n   ')).toBe('')
  })

  it('handles deeply nested lists', () => {
    const result = md2confluence('- L1\n  - L2\n    - L3\n      - L4')
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>')
  })

  it('handles mixed content in table cells', () => {
    const result = md2confluence('| **bold** | `code` | [link](url) |\n|---|---|---|\n| a | b | c |')
    expect(result).toContain('<table>')
    expect(result).toContain('<strong>bold</strong>')
    expect(result).toContain('<code>code</code>')
  })

  it('handles special characters in code blocks', () => {
    const result = md2confluence('```html\n<div class="test">\'quotes\' & "entities"</div>\n```')
    expect(result).toContain('<![CDATA[<div class="test">\'quotes\' & "entities"</div>]]>')
  })

  it('handles unicode content', () => {
    const result = md2confluence('# Привет мир 🌍\n\nТекст с эмодзи 👋')
    expect(result).toContain('Привет мир 🌍')
    expect(result).toContain('👋')
  })

  it('handles very long lines', () => {
    const longLine = 'a'.repeat(10000)
    const result = md2confluence(longLine)
    expect(result).toBe(`<p>${longLine}</p>`)
  })

  it('handles multiple headings at same level', () => {
    const result = md2confluence('## First\n\n## Second\n\n## Third')
    expect(result.match(/<h2>/g)?.length).toBe(3)
  })

  it('handles adjacent code blocks', () => {
    const result = md2confluence('```js\na\n```\n```py\nb\n```')
    expect(result.match(/<ac:structured-macro ac:name="code">/g)?.length).toBe(2)
  })

  it('handles empty code blocks', () => {
    const result = md2confluence('```\n```')
    expect(result).toContain('<![CDATA[]]>')
  })

  it('handles empty table', () => {
    const result = md2confluence('| H |\n|---|\n')
    expect(result).toContain('<table>')
    expect(result).toContain('<thead>')
  })

  it('handles blockquote with only whitespace', () => {
    const result = md2confluence('> ')
    expect(result).toContain('<blockquote>')
  })

  it('handles nested emphasis', () => {
    const result = md2confluence('***bold and italic***')
    expect(result).toContain('<strong>')
    expect(result).toContain('<em>')
  })

  it('handles image with empty alt', () => {
    const result = md2confluence('![](https://example.com/img.png)')
    expect(result).toContain('<ac:image')
  })

  it('handles link with empty text', () => {
    const result = md2confluence('[](https://example.com)')
    expect(result).toContain('<a href="https://example.com">')
  })
})

describe('Mermaid diagrams', () => {
  it('throws error when not pre-rendered', () => {
    // Mermaid diagrams MUST be pre-rendered - never show fallback in Confluence
    expect(() => md2confluence('```mermaid\ngraph LR\n  A --> B\n```')).toThrow('Mermaid diagram not pre-rendered')
  })

  it('renders image when pre-rendered', () => {
    const { ast } = parse('```mermaid\ngraph LR\n  A --> B\n```')
    const context = createContext()
    // Simulate pre-rendered diagram
    const filename = getMermaidFilename('graph LR\n  A --> B')
    context.attachments.set(filename, {
      filename,
      data: Buffer.from('fake-png-data'),
      contentType: 'image/png',
    })

    const result = convert(ast, context)
    expect(result).toContain('<ac:image ac:align="center" ac:layout="center" ac:width="800" ac:thumbnail="true">')
    expect(result).toContain(`<ri:attachment ri:filename="${filename}"/>`)
    expect(result).not.toContain('install @mermaid-js/mermaid-cli')
  })

  it('respects mermaid: false config', () => {
    const { ast } = parse('```mermaid\ngraph LR\n  A --> B\n```')
    const context = createContext()
    context.config.mermaid = false

    const result = convert(ast, context)
    // Should render as regular code block
    expect(result).toContain('<ac:structured-macro ac:name="code">')
    expect(result).not.toContain('install @mermaid-js/mermaid-cli')
    expect(result).not.toContain('<ac:structured-macro ac:name="info">')
  })
})
