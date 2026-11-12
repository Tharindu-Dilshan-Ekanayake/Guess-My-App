import { memo } from 'react'

import { GLYPH } from '../game/apps'

const AT = (24 * (1 - GLYPH)) / 2

/**
 * An app's icon as inline SVG: a rounded tile in the brand colour with its logo.
 * Crisp at any size and free to draw (no image downloads).
 */
export const AppIcon = memo(function AppIcon({ app, className = '', rounded = true }) {
  if (!app) return null
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx={rounded ? 5.4 : 0} fill={app.bg} />
      <path d={app.path} fill={app.fg} transform={`translate(${AT} ${AT}) scale(${GLYPH})`} />
    </svg>
  )
})

export default AppIcon
