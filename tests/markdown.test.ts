import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../src/renderer/src/components/Markdown'

function render(text: string): string {
  return renderToStaticMarkup(createElement(Markdown, { text }))
}

describe('Markdown link targets', () => {
  it('keeps balanced parentheses in explicit and bare URLs', () => {
    const wiki = 'https://en.wikipedia.org/wiki/Foo_(bar)'
    expect(render(`[Wiki](${wiki})`)).toContain(`href="${wiki}"`)
    expect(render(`See ${wiki}.`)).toContain(`href="${wiki}"`)
  })

  it('leaves sentence punctuation outside bare links', () => {
    const html = render('Fixed in https://example.com/releases.')
    expect(html).toContain('href="https://example.com/releases"')
    expect(html).toContain('</a>.')
  })

  it('unwraps angle-bracket autolinks', () => {
    const html = render('See <https://example.com> for details.')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('&lt;')
    expect(html).not.toContain('&gt;')
  })

  it('still refuses non-http(s) link and image schemes', () => {
    const link = render('[x](javascript:alert(1))')
    expect(link).not.toContain('<a ')
    expect(link).toContain('[x](javascript:alert(1))')

    const image = render('![x](data:text/html,boom)')
    expect(image).not.toContain('<img ')
    expect(image).toContain('![x](data:text/html,boom)')
  })
})
