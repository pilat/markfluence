export interface Page {
  id: string
  type: string
  status: string
  title: string
  space?: {
    key: string
  }
  version: {
    number: number
    message?: string
  }
  body?: {
    storage: {
      value: string
      representation: string
    }
  }
  ancestors?: Array<{ id: string }>
  _links: {
    webui: string
    base: string
  }
}

export interface Attachment {
  id: string
  type: string
  title: string
  metadata: {
    mediaType: string
  }
  _links: {
    download: string
  }
}

export interface SearchResult {
  results: Page[]
  start: number
  limit: number
  size: number
}

export interface AttachmentSearchResult {
  results: Attachment[]
  start: number
  limit: number
  size: number
}

export interface ApiError {
  statusCode: number
  message: string
  reason?: string
}

export interface CreatePageRequest {
  type: 'page'
  title: string
  space: {
    key: string
  }
  ancestors?: Array<{ id: string }>
  body: {
    storage: {
      value: string
      representation: 'storage'
    }
  }
}

export interface UpdatePageRequest {
  type: 'page'
  title: string
  version: {
    number: number
  }
  body: {
    storage: {
      value: string
      representation: 'storage'
    }
  }
}
