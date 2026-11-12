const { appById, appsUpToTier, IDS, lookalikes } = require('./apps')
const DATA = require('./data')
const { PlayerState } = require('./schema')

const rand = (lo, hi) => lo + Math.random() * (hi - lo)
const randomInt = (lo, hi) => Math.floor(rand(lo, hi + 1))
const pickRandom = (list) => list[Math.floor(Math.random() * list.length)]

/** Chairs a bot may sit on: the cheaper ones, so it looks like an ordinary newcomer. */
const BOT_CHAIRS = DATA.chairs.filter((c) => c.price <= 1200).map((c) => c.id)
/** How long a bot "thinks" before acting, in ms: a range, so it doesn't feel scripted. */
const THINK_MS = { pick: [1500, 4000], flip: [900, 2200], decide: [900, 2400], leave: [500, 900] }
/** How much harder each tier above 1 is to recognise (share of the board that must be open). */
const TIER_PENALTY = 0.05

/**
 * A practice opponent: stands in for a second player so nobody waits at a table for
 * ever. It plays through the same Table methods a real player does (pick, flip,
 * guess, skip), so the duel rules are enforced identically, and it follows the duel
 * through the same private `match` messages a client would receive.
 *
 * It "recognises" the player's app once enough of the board is open: a share that
 * depends on the table's mode, how obscure the app is (its tier) and a per-duel
 * wobble. Before that it sometimes blurts out a lookalike (an app of a similar
 * colour), as people do.
 *
 * Bots live only for one duel: they appear when someone has waited alone, and are
 * removed when the duel is over or their opponent leaves. They never touch profiles,
 * leaderboards or the profile store (see GameRoom.recordWin / recordLoss).
 */
class Bot {
  /**
   * @param {import('./GameRoom')} room
   * @param {string} id unique id in the room's player map
   * @param {string} name display name
   */
  constructor(room, id, name) {
    this.isBot = true
    this.room = room
    this.id = id
    this.name = name
    this.userId = ''
    this.seat = null
    this.timer = null
    this.key = ''
    /** Per-duel sharpness: some bots are quicker than others. */
    this.wobble = rand(-0.06, 0.06)

    // The bits of a profile that Table and GameRoom read.
    this.profile = {
      equippedChair: BOT_CHAIRS[randomInt(0, BOT_CHAIRS.length - 1)],
      passes: [],
    }

    const [x, y, z] = DATA.world.spawn
    const p = new PlayerState()
    p.name = name
    p.uid = ''
    p.uname = ''
    p.streak = 0
    p.level = randomInt(1, 6)
    p.title = ''
    p.halo = ''
    p.avatar = JSON.stringify({ equipped: null, proportions: null })
    p.x = x
    p.y = y
    p.z = z
    p.g = true
    this.player = p
  }

  /** Stand where the seat is, so anything reading the player's position agrees. */
  placeAt(table) {
    if (!this.seat) return
    const p = this.player
    p.x = table.x + (this.seat.index === 0 ? -DATA.table.seatX : DATA.table.seatX)
    p.z = table.z + DATA.table.seatZ
  }

  // The Session surface that Table and GameRoom call. Bots have no screen to update.
  toast() {}
  pushProfile() {}
  respawn() {}

  /** Private messages from the table: the only one a bot cares about is `match`. */
  send(type, payload) {
    if (type === 'match') this.onMatch(payload?.match)
  }

  onMatch(m) {
    if (!m) {
      // Stood up (duel over, or their opponent left): the bot's job is done.
      this.clear()
      this.key = ''
      this.room.removeBot(this)
      return
    }
    if (m.phase === 'waiting') {
      // Their opponent left: nobody to play with, so go too.
      this.later(THINK_MS.leave, () => this.leave())
      return
    }

    // The table syncs many times per phase; act once per distinct situation.
    const key = `${m.phase}:${m.turnNo}:${m.myTurn ? 1 : 0}:${m.flipped ? 1 : 0}:${m.myApp ? 1 : 0}`
    if (key === this.key) return
    this.key = key
    this.clear()

    const table = this.seat?.table
    if (!table) return
    if (m.phase === 'choosing' && !m.myApp) {
      this.later(THINK_MS.pick, () => table.pick(this, this.chooseApp(table), Date.now()))
    } else if (m.phase === 'guessing' && m.myTurn && !m.flipped) {
      this.later(THINK_MS.flip, () => table.flip(this, this.chooseTile(table), Date.now()))
    } else if (m.phase === 'guessing' && m.myTurn) {
      this.later(THINK_MS.decide, () => this.decide(table))
    }
  }

  /** Its secret app: anything up to the table's tier (hard tables hide rarer apps). */
  chooseApp(table) {
    return pickRandom(appsUpToTier(table.cfg.botTier)).id
  }

  /**
   * Which tile to flip: like a person, near the middle of the board first (logos
   * live there), then next to tiles already open, with some randomness.
   */
  chooseTile(table) {
    const i = this.seat.index
    const n = table.cfg.grid
    const open = table.revealed[i]
    const mid = (n - 1) / 2
    let best = -1
    let bestScore = -Infinity
    for (let k = 0; k < table.tiles; k += 1) {
      if (open.has(k)) continue
      const r = Math.floor(k / n)
      const c = k % n
      const centre = -Math.hypot(r - mid, c - mid) / n
      const near = [k - n, k + n, c > 0 ? k - 1 : -1, c < n - 1 ? k + 1 : -1].filter((x) => open.has(x)).length
      const score = centre * 2 + near * 0.25 + Math.random() * 0.9
      if (score > bestScore) {
        bestScore = score
        best = k
      }
    }
    return best
  }

  /** Guess (rightly once it "sees" the logo, sometimes wrongly before) or skip. */
  decide(table) {
    const i = this.seat.index
    const target = table.secrets[1 - i]
    const app = appById(target)
    if (!app) return table.skip(this, Date.now())

    const shown = table.revealed[i].size / table.tiles
    const need = table.cfg.bot.threshold + (app.tier - 1) * TIER_PENALTY + this.wobble
    const ruledOut = new Set(table.wrong[i])

    if (shown >= need) {
      table.guess(this, target, Date.now())
      return
    }
    if (Math.random() < table.cfg.bot.wild + shown * 0.25) {
      // A lookalike when there's one left to try, otherwise any app.
      const options = lookalikes(target, 8).filter((id) => !ruledOut.has(id))
      const pool = options.length ? options : IDS.filter((id) => id !== target && !ruledOut.has(id))
      if (pool.length) {
        table.guess(this, pickRandom(pool), Date.now())
        return
      }
    }
    table.skip(this, Date.now())
  }

  leave() {
    this.seat?.table.leave(this, Date.now())
    this.room.removeBot(this)
  }

  later([lo, hi], fn) {
    this.clear()
    this.timer = this.room.clock.setTimeout(() => {
      this.timer = null
      fn()
    }, rand(lo, hi))
  }

  clear() {
    this.timer?.clear()
    this.timer = null
  }

  dispose() {
    this.clear()
  }
}

module.exports = Bot
