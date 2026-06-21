import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { convert } from '../src/converter.js'
import { preprocessImages } from '../src/images/preprocess.js'
import { parse } from '../src/parser.js'
import type { ConversionContext } from '../src/types.js'

function createContext(): ConversionContext {
  return {
    config: {
      domain: 'test.atlassian.net',
      space: 'TEST',
      auth: { email: 'test@example.com', token: 'xxx' },
    },
    frontmatter: {},
    attachments: new Map(),
    localImages: new Map(),
  }
}

describe('preprocessImages', () => {
  it('uploads a local image under a content-hashed name and emits it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markfluence-img-'))
    try {
      const bytes = Buffer.from('not-a-real-png-but-fine-for-hashing')
      writeFileSync(join(dir, 'img.png'), bytes)
      const hash = createHash('md5').update(bytes).digest('hex').slice(0, 12)
      const expectedName = `img-${hash}.png`

      const { ast } = parse('![diagram](./img.png)')
      const context = createContext()
      await preprocessImages(ast, context, dir)

      expect(context.attachments.has(expectedName)).toBe(true)
      const attachment = context.attachments.get(expectedName)
      expect(attachment?.contentType).toBe('image/png')
      expect(attachment?.data).toEqual(bytes)
      expect(context.localImages.get('./img.png')).toBe(expectedName)

      const xml = convert(ast, context)
      expect(xml).toContain(`<ri:attachment ri:filename="${expectedName}"/>`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('warns and skips a missing local image without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { ast } = parse('![missing](./nope.png)')
      const context = createContext()

      await expect(preprocessImages(ast, context, tmpdir())).resolves.toBeUndefined()
      expect(context.attachments.size).toBe(0)
      expect(context.localImages.size).toBe(0)
      expect(warn).toHaveBeenCalled()

      // Converter falls back to the basename for the un-uploaded file.
      expect(convert(ast, context)).toContain('<ri:attachment ri:filename="nope.png"/>')
    } finally {
      warn.mockRestore()
    }
  })

  it('skips unsupported extensions and leaves remote images alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dir = mkdtempSync(join(tmpdir(), 'markfluence-img-'))
    try {
      writeFileSync(join(dir, 'notes.txt'), 'text')

      const { ast } = parse('![doc](./notes.txt)\n\n![remote](https://x/p.png)')
      const context = createContext()
      await preprocessImages(ast, context, dir)

      expect(context.attachments.size).toBe(0)
      expect(context.localImages.size).toBe(0)
      // Only the unsupported local file warns; the remote URL is left untouched.
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips data: URIs without reading or warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { ast } = parse('![inline](data:image/png;base64,iVBORw0KGgo=)')
      const context = createContext()
      await preprocessImages(ast, context, tmpdir())

      expect(context.attachments.size).toBe(0)
      expect(context.localImages.size).toBe(0)
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('reads a repeated local image only once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markfluence-img-'))
    try {
      const bytes = Buffer.from('dedup-me')
      writeFileSync(join(dir, 'dup.png'), bytes)
      const hash = createHash('md5').update(bytes).digest('hex').slice(0, 12)

      const { ast } = parse('![one](./dup.png)\n\n![two](./dup.png)')
      const context = createContext()
      await preprocessImages(ast, context, dir)

      expect(context.attachments.size).toBe(1)
      expect(context.localImages.size).toBe(1)
      expect(context.localImages.get('./dup.png')).toBe(`dup-${hash}.png`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
