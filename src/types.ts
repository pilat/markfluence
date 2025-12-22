import type { Literal, Node, Parent } from 'mdast'

export interface Config {
  domain: string
  space: string
  auth: {
    email: string
    token: string
  }
  parentPageId?: string
  mermaid?: boolean
  dryRun?: boolean
  verbose?: boolean
}

export interface Frontmatter {
  'confluence-page-id'?: string
  title?: string
  labels?: string[]
}

export interface ParsedDocument {
  frontmatter: Frontmatter
  ast: Node
  title: string
}

export interface ConversionContext {
  config: Config
  frontmatter: Frontmatter
  attachments: Map<string, AttachmentInfo>
  pageId?: string
}

export interface AttachmentInfo {
  filename: string
  data: Buffer
  contentType: string
}

export interface ConfluencePage {
  id: string
  title: string
  version: {
    number: number
  }
  body: {
    storage: {
      value: string
    }
  }
  _links: {
    webui: string
  }
}

export interface ConfluenceAttachment {
  id: string
  title: string
  metadata: {
    mediaType: string
  }
}

export type { Node, Parent, Literal }
