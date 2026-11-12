const { appById, isApp, IDS, STARTER_APPS } = require('./apps')
const DATA = require('./data')

const T = DATA.timing

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)]

/**
 * A set of tile indices as a hex string, 4 tiles per digit ('' when nothing is
 * open). 100 tiles fit in 25 characters, so the public table state stays tiny.
 */
function encodeTiles(set, count) {
  if (set.size === 0) return ''
  let out = ''
  for (let k = 0; k < count; k += 4) {
    let v = 0
    for (let b = 0; b < 4; b += 1) if (set.has(k + b)) v |= 1 << b
    out += v.toString(16)
  }
  return out
}

/**
 * One two-seat table and the duel played at it.
 *
 * Phases:
 *   waiting   - zero or one player seated
 *   countdown - both seats filled, "Starting in 3..."
 *   choosing  - each player secretly picks one of the apps they own
 *   guessing  - turns: flip one tile of the board hiding the opponent's app, then
 *               guess the app or skip.
 *   ended     - result on screen; both players are stood up when it runs out
 *
 * Each seat has its own board in front of it: an N x N grid of tiles covering the
 * OPPONENT's app. `revealed[i]` is the set of tiles seat i has opened.
 */
class Table {
  /**
   * @param {{ id: number, x: number, z: number, mode?: string }} def
   * @param {import('./GameRoom')} room
   * @param {object} state this table's synced TableState, for every client to see
   */
  constructor(def, room, state) {
    this.id = def.id
    this.x = def.x
    this.z = def.z
    this.mode = DATA.modes[def.mode] ? def.mode : 'normal'
    this.cfg = DATA.modes[this.mode]
    this.tiles = this.cfg.grid * this.cfg.grid
    this.room = room
    this.state = state
    /** @type {Array<import('./Session')|null>} */
    this.seats = [null, null]
    this.token = 0
    this.reset()
  }

  reset() {
    this.phase = 'waiting'
    this.endsAt = 0
    /** Each seat's secret app id. */
    this.secrets = [null, null]
    /** revealed[i] = tiles seat i has opened on the board hiding seat (1-i)'s app. */
    this.revealed = [new Set(), new Set()]
    /** Wrong guesses each seat has made (app ids). */
    this.wrong = [[], []]
    this.guesses = [0, 0]
    this.turn = 0
    /** Counts turns, so a bot can tell one turn from the next. */
    this.turnNo = 0
    /** The free flip of the current turn has been used. */
    this.flipped = false
    /** Seat index of the winner once the duel has ended, else -1. */
    this.winner = -1
    this.timeouts = [0, 0]
    /** True between a guess and its answer, so a second action can't sneak in. */
    this.pending = false
    // Invalidates any setTimeout scheduled for the previous match.
    this.token += 1
  }

  seatOf(session) {
    return this.seats.indexOf(session)
  }

  sit(session, now) {
    if (this.room.draining) return 'Server update in progress: hopping you to a fresh server…'
    if (this.phase !== 'waiting') return 'This table is already playing'
    const free = this.seats.indexOf(null)
    if (free < 0) return 'This table is full'

    this.seats[free] = session
    session.seat = { table: this, index: free }

    if (this.seats[0] && this.seats[1]) {
      this.phase = 'countdown'
      this.endsAt = now + T.countdown * 1000
    }
    this.sync(now)
    return null
  }

  /** A seated player stands up or disconnects. */
  leave(session, now) {
    const i = this.seatOf(session)
    if (i < 0) return
    const other = this.seats[1 - i]

    if (this.phase === 'guessing') {
      this.finish(1 - i, i, 'forfeit', now)
    } else if (this.phase === 'countdown' || this.phase === 'choosing') {
      other?.toast('Your opponent left the table')
    }

    this.unseat(i)
    if (this.phase !== 'ended') {
      // The remaining player (if any) keeps their seat and waits for someone new.
      this.reset()
      if (other) this.room.bubble(other, '')
    }
    this.sync(now)
  }

  unseat(i) {
    const session = this.seats[i]
    if (!session) return
    this.seats[i] = null
    session.seat = null
    session.send('match', { match: null })
  }

  /** Apps a seat may choose as its secret: everything a bot likes, a player's owned apps. */
  choosable(session) {
    if (!session) return STARTER_APPS
    if (session.isBot) return IDS
    const owned = session.profile.ownedApps
    return owned?.length ? owned : STARTER_APPS
  }

  pick(session, id, now) {
    const i = this.seatOf(session)
    if (i < 0 || this.phase !== 'choosing' || this.secrets[i] !== null) return
    if (!isApp(id) || !this.choosable(session).includes(id)) return

    this.secrets[i] = id
    this.room.bubble(session, 'Ready ✅')
    if (this.secrets[1 - i] !== null) this.startGuessing(now)
    else this.sync(now)
  }

