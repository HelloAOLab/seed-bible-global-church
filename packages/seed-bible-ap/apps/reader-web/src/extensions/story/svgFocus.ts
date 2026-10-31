// In an SVG drawing the browser reads only the lower-case `tabindex` attribute; Preact writes `tabIndex` as given, which an
// SVG element ignores — the name could then be clicked but never reached by the keyboard. Spread this onto an SVG element
// that acts as a button.
export const svgFocusable = (on: boolean): Record<string, number> =>
  on ? { tabindex: 0 } : {};
