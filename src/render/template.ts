import nunjucks from 'nunjucks'

// Prompt text, not HTML: autoescape OFF so quotes/ampersands/angle brackets pass
// through unchanged. Undefined vars render empty (Nunjucks default); use
// {{ x | default("...") }} for explicit defaults.
const env = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: false,
})

export function renderTemplate(template: string, data: Record<string, unknown> = {}): string {
  return env.renderString(template, data)
}
