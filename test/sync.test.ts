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
