// Main entry point for library usage

export { loadConfig } from './config.js'
export { ConfluenceApiError, ConfluenceClient } from './confluence/client.js'
export type { Attachment, Page } from './confluence/types.js'
export { convert } from './converter.js'
export { parse } from './parser.js'
export { syncFiles } from './sync.js'
export type { Config, ConversionContext, Frontmatter, ParsedDocument } from './types.js'
