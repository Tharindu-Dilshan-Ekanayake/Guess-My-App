/**
 * The app catalogue (shared/apps.json, built by client/scripts/build-apps.mjs).
 * The server only needs ids, tiers and prices; the logo paths are for drawing.
 */
const APPS = require('../../../shared/apps.json')

const byId = new Map(APPS.map((a) => [a.id, a]))
const IDS = APPS.map((a) => a.id)
/** Owned by every profile from the start. */
const STARTER_APPS = APPS.filter((a) => a.tier === 1).map((a) => a.id)

const appById = (id) => (typeof id === 'string' ? byId.get(id) || null : null)
const isApp = (id) => Boolean(appById(id))

/** Apps of tier <= maxTier, for a bot's secret pick on a given table mode. */
const appsUpToTier = (maxTier) => APPS.filter((a) => a.tier <= maxTier)

/** #rrggbb -> [r, g, b]. */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The `count` apps whose tile colour is closest to `id`'s: what a person mixes it up with. */
function lookalikes(id, count = 6) {
  const app = appById(id)
  if (!app) return []
  const [r, g, b] = rgb(app.bg)
  return APPS.filter((a) => a.id !== id)
    .map((a) => {
      const [r2, g2, b2] = rgb(a.bg)
      return { id: a.id, d: (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2 }
    })
    .sort((x, y) => x.d - y.d)
    .slice(0, count)
    .map((x) => x.id)
}

module.exports = { APPS, IDS, STARTER_APPS, appById, isApp, appsUpToTier, lookalikes }
