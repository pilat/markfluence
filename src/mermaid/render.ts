import { createHash } from 'node:crypto'
import { Resvg } from '@resvg/resvg-js'

// Patch JSON.stringify to handle circular references (elkjs debug logs)
const originalStringify = JSON.stringify
JSON.stringify = (value, replacer, space) => {
  const seen = new WeakSet()
  const safeReplacer = (_key: string, val: unknown) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return undefined // Remove circular refs
      seen.add(val)
      // Skip DOM nodes entirely
      if (val instanceof Object && 'nodeType' in val) return undefined
    }
    return replacer ? (replacer as (k: string, v: unknown) => unknown)(_key, val) : val
  }
  try {
    return originalStringify(value, safeReplacer, space)
  } catch {
    return 'null' // Return valid JSON on error
  }
}

// Dynamic imports to ensure patches are applied first
let mermaid: typeof import('isomorphic-mermaid').default
let elkLayouts: typeof import('@mermaid-js/layout-elk').default
let initialized = false
let diagramIdCounter = 0

async function loadMermaid() {
  if (!mermaid) {
    const mod = await import('isomorphic-mermaid')
    mermaid = mod.default

    // Patch window with everything elkjs needs (GWT compatibility)
    // isomorphic-mermaid sets window = svgWindow which lacks these
    // biome-ignore lint/suspicious/noExplicitAny: patching global window for GWT
    const win = (globalThis as any).window as Record<string, unknown> | undefined
    if (win) {
      win.Error = Error
      win.Math = Math
      win.Date = Date
      win.Array = Array
      win.Object = Object
      win.String = String
      win.Number = Number
      win.setTimeout = setTimeout
      win.clearTimeout = clearTimeout
      win.setInterval = setInterval
      win.clearInterval = clearInterval
      win.console = console
    }

    // Load and register ELK layout engine
    const elkMod = await import('@mermaid-js/layout-elk')
    elkLayouts = elkMod.default
    mermaid.registerLayoutLoaders(elkLayouts)
  }
  return mermaid
}

export function getMermaidHash(code: string): string {
  return createHash('md5').update(code).digest('hex').slice(0, 12)
}

export function getMermaidFilename(code: string): string {
  return `mermaid-${getMermaidHash(code)}.png`
}

export async function isMermaidAvailable(): Promise<boolean> {
  return true
}

export async function closeBrowser(): Promise<void> {
  // No browser to close - kept for API compatibility
}

async function initMermaid(): Promise<void> {
  if (initialized) return

  const m = await loadMermaid()
  m.initialize({
    startOnLoad: false,
    htmlLabels: false, // Required for isomorphic-mermaid (no DOM)
    securityLevel: 'strict',
    logLevel: 'fatal', // Minimize logging to avoid circular JSON issues
    flowchart: {
      defaultRenderer: 'elk', // Better layout for nested subgraphs
      htmlLabels: false,
    },
  })

  initialized = true
}

export async function renderMermaid(code: string): Promise<Buffer> {
  await initMermaid()
  const m = await loadMermaid()

  // Generate unique ID for this diagram
  const id = `mermaid-${diagramIdCounter++}`

  // Render to SVG (ELK renderer is set globally in initMermaid)
  let { svg } = await m.render(id, code)

  // Fix SVG dimensions: mermaid outputs width="100%" and NO height attribute on <svg>
  // resvg needs explicit dimensions to render correctly, extract from viewBox
  const viewBoxMatch = svg.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/)
  if (viewBoxMatch) {
    const [, width, height] = viewBoxMatch
    // Replace width="100%" and inject height (mermaid doesn't set height on <svg>)
    svg = svg.replace(/<svg([^>]*)width="100%"([^>]*)>/, `<svg$1width="${width}" height="${height}"$2>`)
    // Remove max-width style that can confuse renderers
    svg = svg.replace(/style="[^"]*max-width:[^;]*;?\s*"/, '')
  }

  // Convert SVG to PNG with 4x scale for crisp images
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'zoom',
      value: 4,
    },
    background: 'white',
  })

  const pngData = resvg.render()
  return Buffer.from(pngData.asPng())
}
