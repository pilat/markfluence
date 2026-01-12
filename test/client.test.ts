import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfluenceApiError, ConfluenceClient } from '../src/confluence/client.js'
import type { Config } from '../src/types.js'

const mockConfig: Config = {
  domain: 'test.atlassian.net',
  space: 'TEST',
  auth: { email: 'test@example.com', token: 'test-token' },
}

describe('ConfluenceClient', () => {
  let client: ConfluenceClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    client = new ConfluenceClient(mockConfig)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('getPage', () => {
    it('fetches page by id', async () => {
      const mockPage = {
        id: '123',
        title: 'Test Page',
        version: { number: 1 },
        body: { storage: { value: '<p>Content</p>' } },
      }

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPage),
      })

      const result = await client.getPage('123')

      expect(fetchMock).toHaveBeenCalledWith(
        'https://test.atlassian.net/wiki/rest/api/content/123?expand=version,body.storage,space,ancestors',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        }),
      )
      expect(result).toEqual(mockPage)
    })
  })

  describe('getPageByTitle', () => {
    it('finds page by title in space', async () => {
      const mockPage = { id: '456', title: 'Found Page' }

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [mockPage] }),
      })

      const result = await client.getPageByTitle('TEST', 'Found Page')

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('spaceKey=TEST'), expect.anything())
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('title=Found%20Page'), expect.anything())
      expect(result).toEqual(mockPage)
    })

    it('returns null when page not found', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [] }),
      })

      const result = await client.getPageByTitle('TEST', 'Missing')
      expect(result).toBeNull()
    })
  })

  describe('createPage', () => {
    it('creates page with content', async () => {
      const mockPage = { id: '789', title: 'New Page' }

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPage),
      })

      const result = await client.createPage('TEST', 'New Page', '<p>Content</p>')

      expect(fetchMock).toHaveBeenCalledWith(
        'https://test.atlassian.net/wiki/rest/api/content',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"title":"New Page"'),
        }),
      )
      expect(result).toEqual(mockPage)
    })

    it('creates page with parent', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '789' }),
      })

      await client.createPage('TEST', 'Child', '<p>Content</p>', 'parent-id')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('"ancestors":[{"id":"parent-id"}]'),
        }),
      )
    })
  })

  describe('updatePage', () => {
    it('updates page with incremented version', async () => {
      const mockPage = { id: '123', version: { number: 2 } }

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPage),
      })

      const result = await client.updatePage('123', 'Title', '<p>New</p>', 1)

      expect(fetchMock).toHaveBeenCalledWith(
        'https://test.atlassian.net/wiki/rest/api/content/123',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"version":{"number":2}'),
        }),
      )
      expect(result).toEqual(mockPage)
    })
  })

  describe('error handling', () => {
    it('throws ConfluenceApiError on 401', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ message: 'Invalid credentials' }),
      })

      await expect(client.getPage('123')).rejects.toThrow(ConfluenceApiError)

      try {
        await client.getPage('123')
      } catch (e) {
        expect(e).toBeInstanceOf(ConfluenceApiError)
        expect((e as ConfluenceApiError).statusCode).toBe(401)
      }
    })

    it('throws ConfluenceApiError on 404', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Page not found' }),
      })

      await expect(client.getPage('nonexistent')).rejects.toThrow(ConfluenceApiError)
    })

    it('throws ConfluenceApiError on 403', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ message: 'No permission' }),
      })

      await expect(client.createPage('TEST', 'Page', '<p>x</p>')).rejects.toThrow(ConfluenceApiError)
    })
  })

  describe('getAttachments', () => {
    it('fetches page attachments', async () => {
      const mockAttachments = [
        { id: 'att1', title: 'file.png' },
        { id: 'att2', title: 'doc.pdf' },
      ]

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: mockAttachments }),
      })

      const result = await client.getAttachments('123')

      expect(fetchMock).toHaveBeenCalledWith(
        'https://test.atlassian.net/wiki/rest/api/content/123/child/attachment',
        expect.anything(),
      )
      expect(result).toEqual(mockAttachments)
    })
  })
})

describe('ConfluenceApiError', () => {
  it('provides help text for 401', () => {
    const error = new ConfluenceApiError({ statusCode: 401, message: 'Unauthorized' })
    const help = error.getHelpText()

    expect(help).toContain('Authentication failed')
    expect(help).toContain('CONFLUENCE_EMAIL')
    expect(help).toContain('CONFLUENCE_API_TOKEN')
  })

  it('provides help text for 403', () => {
    const error = new ConfluenceApiError({ statusCode: 403, message: 'Forbidden' })
    const help = error.getHelpText()

    expect(help).toContain('Permission denied')
  })

  it('provides help text for 404', () => {
    const error = new ConfluenceApiError({ statusCode: 404, message: 'Not Found' })
    const help = error.getHelpText()

    expect(help).toContain('Page not found')
    expect(help).toContain('confluence-page-id')
  })

  it('returns message for other status codes', () => {
    const error = new ConfluenceApiError({ statusCode: 500, message: 'Server error' })
    expect(error.getHelpText()).toBe('Server error')
  })
})
