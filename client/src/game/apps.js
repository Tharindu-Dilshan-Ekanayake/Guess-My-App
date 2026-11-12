import APPS from '../../../shared/apps.json'

/**
 * The app catalogue (shared/apps.json, built by scripts/build-apps.mjs from
 * simple-icons). Every logo is one 24x24 SVG path drawn on a coloured tile, so the
 * whole catalogue is ~80 KB gzip and needs no image files. No three.js here: the
 * menus import this, and three belongs to the lazily loaded scene chunk.
 */

export { APPS }

const byId = new Map(APPS.map((a) => [a.id, a]))
export const appById = (id) => (id ? byId.get(id) || null : null)

export const TIER_LABEL = { 1: 'Starter', 2: 'Common', 3: 'Rare', 4: 'Epic' }
export const TIER_RARITY = { 1: 'common', 2: 'uncommon', 3: 'rare', 4: 'epic' }

/** Logo size as a share of the tile, and where it starts (centred). */
export const GLYPH = 0.6
const GLYPH_AT = (1 - GLYPH) / 2

/** Lowercase name + id for the search boxes. */
export const searchKey = (app) => `${app.name} ${app.id}`.toLowerCase()

const pathCache = new Map()
function path2d(app) {
  let p = pathCache.get(app.id)
  if (!p) {
    p = new Path2D(app.path)
    pathCache.set(app.id, p)
  }
  return p
}

/**
 * Draws an app's logo full-bleed into a size x size square: the tile colour edge to
 * edge (the board is square), the logo in the middle. A soft top highlight gives it
 * the glossy app-icon look.
 */
export function drawAppLogo(ctx, app, size) {
  ctx.save()
  ctx.fillStyle = app.bg
  ctx.fillRect(0, 0, size, size)
  const shine = ctx.createLinearGradient(0, 0, 0, size)
  shine.addColorStop(0, 'rgba(255,255,255,0.16)')
  shine.addColorStop(0.5, 'rgba(255,255,255,0)')
  ctx.fillStyle = shine
  ctx.fillRect(0, 0, size, size)
  ctx.translate(size * GLYPH_AT, size * GLYPH_AT)
  ctx.scale((size * GLYPH) / 24, (size * GLYPH) / 24)
  ctx.fillStyle = app.fg
  ctx.fill(path2d(app))
  ctx.restore()
}
