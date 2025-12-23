import path from 'node:path'
import type { Node, Root, Yaml } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { frontmatter as frontmatterExtension } from 'micromark-extension-frontmatter'
import { gfm } from 'micromark-extension-gfm'
import { parse as parseYaml } from 'yaml'
import type { Frontmatter, ParsedDocument } from './types.js'

export function parse(markdown: string, filename?: string): ParsedDocument {
  const ast = fromMarkdown(markdown, {
    extensions: [gfm(), frontmatterExtension(['yaml'])],
    mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml'])],
  })

  const { frontmatter, cleanedAst } = extractFrontmatter(ast)
  const title = deriveTitle(frontmatter, cleanedAst, filename)

  return {
    frontmatter,
    ast: cleanedAst,
    title,
  }
}

function extractFrontmatter(ast: Root): { frontmatter: Frontmatter; cleanedAst: Root } {
  let fm: Frontmatter = {}
  const children = ast.children.filter((node) => {
    if (node.type === 'yaml') {
      try {
        fm = parseYaml((node as Yaml).value) || {}
      } catch {
        // Invalid YAML, ignore
      }
      return false
    }
    return true
  })

  return {
    frontmatter: fm,
    cleanedAst: { ...ast, children },
  }
}

function deriveTitle(fm: Frontmatter, ast: Root, filename?: string): string {
  // 1. Explicit title in frontmatter
  if (fm.title) {
    return fm.title
  }

  // 2. First h1 heading
  for (const node of ast.children) {
    if (node.type === 'heading' && node.depth === 1) {
      return extractText(node)
    }
  }

  // 3. Filename without extension
  if (filename) {
    return path.basename(filename, path.extname(filename))
  }

  return 'Untitled'
}

function extractText(node: Node): string {
  if ('value' in node && typeof node.value === 'string') {
    return node.value
  }
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map(extractText).join('')
  }
  return ''
}
