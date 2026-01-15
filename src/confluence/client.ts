import type { Config } from '../types.js'
import type {
  ApiError,
  Attachment,
  AttachmentSearchResult,
  CreatePageRequest,
  Page,
  SearchResult,
  UpdatePageRequest,
} from './types.js'

export class ConfluenceClient {
  private baseUrl: string
  private authHeader: string

  constructor(config: Config) {
    this.baseUrl = `https://${config.domain}/wiki/rest/api`
    const credentials = Buffer.from(`${config.auth.email}:${config.auth.token}`).toString('base64')
    this.authHeader = `Basic ${credentials}`
  }

  private async request<T>(method: string, path: string, body?: unknown, contentType = 'application/json'): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: 'application/json',
    }

    if (body && contentType === 'application/json') {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body && contentType === 'application/json' ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      let errorMessage: string
      try {
        const errorBody = (await response.json()) as { message?: string; reason?: string }
        errorMessage = errorBody.message || errorBody.reason || response.statusText
      } catch {
        errorMessage = response.statusText
      }

      const error: ApiError = {
        statusCode: response.status,
        message: errorMessage,
      }

      throw new ConfluenceApiError(error)
    }

    if (response.status === 204) {
      return {} as T
    }

    return response.json() as Promise<T>
  }

  async getPage(id: string): Promise<Page> {
    return this.request<Page>('GET', `/content/${id}?expand=version,body.storage,space,ancestors`)
  }

  async getPageByTitle(spaceKey: string, title: string): Promise<Page | null> {
    const encodedTitle = encodeURIComponent(title)
    const result = await this.request<SearchResult>(
      'GET',
      `/content?spaceKey=${spaceKey}&title=${encodedTitle}&expand=version,body.storage`,
    )
    return result.results[0] || null
  }

  async createPage(spaceKey: string, title: string, content: string, parentId?: string): Promise<Page> {
    const body: CreatePageRequest = {
      type: 'page',
      title,
      space: { key: spaceKey },
      body: {
        storage: {
          value: content,
          representation: 'storage',
        },
      },
    }

    if (parentId) {
      body.ancestors = [{ id: parentId }]
    }

    return this.request<Page>('POST', '/content', body)
  }

  async updatePage(id: string, title: string, content: string, version: number): Promise<Page> {
    const body: UpdatePageRequest = {
      type: 'page',
      title,
      version: { number: version + 1 },
      body: {
        storage: {
          value: content,
          representation: 'storage',
        },
      },
    }

    return this.request<Page>('PUT', `/content/${id}`, body)
  }

  async getAttachments(pageId: string): Promise<Attachment[]> {
    const result = await this.request<AttachmentSearchResult>('GET', `/content/${pageId}/child/attachment`)
    return result.results
  }

  async uploadAttachment(pageId: string, filename: string, data: Buffer, contentType: string): Promise<Attachment> {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(data)], { type: contentType })
    formData.append('file', blob, filename)

    const url = `${this.baseUrl}/content/${pageId}/child/attachment`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'X-Atlassian-Token': 'nocheck',
      },
      body: formData,
    })

    if (!response.ok) {
      let errorMessage: string
      try {
        const errorBody = (await response.json()) as { message?: string }
        errorMessage = errorBody.message || response.statusText
      } catch {
        errorMessage = response.statusText
      }
      throw new ConfluenceApiError({
        statusCode: response.status,
        message: errorMessage,
      })
    }

    // API may return attachment directly or wrapped in results array
    const result = (await response.json()) as Attachment | AttachmentSearchResult
    if ('results' in result) {
      return result.results[0]
    }
    return result
  }

  async updateAttachment(
    pageId: string,
    attachmentId: string,
    filename: string,
    data: Buffer,
    contentType: string,
  ): Promise<Attachment> {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(data)], { type: contentType })
    formData.append('file', blob, filename)

    const url = `${this.baseUrl}/content/${pageId}/child/attachment/${attachmentId}/data`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'X-Atlassian-Token': 'nocheck',
      },
      body: formData,
    })

    if (!response.ok) {
      let errorMessage: string
      try {
        const errorBody = (await response.json()) as { message?: string }
        errorMessage = errorBody.message || response.statusText
      } catch {
        errorMessage = response.statusText
      }
      throw new ConfluenceApiError({
        statusCode: response.status,
        message: errorMessage,
      })
    }

    // API may return attachment directly or wrapped in results array
    const result = (await response.json()) as Attachment | AttachmentSearchResult
    if ('results' in result) {
      return result.results[0]
    }
    return result
  }
}

export class ConfluenceApiError extends Error {
  statusCode: number
  reason?: string

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'ConfluenceApiError'
    this.statusCode = error.statusCode
    this.reason = error.reason
  }

  getHelpText(): string {
    switch (this.statusCode) {
      case 401:
        return `Authentication failed
  → Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN
  → Generate token at https://id.atlassian.com/manage-profile/security/api-tokens`
      case 403:
        return `Permission denied
  → Verify you have access to this space/page
  → Check if API token has required permissions`
      case 404:
        return `Page not found
  → Check confluence-page-id in frontmatter
  → Verify the page exists and you have access`
      default:
        return this.message
    }
  }
}
