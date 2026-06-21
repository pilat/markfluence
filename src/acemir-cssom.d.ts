// @acemir/cssom is a transitive dependency (via jsdom) and ships no types.
// We touch it only to borrow its real CSSStyleSheet class for a global polyfill (see mermaid/render.ts).
declare module '@acemir/cssom'
