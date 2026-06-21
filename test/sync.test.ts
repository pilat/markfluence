import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../src/types.js'

// Mock the mermaid module before importing sync
vi.mock('../src/mermaid/index.js', () => ({
  preprocessMermaid: vi.fn().mockResolvedValue(undefined),
  closeBrowser: vi.fn().mockResolvedValue(undefined),
}))

// Import after mocking
const { syncFiles } = await import('../src/sync.js')

const mockConfig: Config = {
  domain: 'test.atlassian.net',
  space: 'TEST',
  auth: { email: 'test@example.com', token: 'test-token' },
  verbose: false,
  dryRun: false,
}

describe('syncFiles', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('dry run mode', () => {
    it('does not create pages in dry run mode', async () => {
      // Mock page not found
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [] }),
      })

      const results = await syncFiles(['test/example.md'], { ...mockConfig, dryRun: true })

      expect(results).toHaveLength(1)
      expect(results[0].action).toBe('created')
      // Should only have called getPageByTitle, not createPage
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('title='), expect.anything())
    })

    it('does not update pages in dry run mode', async () => {
      const existingPage = {
        id: '123',
        title: 'Example',
        version: { number: 1 },
        body: { storage: { value: '<p>Old content</p>' } },
        _links: { webui: '/pages/123' },
      }

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [existingPage] }),
      })

      const results = await syncFiles(['test/example.md'], { ...mockConfig, dryRun: true })

      expect(results).toHaveLength(1)
      expect(results[0].action).toBe('updated')
      // Should only have called getPageByTitle, not updatePage
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('page creation', () => {
    it('creates new page when not found', async () => {
      // First call: search returns empty (page not found)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [] }),
      })

      // Second call: createPage
      const newPage = {
        id: '456',
        title: 'Example',
        version: { number: 1 },
        _links: { webui: '/pages/456' },
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(newPage),
      })

      const results = await syncFiles(['test/example.md'], mockConfig)

      expect(results).toHaveLength(1)
      expect(results[0].action).toBe('created')
      expect(results[0].pageId).toBe('456')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('page update', () => {
    it('updates existing page when content differs', async () => {
      const existingPage = {
        id: '123',
        title: 'Example',
        version: { number: 1 },
        body: { storage: { value: '<p>Old content</p>' } },
        _links: { webui: '/pages/123' },
      }

      // First call: search returns existing page
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [existingPage] }),
      })

      // Second call: updatePage
      const updatedPage = {
        id: '123',
        title: 'Example',
        version: { number: 2 },
        _links: { webui: '/pages/123' },
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(updatedPage),
      })

      const results = await syncFiles(['test/example.md'], mockConfig)

      expect(results).toHaveLength(1)
      expect(results[0].action).toBe('updated')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('skips page when content is identical', async () => {
      // We need the exact content that would be generated from test/example.md
      // For this test, we'll mock the content to match
      const { ast } = await import('../src/parser.js').then((m) =>
        import('node:fs').then((fs) => m.parse(fs.readFileSync('test/example.md', 'utf-8'))),
      )
      const { convert } = await import('../src/converter.js')

      const context = {
        config: mockConfig,
        frontmatter: {},
        attachments: new Map(),
        localImages: new Map(),
      }
      const expectedContent = convert(ast, context)

      const existingPage = {
        id: '123',
        title: 'Example',
        version: { number: 1 },
        body: { storage: { value: expectedContent } },
        _links: { webui: '/pages/123' },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [existingPage] }),
      })

      const results = await syncFiles(['test/example.md'], mockConfig)

      expect(results).toHaveLength(1)
      expect(results[0].action).toBe('skipped')
      // Only one call - no update needed
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('attachment upload', () => {
    // Writes a markdown file referencing a local image, returns the content-hashed
    // attachment name Confluence would store it under (basename-<md5>.ext).
    async function withLocalImage(): Promise<{ file: string; attachmentName: string; cleanup: () => void }> {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const os = await import('node:os')
      const { createHash } = await import('node:crypto')

      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'markfluence-attach-'))
      const data = Buffer.from('fake-png-bytes')
      fs.writeFileSync(path.join(dir, 'pic.png'), data)
      const file = path.join(dir, 'page.md')
      fs.writeFileSync(file, '# Title\n\n![pic](./pic.png)\n')

      const hash = createHash('md5').update(data).digest('hex').slice(0, 12)
      return {
        file,
        attachmentName: `pic-${hash}.png`,
        cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
      }
    }

    const existingPage = {
      id: '123',
      title: 'Title',
      version: { number: 1 },
      body: { storage: { value: '<p>old</p>' } },
      _links: { webui: '/pages/123' },
    }
    const updatedPage = { id: '123', title: 'Title', version: { number: 2 }, _links: { webui: '/pages/123' } }

    it('skips re-uploading an attachment that already exists (idempotent re-sync)', async () => {
      const { file, attachmentName, cleanup } = await withLocalImage()
      try {
        fetchMock
          // getPageByTitle
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ results: [existingPage] }) })
          // updatePage
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(updatedPage) })
          // getAttachments — the image is already there under the same content-hashed name
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ results: [{ id: 'att-1', title: attachmentName }] }),
          })

        const results = await syncFiles([file], mockConfig)

        // The file must still be reported as updated, not silently dropped on an attachment error.
        expect(results).toHaveLength(1)
        expect(results[0].action).toBe('updated')
        // getPageByTitle + updatePage + getAttachments, and crucially NO re-upload POST.
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false)
      } finally {
        cleanup()
      }
    })

    it('uploads an attachment that is not yet present', async () => {
      const { file, cleanup } = await withLocalImage()
      try {
        fetchMock
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ results: [existingPage] }) })
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(updatedPage) })
          // getAttachments — nothing there yet
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ results: [] }) })
          // uploadAttachment
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'att-2' }) })

        const results = await syncFiles([file], mockConfig)

        expect(results).toHaveLength(1)
        expect(results[0].action).toBe('updated')
        expect(fetchMock).toHaveBeenCalledTimes(4)
        const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')
        expect(postCall?.[0]).toContain('/child/attachment')
      } finally {
        cleanup()
      }
    })
  })

  describe('per-file space override', () => {
    it('uses space from frontmatter when available', async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const os = await import('node:os')

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markfluence-space-'))
      const tempFile = path.join(tempDir, 'test-space-override.md')
      fs.writeFileSync(
        tempFile,
        `---
confluence-space: OTHER
---
# Test Page

Content here.
`,
      )

      try {
        // Mock search by title in OTHER space — returns empty
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] }),
        })

        // Mock createPage
        const newPage = {
          id: '789',
          title: 'Test Page',
          version: { number: 1 },
          _links: { webui: '/pages/789' },
        }
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(newPage),
        })

        const results = await syncFiles([tempFile], mockConfig)

        expect(results).toHaveLength(1)
        expect(results[0].action).toBe('created')
        // Search should use OTHER space, not TEST
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('spaceKey=OTHER'), expect.anything())
        // Create should use OTHER space
        const createCall = fetchMock.mock.calls[1]
        const createBody = JSON.parse(createCall[1].body)
        expect(createBody.space.key).toBe('OTHER')
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })
  })

  describe('page lookup by ID', () => {
    it('uses page ID from frontmatter when available', async () => {
      // Create a temp file with frontmatter
      const fs = await import('node:fs')
      const path = await import('node:path')
      const os = await import('node:os')

      const tempDir = os.tmpdir()
      const tempFile = path.join(tempDir, 'test-with-id.md')
      fs.writeFileSync(
        tempFile,
        `---
confluence-page-id: "existing-123"
---
# Test Page

Content here.
`,
      )

      try {
        // Mock getPage (by ID)
        const existingPage = {
          id: 'existing-123',
          title: 'Test Page',
          version: { number: 5 },
          body: { storage: { value: '<p>Different content</p>' } },
          _links: { webui: '/pages/existing-123' },
        }
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingPage),
        })

        // Mock updatePage
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ...existingPage,
              version: { number: 6 },
            }),
        })

        const results = await syncFiles([tempFile], mockConfig)

        expect(results).toHaveLength(1)
        expect(results[0].pageId).toBe('existing-123')
        // Should call getPage with ID, not search by title
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/content/existing-123'), expect.anything())
      } finally {
        fs.unlinkSync(tempFile)
      }
    })
  })
})

describe('expandFiles', () => {
  // We can't easily test expandFiles directly as it's not exported,
  // but we can test its behavior through syncFiles

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('filters non-markdown files', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const os = await import('node:os')

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2confluence-test-'))

    try {
      // Create test files
      fs.writeFileSync(path.join(tempDir, 'doc.md'), '# Doc\n\nContent')
      fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'Not markdown')

      // Mock search returning no results (page not found)
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [] }),
      })

      const results = await syncFiles([tempDir], { ...mockConfig, dryRun: true })

      // Should only process .md file
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Doc')
    } finally {
      // Cleanup
      fs.rmSync(tempDir, { recursive: true })
    }
  })
})
