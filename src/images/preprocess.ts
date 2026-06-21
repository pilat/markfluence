import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import type { Image, Node, Parent } from 'mdast'
import type { ConversionContext } from '../types.js'

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function contentTypeFor(ext: string): string | undefined {
  return CONTENT_TYPES[ext.toLowerCase()]
}

// A url is a local-file candidate unless it points at a remote or inline resource.
function isLocalCandidate(url: string): boolean {
  return !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')
}

function collectImages(node: Node, images: Image[]): void {
  if (node.type === 'image') {
    images.push(node as Image)
  }

  if ('children' in node && Array.isArray((node as Parent).children)) {
    for (const child of (node as Parent).children) {
      collectImages(child, images)
    }
  }
}

export async function preprocessImages(ast: Node, context: ConversionContext, baseDir: string): Promise<void> {
  const images: Image[] = []
  collectImages(ast, images)

  for (const image of images) {
    const url = image.url
    if (!isLocalCandidate(url)) continue
    // Dedup by reference: the same url only needs reading once.
    if (context.localImages.has(url)) continue

    const ext = extname(url)
    const contentType = contentTypeFor(ext)
    if (!contentType) {
      console.warn(`Skipping image with unsupported extension: ${url}`)
      continue
    }

    let data: Buffer
    try {
      data = await readFile(resolve(baseDir, url))
    } catch (error) {
      console.warn(`Failed to read local image ${url}: ${error}`)
      continue
    }

    const hash = createHash('md5').update(data).digest('hex').slice(0, 12)
    const filename = `${basename(url, ext)}-${hash}${ext}`

    context.attachments.set(filename, { filename, data, contentType })
    context.localImages.set(url, filename)
  }
}
