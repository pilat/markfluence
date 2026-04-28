/**
 * Polyfill CSSStyleDeclaration for svgdom elements.
 *
 * svgdom's element.style returns the element itself (circular ref), not a CSSStyleDeclaration.
 * D3 (bundled in mermaid) calls element.style.removeProperty() during sequence diagram rendering.
 * This shim provides minimal CSSStyleDeclaration methods that parse/manipulate the style attribute.
 */

interface StyleShim {
  getPropertyValue(name: string): string
  setProperty(name: string, value: string): void
  removeProperty(name: string): string
}

interface PatchableElement {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  _styleShim?: StyleShim
}

function createStyleShim(element: PatchableElement): StyleShim {
  return {
    getPropertyValue(name: string): string {
      const style = element.getAttribute('style') || ''
      const match = style.match(new RegExp(`${name}\\s*:\\s*([^;]+)`))
      return match ? match[1].trim() : ''
    },
    setProperty(name: string, value: string): void {
      const style = element.getAttribute('style') || ''
      const regex = new RegExp(`${name}\\s*:[^;]+;?\\s*`)
      const cleaned = style.replace(regex, '')
      const separator = cleaned && !cleaned.endsWith(';') ? '; ' : ''
      element.setAttribute('style', `${cleaned}${separator}${name}: ${value};`.trim())
    },
    removeProperty(name: string): string {
      const style = element.getAttribute('style') || ''
      const regex = new RegExp(`${name}\\s*:[^;]+;?\\s*`, 'g')
      const oldValue = this.getPropertyValue(name)
      element.setAttribute('style', style.replace(regex, '').trim())
      return oldValue
    },
  }
}

/**
 * Patch SVGElement.prototype.style to return a CSSStyleDeclaration shim.
 * Must be called after svgdom creates the window but before mermaid renders.
 */
export function patchSvgdomStyle(win: Record<string, unknown>): void {
  // biome-ignore lint/suspicious/noExplicitAny: accessing svgdom's SVGElement
  const SVGElement = (win as any).SVGElement
  if (!SVGElement) return

  Object.defineProperty(SVGElement.prototype, 'style', {
    get(this: PatchableElement) {
      if (!this._styleShim) {
        this._styleShim = createStyleShim(this)
      }
      return this._styleShim
    },
    set() {},
    configurable: true,
  })
}