  /** Seat index of `session` if it may act right now (its turn, nothing pending), else -1. */
  actor(session) {
    const i = this.seatOf(session)
    if (i < 0 || this.phase !== 'guessing' || this.turn !== i || this.pending) return -1
    return i
  }

  hiddenTiles(i) {
    const out = []
    for (let k = 0; k < this.tiles; k += 1) if (!this.revealed[i].has(k)) out.push(k)
    return out
  }

  /** Opens tiles on seat i's board; returns how many were newly opened. */
  open(i, tiles) {
    let opened = 0
    for (const k of tiles) {
      if (k < 0 || k >= this.tiles || this.revealed[i].has(k)) continue
      this.revealed[i].add(k)
      opened += 1
    }
    if (opened) this.room.questEvent(this.seats[i], 'flip', opened)
    return opened
  }

  /** The free flip of a turn: one tile the player chose. */
  flip(session, index, now) {
    const i = this.actor(session)
    if (i < 0 || this.flipped) return
    if (!Number.isInteger(index) || index < 0 || index >= this.tiles || this.revealed[i].has(index)) return
    this.flipped = true
    this.timeouts[i] = 0
    this.open(i, [index])
    this.sync(now)
  }

  /** Flips a random hidden tile for a player who didn't (timeout, or skipping first). */
  autoFlip(i) {
    if (this.flipped) return
    const hidden = this.hiddenTiles(i)
    if (hidden.length) this.open(i, [pickRandom(hidden)])
    this.flipped = true
  }

  guess(session, id, now) {
    const i = this.actor(session)
    if (i < 0 || !isApp(id) || this.wrong[i].includes(id)) return

    this.guesses[i] += 1
    this.timeouts[i] = 0
    this.pending = true
    this.room.bubble(session, `Is it ${appById(id).name}? 🤔`)
    // Both players see the guess land, then (after the suspense) the answer.
    this.tell({ t: 'guessed', by: i, id })
    this.sync(now)

    const token = this.token
    // Room clock: cleared automatically if the room is disposed meanwhile.
    this.room.clock.setTimeout(() => {
      if (this.token !== token || this.phase !== 'guessing') return
      this.resolveGuess(i, id, Date.now())
    }, T.guessReveal * 1000)
  }

  resolveGuess(i, id, now) {
    const o = 1 - i
    if (id === this.secrets[o]) {
      this.tell({ t: 'answer', by: i, id, correct: true })
      this.room.bubble(this.seats[o], 'Yes 😭')
      this.finish(i, o, 'guessed', now)
      return
    }
    this.wrong[i].push(id)
    this.tell({ t: 'answer', by: i, id, correct: false })
    this.room.bubble(this.seats[o], 'Nope 😂')
    this.passTurn(now)
  }

  /** Ends your turn without guessing (your free flip happens first if you skipped it). */
  skip(session, now) {
    const i = this.actor(session)
    if (i < 0) return
    this.timeouts[i] = 0
    this.autoFlip(i)
    this.passTurn(now)
  }

  passTurn(now) {
    this.turn = 1 - this.turn
    this.beginTurn(now)
  }

  /**
   * A duel event for both seated players, from each one's point of view: `mine`
   * is true for the player who acted.
   */
  tell({ t, by, ...rest }) {
    this.seats.forEach((s, i) => s?.send('duel', { t, mine: i === by, ...rest }))
  }

  startChoosing(now) {
    this.phase = 'choosing'
    this.endsAt = now + T.choose * 1000
    for (const s of this.seats) this.room.bubble(s, 'Choosing 🤔')
    this.sync(now)
  }

  startGuessing(now) {
    this.phase = 'guessing'
    this.turn = Math.random() < 0.5 ? 0 : 1
    for (const s of this.seats) this.room.bubble(s, '')
    this.beginTurn(now)
  }

  beginTurn(now) {
    this.pending = false
    this.turnNo += 1
    // A board with nothing left to flip goes straight to guessing.
    this.flipped = this.revealed[this.turn].size >= this.tiles
    this.endsAt = now + T.turn * 1000
    this.sync(now)
  }

