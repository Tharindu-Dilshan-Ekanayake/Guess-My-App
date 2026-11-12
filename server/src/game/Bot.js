const DATA = require('./data')
const { PlayerState } = require('./schema')

const MIN = DATA.numberMin
const MAX = DATA.numberMax

const rand = (lo, hi) => lo + Math.random() * (hi - lo)
const randomInt = (lo, hi) => Math.floor(rand(lo, hi + 1))
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/** Chairs a bot may sit on: the cheaper ones, so it looks like an ordinary newcomer. */
const BOT_CHAIRS = DATA.chairs.filter((c) => c.price <= 1200).map((c) => c.id)
/** How long a bot "thinks" before acting, in ms: a range, so it doesn't feel scripted. */
const THINK_MS = { pick: [1200, 3500], guess: [1500, 4200], leave: [500, 900] }

/**
 * A practice opponent: stands in for a second player so nobody waits at a table for
 * ever. It plays through the same Table methods a real player does (pick, guess), so
 * the duel rules are enforced identically, and it learns the state of the duel from
 * the same private `match` messages a client would receive.
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
    const key = `${m.phase}:${m.guesses}:${m.myTurn ? 1 : 0}:${m.myNumber == null ? 0 : 1}`
    if (key === this.key) return
    this.key = key
    this.clear()

    const table = this.seat?.table
    if (!table) return
    if (m.phase === 'choosing' && m.myNumber == null) {
      this.later(THINK_MS.pick, () => table.pick(this, randomInt(MIN, MAX), Date.now()))
    } else if (m.phase === 'guessing' && m.myTurn) {
      this.later(THINK_MS.guess, () => table.guess(this, this.chooseGuess(m.range), Date.now()))
    }
  }

  /**
   * Splits the remaining range near the middle with a little human-looking wobble, so
   * it plays well (about as well as a careful player) without being a perfect machine.
   */
  chooseGuess([lo, hi]) {
    const width = hi - lo + 1
    if (width <= 2) return Math.random() < 0.5 ? lo : hi
    const wobble = (Math.random() - 0.5) * width * 0.35
    return clamp(Math.round((lo + hi) / 2 + wobble), lo, hi)
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
