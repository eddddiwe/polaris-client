import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CosmeticBadge } from '../src/renderer/src/components/Cosmetics'

// The default badge (badge-north) uses glyph 'star'. Regression guard: the
// glyph function previously fell through to null, leaving the badge empty.
const STAR_PATH =
  'M16 6.1 18.4 13.6 25.9 16 18.4 18.4 16 25.9 13.6 18.4 6.1 16 13.6 13.6 16 6.1Z'

describe('CosmeticBadge', () => {
  it('draws the star glyph for the default badge', () => {
    expect(renderToStaticMarkup(<CosmeticBadge id="badge-north" />)).toContain(STAR_PATH)
  })

  it('draws the star glyph when the badge id is missing', () => {
    expect(renderToStaticMarkup(<CosmeticBadge />)).toContain(STAR_PATH)
  })
})
