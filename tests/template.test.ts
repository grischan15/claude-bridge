// tests/template.test.ts
import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../src/render/template.js'

describe('renderTemplate', () => {
  it('interpolates variables', () => {
    expect(renderTemplate('Hi {{name}}', { name: 'Max' })).toBe('Hi Max')
  })
  it('supports {% if %} blocks', () => {
    expect(renderTemplate('{% if x %}yes{% endif %}', { x: true })).toBe('yes')
    expect(renderTemplate('{% if x %}yes{% endif %}', { x: false })).toBe('')
  })
  it('applies the default filter for missing values', () => {
    expect(renderTemplate('{{ goal | default("Koop") }}', {})).toBe('Koop')
  })
  it('renders undefined vars as empty without throwing', () => {
    expect(renderTemplate('a{{missing}}b', {})).toBe('ab')
  })
  it('does not html-escape quotes, ampersands or angle brackets', () => {
    expect(renderTemplate('{{s}}', { s: 'A & "B" <c>' })).toBe('A & "B" <c>')
  })
  it('renders nested data', () => {
    expect(renderTemplate('{{contact.full_name}}', { contact: { full_name: 'Max' } })).toBe('Max')
  })
})