  finish(w, l, reason, now) {
    this.phase = 'ended'
    this.endsAt = now + T.results * 1000
    this.pending = false
    this.winner = w

    const winner = this.seats[w]
    const loser = this.seats[l]
    let reward = 0

    // A practice match (against a bot) pays less and doesn't count for the boards.
    const vsBot = Boolean(winner?.isBot || loser?.isBot)
    if (winner) {
      reward = this.room.recordWin(winner, { reward: this.cfg.reward, revealed: this.revealed[w].size }, now, vsBot)
    }
    let consolation = 0
    if (loser) consolation = this.room.recordLoss(loser, now, reason, vsBot)
    if (loser && reason !== 'guessed') this.room.bubble(loser, 'NOOO! 💀')
    if (winner) this.room.bubble(winner, reason === 'forfeit' ? 'GG 👍' : 'Got it! 😎')

    this.room.broadcast('result', {
      table: this.id,
      winner: winner?.id ?? null,
      loser: loser?.id ?? null,
      apps: [...this.secrets],
      reward,
      consolation,
      reason,
    })
    this.sync(now)
    // Round end: report leaderboard scores now rather than at the next batch.
    this.room.flushScores()

    // The loser falls apart at the table, then respawns back in the lobby while
    // the winner keeps dancing on their chair.
    const token = this.token
    this.room.clock.setTimeout(() => {
      if (this.token !== token || this.seats[l] !== loser || !loser) return
      this.unseat(l)
      loser.respawn()
      this.sync(Date.now())
    }, T.loserRespawn * 1000)
  }

  tick(now) {
    if (this.phase === 'waiting' || now < this.endsAt) return

    if (this.phase === 'countdown') {
      this.startChoosing(now)
    } else if (this.phase === 'choosing') {
      // Too slow to choose: the server chooses for you.
      this.secrets.forEach((s, i) => {
        if (s === null) {
          this.secrets[i] = pickRandom(this.choosable(this.seats[i]))
          this.seats[i]?.toast(`Out of time! Your app is ${appById(this.secrets[i]).name}`)
        }
      })
      this.startGuessing(now)
    } else if (this.phase === 'guessing' && !this.pending) {
      const slow = this.turn
      this.timeouts[slow] += 1
      if (this.timeouts[slow] >= 2) {
        this.finish(1 - slow, slow, 'afk', now)
      } else {
        // The board still moves on: their free flip lands on a random tile.
        this.autoFlip(slow)
        this.seats[slow]?.toast('Too slow! Turn skipped')
        this.passTurn(now)
      }
    } else if (this.phase === 'ended') {
      this.unseat(0)
      this.unseat(1)
      this.reset()
      this.sync(now)
    }
  }

  privateState(i, now) {
    const o = 1 - i
    const playing = this.phase === 'guessing' || this.phase === 'ended'
    const myTurn = this.phase === 'guessing' && this.turn === i && !this.pending
    return {
      table: this.id,
      seat: i,
      mode: this.mode,
      grid: this.cfg.grid,
      phase: this.phase,
      endsInMs: Math.max(0, this.endsAt - now),
      myApp: this.secrets[i],
      // Needed to draw the tiles this player has opened. Only once both have chosen.
      theirApp: playing ? this.secrets[o] : null,
      myTurn,
      theirTurn: this.phase === 'guessing' && this.turn === o,
      turnNo: this.turnNo,
      flipped: myTurn && this.flipped,
      pending: this.pending,
      guesses: this.guesses[i],
      revealed: this.revealed[i].size,
      theirRevealed: this.revealed[o].size,
      tiles: this.tiles,
      wrong: this.wrong[i],
      theirWrong: this.wrong[o],
      won: this.phase === 'ended' && this.winner === i,
      opponent: this.seats[o]?.id ?? null,
      opponentReady: this.secrets[o] !== null,
    }
  }

  /**
   * Publishes the table: the public part through the synced state (Colyseus sends
   * only fields that changed), the private part to each seated player.
   */
  sync(now = Date.now()) {
    const st = this.state
    st.phase = this.phase
    st.seat0 = this.seats[0]?.id ?? ''
    st.seat1 = this.seats[1]?.id ?? ''
    st.chair0 = this.seats[0]?.profile.equippedChair ?? ''
    st.chair1 = this.seats[1]?.profile.equippedChair ?? ''
    st.turn = this.phase === 'guessing' ? (this.seats[this.turn]?.id ?? '') : ''
    st.winner = this.phase === 'ended' ? (this.seats[this.winner]?.id ?? '') : ''
    st.endsAt = this.phase === 'waiting' ? 0 : this.endsAt
    // Which tiles are open (not what's under them): everyone sees the boards move.
    st.rev0 = encodeTiles(this.revealed[0], this.tiles)
    st.rev1 = encodeTiles(this.revealed[1], this.tiles)
    this.seats.forEach((s, i) => s?.send('match', { match: this.privateState(i, now) }))
  }
}

module.exports = Table
