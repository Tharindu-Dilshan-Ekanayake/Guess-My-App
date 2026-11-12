import { memo, useCallback, useEffect, useMemo, useState } from 'react'

import { sfx } from '../audio/sfx'
import { APPS, appById, searchKey } from '../game/apps'
import { DATA, emoteById, titleById } from '../game/layout'
import { useSettings } from '../game/quality'
import { useGame } from '../net/gameStore'
import { bubbles } from '../net/liveState'
import { send } from '../net/api'
import AppIcon from './AppIcon'
import { money, useNow } from './format'
import { useProgressive } from './useProgressive'

const secondsLeft = (endsAt, now) => Math.max(0, Math.ceil((endsAt - now) / 1000))
const modeOf = (match) => DATA.modes[match?.mode] ?? DATA.modes.normal

/** Big centre text (countdown, result), below the VS bar and above the players' heads. */
function Banner({ children, className = '' }) {
  return (
    <div className={`pointer-events-none absolute left-1/2 top-[30%] z-30 w-[92vw] -translate-x-1/2 text-center ${className}`}>
      {children}
    </div>
  )
}

function LeaveButton({ label = 'Leave', forfeit = false, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (forfeit && !window.confirm('Leaving now counts as a loss. Leave anyway?')) return
        sfx.click()
        send({ t: 'leave' })
      }}
      className={`btn-3d press pointer-events-auto bg-gradient-to-b from-[#ff5a5a] to-[#d81f1f] px-4 py-1.5 text-base font-bold text-white ${className}`}
    >
      <span className="stroke-thin">{label}</span>
    </button>
  )
}

/** "Play Bot": a practice opponent for a player waiting alone. It only comes when asked. */
function BotButton() {
  return (
    <button
      type="button"
      onClick={() => {
        sfx.click()
        send({ t: 'bot' })
      }}
      className="btn-3d press pointer-events-auto bg-gradient-to-b from-[#b07dff] to-[#6a3ee8] px-4 py-1.5 text-base font-bold text-white"
    >
      <span className="stroke-thin">🤖 Play Bot</span>
    </button>
  )
}

/**
 * The guess being answered: "Is it TikTok?" with a drumroll, then YES 🎯 or NOPE ❌
 * slamming in. Both players see it, at the bottom where the turn buttons were, so
 * the boards stay in view.
 */
function RevealCard({ reveal }) {
  const app = appById(reveal.id)
  const answered = reveal.correct !== null
  const who = reveal.mine ? 'You asked' : 'They asked'
  let detail = reveal.mine ? 'Is it their app…?' : 'Is it your app…?'
  if (answered && reveal.correct) detail = reveal.mine ? 'You got it!' : 'They got your app!'
  else if (answered) detail = reveal.mine ? 'Not their app. Keep flipping!' : 'Phew! Not your app'

  return (
    <div className="pointer-events-none absolute bottom-[6%] left-1/2 z-40 -translate-x-1/2">
      <div className="ui-panel pop-in flex items-center gap-3 px-3 py-2">
        <div className="flex flex-col items-center gap-1">
          <div className="stroke-thin whitespace-nowrap text-xs font-bold text-white/90">{who}</div>
          <div className={`size-16 overflow-hidden rounded-2xl border-[3px] border-black ${answered ? '' : 'reveal-pulse'}`}>
            <AppIcon app={app} className="size-full" rounded={false} />
          </div>
          <div className="stroke-thin max-w-[6rem] truncate text-sm font-bold text-white">{app?.name}</div>
        </div>
        <div className="flex min-w-[10rem] flex-col items-center gap-1.5">
          {answered ? (
            <div
              key={String(reveal.correct)}
              className={`slam btn-3d flex items-center gap-2 bg-gradient-to-b px-4 py-1 ${
                reveal.correct ? 'from-[#fff15c] to-[#ffb800]' : 'from-[#ff7b7b] to-[#e01f1f]'
              }`}
            >
              <span className="stroke-text text-[1.9rem] font-bold leading-none text-white">
                {reveal.correct ? 'YES! 🎯' : 'NOPE ❌'}
              </span>
            </div>
          ) : (
            <div className="stroke-text text-[1.9rem] font-bold leading-none text-white">🤔 …</div>
          )}
          <div className="stroke-thin text-center text-sm font-bold text-white">{detail}</div>
        </div>
      </div>
    </div>
  )
}

/** Wrong guesses so far, as little crossed-out icons. */
function WrongChips({ label, ids }) {
  if (!ids?.length) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      <span className="stroke-thin mr-1 text-sm font-bold text-white/90">{label}</span>
      {ids.map((id) => (
        <span key={id} className="relative size-7 overflow-hidden rounded-md border-2 border-black/70" title={appById(id)?.name}>
          <AppIcon app={appById(id)} className="size-full opacity-70" rounded={false} />
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#ff2d2d] [text-shadow:0_0_2px_#000]">
            ✖
          </span>
        </span>
      ))}
    </div>
  )
}

/** What a duelist last said (an emote, "Is it TikTok? 🤔", "Nope 😂"), while it lasts. */
function speechOf(id, now) {
  const b = id ? bubbles.get(id) : null
  return b && b.text && b.until > now ? b.text : null
}

/** One side of the VS bar: title, name, level/streak, and a speech bubble underneath. */
function DuelistCard({ player, isSelf, active, speech, align, tiles }) {
  const title = titleById(player?.title)
  const badges = [`Lv ${player?.level || 1}`, player?.streak > 0 ? `🔥 ${player.streak}` : '', tiles]
    .filter(Boolean)
    .join('  ')
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1.5 ${align === 'left' ? 'items-start' : 'items-end'}`}>
      <div
        className={`ui-panel flex w-full min-w-0 flex-col px-2.5 py-1 ${
          align === 'left' ? 'items-start text-left' : 'items-end text-right'
        } ${active ? 'turn-ring' : ''}`}
      >
        {title && (
          <span
            className={`max-w-full truncate text-[0.65rem] font-bold leading-tight ${title.rainbow ? 'rainbow-text' : ''}`}
            style={title.rainbow ? undefined : { color: title.color }}
          >
            {title.name}
          </span>
        )}
        <span className="stroke-thin flex max-w-full items-center gap-1 text-base font-bold leading-tight text-white">
          <span className="truncate">{player?.name || '…'}</span>
          {isSelf && <span className="shrink-0 rounded bg-[#2a6bff] px-1 text-[0.6rem]">YOU</span>}
        </span>
        <span className="text-[0.7rem] font-bold leading-tight text-[#ffd23d]">{badges}</span>
      </div>
      {speech && (
        <div
          key={speech}
          className={`speech pop-in max-w-full rounded-xl border-2 border-black/70 bg-white px-2 py-0.5 text-sm font-bold leading-snug text-[#1d2433] ${
            align === 'left' ? 'speech-left' : 'speech-right'
          }`}
        >
          {speech}
        </div>
      )}
    </div>
  )
}

function statusOf(match) {
  if (match.phase === 'countdown') return 'GET READY'
  if (match.phase === 'choosing') return match.myApp ? 'WAITING…' : 'PICK AN APP'
  if (match.myTurn) return match.flipped ? 'GUESS OR SKIP' : 'FLIP A TILE'
  if (match.pending) return 'CHECKING…'
  return 'THEIR TURN'
}

/**
 * Top of the screen during a duel: opponent | timer + whose turn | you. The sides
 * match where each player sits on screen (seat 0 is on the right of the duel
 * cameras), and what each one says shows under their card.
 */
function DuelBar({ match, now }) {
  const selfId = useGame((s) => s.selfId)
  const profile = useGame((s) => s.profile)
  const them = useGame((s) => (match.opponent ? s.players[match.opponent] : null))
  const self = {
    name: profile?.name || 'You',
    level: profile?.level,
    streak: profile?.streak,
    title: profile?.equippedTitle,
  }
  const guessing = match.phase === 'guessing'
  const left = secondsLeft(match.endsAt, now)

  const myCard = (
    <DuelistCard
      key="me"
      player={self}
      isSelf
      active={match.myTurn}
      speech={speechOf(selfId, now)}
      align={match.seat === 0 ? 'right' : 'left'}
      tiles={guessing ? `🔲 ${match.revealed}/${match.tiles}` : ''}
    />
  )
  const theirCard = (
    <DuelistCard
      key="them"
      player={them}
      active={match.theirTurn}
      speech={speechOf(match.opponent, now)}
      align={match.seat === 0 ? 'left' : 'right'}
      tiles={guessing ? `🔲 ${match.theirRevealed}/${match.tiles}` : ''}
    />
  )
  return (
    <div className="hud-top pointer-events-none absolute left-1/2 z-40 flex w-[min(94vw,36rem)] -translate-x-1/2 items-start gap-2">
      {match.seat === 0 ? theirCard : myCard}
      <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
        <div
          className={`btn-3d flex size-12 items-center justify-center text-xl font-bold text-white ${
            left <= 5 && match.phase !== 'countdown' ? 'bg-[#e53935]' : 'bg-[#2d6b78]'
          }`}
        >
          <span className="stroke-thin">{match.phase === 'countdown' ? 'VS' : left}</span>
        </div>
        <span
          className={`stroke-thin whitespace-nowrap rounded-md px-1.5 text-[0.7rem] font-bold text-white ${
            match.myTurn ? 'bg-[#22c55e]' : 'bg-black/45'
          }`}
        >
          {statusOf(match)}
        </span>
      </div>
      {match.seat === 0 ? myCard : theirCard}
    </div>
  )
}

/** "[17s]": ticks on its own, so whatever contains it doesn't re-render each second. */
function Countdown({ endsAt }) {
  const now = useNow(250)
  const left = secondsLeft(endsAt, now)
  return (
    <span className={`stroke-text text-[1.6rem] font-bold leading-none ${left <= 5 ? 'text-[#ff2d2d]' : 'text-[#ff4040]'}`}>
      [{left}s]
    </span>
  )
}

/**
 * The app grid. 'choose': pick your secret app from the apps you own. 'guess': tap
 * the app you think hides under your board; wrong guesses are crossed out.
 */
const AppPicker = memo(function AppPicker({ match, mode, onClose }) {
  const { blur } = useSettings()
  const owned = useGame((s) => s.profile?.ownedApps)
  const [query, setQuery] = useState('')

  const options = useMemo(() => {
    if (mode === 'guess') return APPS
    const mine = new Set(owned || [])
    // Rarer apps first: they're the hardest for your opponent to guess.
    return APPS.filter((a) => mine.has(a.id)).sort((a, b) => b.tier - a.tier)
  }, [mode, owned])
  const wrong = useMemo(() => new Set(match.wrong || []), [match.wrong])
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => (q ? options.filter((a) => searchKey(a).includes(q)) : options), [options, q])
  // A page of cards at a time: all ~380 at once froze slow phones for ~1 s mid-turn.
  const { visible, sentinel, more } = useProgressive(shown, q)

  const choose = (app) => {
    sfx.click()
    if (mode === 'choose') send({ t: 'pick', id: app.id })
    else {
      send({ t: 'guess', id: app.id })
      onClose?.()
    }
  }
  return (
    <div
      className={`pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/35 ${
        blur ? 'backdrop-blur-sm' : ''
      }`}
    >
      <div className="pop-in flex max-h-[94dvh] w-[min(96vw,40rem)] flex-col overflow-hidden rounded-2xl border-[4px] border-black bg-gradient-to-b from-[#1b8cff] to-[#0b5ccf] shadow-2xl">
        <div className="studs flex items-center justify-between gap-2 bg-gradient-to-b from-[#3ee7ff] to-[#1aa3ff] px-3 py-2">
          <h2 className="stroke-text truncate text-[1.7rem] font-bold leading-tight text-white">
            {mode === 'choose' ? 'CHOOSE AN APP' : 'GUESS THEIR APP'}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <Countdown endsAt={match.endsAt} />
            {onClose && (
              <button
                type="button"
                onClick={() => {
                  sfx.click()
                  onClose()
                }}
                className="btn-3d press flex size-10 items-center justify-center bg-gradient-to-b from-[#ff5a5a] to-[#d81f1f] text-xl font-bold text-white"
              >
                <span className="stroke-text">X</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 Search apps…"
            className="w-full rounded-full border-[3px] border-black/60 bg-[#1d2433]/85 px-4 py-1.5 text-lg font-bold text-white placeholder:text-white/60 focus:outline-none"
          />
          <p className="stroke-thin text-sm font-bold text-white/90">
            {mode === 'choose'
              ? `Your opponent tries to guess it. You own ${options.length} apps: get more in the App Store 📱`
              : `${APPS.length - wrong.size} apps left · a wrong guess ends your turn`}
          </p>
          <div className="game-scroll grid max-h-[min(62dvh,30rem)] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
            {visible.map((app) => {
              const isWrong = wrong.has(app.id)
              const off = mode === 'guess' && isWrong
              return (
                <button
                  type="button"
                  key={app.id}
                  disabled={off}
                  onClick={() => choose(app)}
                  className="press app-card relative flex flex-col items-center gap-0.5 rounded-xl border-[3px] border-black bg-[#4fc3ff] p-1"
                >
                  <AppIcon app={app} className="aspect-square w-full" />
                  <span className="stroke-thin w-full truncate text-center text-[0.8rem] font-bold leading-tight text-white">
                    {app.name}
                  </span>
                  {app.new && mode === 'choose' && (
                    <span className="absolute -right-1 -top-1 rotate-12 rounded bg-[#ff2d55] px-1 text-[0.6rem] font-bold text-white">
                      NEW!
                    </span>
                  )}
                  {isWrong && (
                    <span className="absolute inset-0 flex items-center justify-center text-[3rem] font-bold text-[#ff2d2d] [text-shadow:0_0_4px_#000]">
                      ✖
                    </span>
                  )}
                </button>
              )
            })}
            {more && <div ref={sentinel} className="col-span-full h-8" aria-hidden="true" />}
            {shown.length === 0 && (
              <p className="stroke-thin col-span-full py-6 text-center text-lg font-bold text-white">No app called “{query}”</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

/** Bottom of the screen while guessing: the flip hint, GUESS and SKIP. */
function TurnPanel({ match, now, onGuess }) {
  const left = secondsLeft(match.endsAt, now)
  const mine = match.myTurn
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-40 flex w-[min(96vw,32rem)] -translate-x-1/2 flex-col items-center gap-2">
      {mine && !match.flipped && (
        <div className="stroke-text wiggle text-center text-[1.5rem] font-bold leading-none text-white">
          👆 Tap a tile to flip it!
        </div>
      )}
      {!mine && (
        <div className="stroke-text text-center text-[1.3rem] font-bold leading-none text-white">
          {match.pending ? 'Checking the guess…' : 'Their turn… 🤔'}
        </div>
      )}
      {(mine ? match.wrong : match.theirWrong)?.length > 0 && (
        <div className="ui-panel w-full px-2 py-1">
          <WrongChips label={mine ? 'Wrong:' : 'Their wrong guesses:'} ids={mine ? match.wrong : match.theirWrong} />
        </div>
      )}
      <div className="relative grid w-full grid-cols-[3fr_2fr] gap-2">
        {mine && (
          <span
            className={`stroke-text pointer-events-none absolute -left-1 -top-4 z-10 text-[1.6rem] font-bold leading-none ${
              left <= 5 ? 'text-[#ff2d2d]' : 'text-[#ff4040]'
            }`}
          >
            {left}s
          </span>
        )}
        <button
          type="button"
          disabled={!mine}
          onClick={() => {
            sfx.click()
            onGuess()
          }}
          className={`btn-3d press pointer-events-auto py-2 text-[2rem] font-bold leading-none text-white ${
            mine ? 'bg-gradient-to-b from-[#b6ff3b] to-[#38c600]' : 'bg-[#5d6168]'
          }`}
        >
          <span className="stroke-text">Guess</span>
        </button>
        <button
          type="button"
          disabled={!mine}
          onClick={() => {
            sfx.click()
            send({ t: 'skip' })
          }}
          className={`btn-3d press pointer-events-auto py-2 text-[2rem] font-bold leading-none text-white ${
            mine ? 'bg-gradient-to-b from-[#e3e8f5] to-[#9aa6c4]' : 'bg-[#5d6168]'
          }`}
        >
          <span className="stroke-text">SKIP</span>
        </button>
      </div>
    </div>
  )
}

/** Quick phrases bought in the Emote Shop, said in a bubble over your head. */
function EmotePanel({ hidden }) {
  const owned = useGame((s) => s.profile?.ownedEmotes) || []
  const isOpen = useGame((s) => s.emotesOpen)
  const toggle = useGame((s) => s.toggleEmotes)
  if (hidden) return null

  return (
    <div className="emote-pos pointer-events-none absolute left-3 z-40 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={toggle}
        className="btn-3d press pointer-events-auto bg-gradient-to-b from-[#3ee7ff] to-[#2a6bff] px-3 py-1 text-base font-bold text-white"
      >
        <span className="stroke-text">Emotes 👀</span>
      </button>
      {isOpen && (
        <div className="ui-panel pop-in pointer-events-auto w-[14rem] p-2">
          <div className="game-scroll flex max-h-[min(30vh,14rem)] flex-col gap-1.5 overflow-y-auto pr-1">
            {owned.map((id) => {
              const e = emoteById(id)
              if (!e) return null
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    sfx.pop()
                    send({ t: 'emote', id })
                    // Fold the list away again: one tap, one phrase.
                    useGame.setState({ emotesOpen: false })
                  }}
                  className="btn-3d press flex items-center justify-between bg-gradient-to-b from-[#fff35c] to-[#f2c200] px-2 py-1"
                >
                  <span className="stroke-thin truncate text-base font-bold text-white">
                    {e.label} {e.icon}
                  </span>
                  <span className="text-xs font-bold text-black/50">USE</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultBanner() {
  const result = useGame((s) => s.result)
  const now = useNow(250)

  useEffect(() => {
    if (!result) return undefined
    const id = setTimeout(() => useGame.setState({ result: null }), Math.max(0, result.until - Date.now()))
    return () => clearTimeout(id)
  }, [result])

  if (!result || result.until < now) return null
  const app = appById(result.theirApp)
  const left = result.reason === 'forfeit' || result.reason === 'afk'

  return (
    <Banner className="top-[26%]">
      <div className="pop-in flex flex-col items-center">
        <div
          className={`stroke-text text-[3.6rem] font-bold leading-none ${result.win ? 'text-[#ffe23d]' : 'text-[#ff4040]'}`}
        >
          {result.win ? 'YOU WIN! 🏆' : 'YOU LOSE 💀'}
        </div>
        {!result.win && left ? (
          <div className="stroke-text mt-2 text-2xl font-bold text-white">You left the duel</div>
        ) : (
          app && (
            <div className="ui-panel mt-3 flex items-center gap-2 px-3 py-1.5">
              <span className="stroke-thin text-xl font-bold text-white">Their app was</span>
              <AppIcon app={app} className="size-10" />
              <span className="stroke-text text-2xl font-bold text-[#5cff5c]">{app.name}</span>
            </div>
          )
        )}
        {result.reward > 0 && (
          <div className="stroke-text mt-2 text-2xl font-bold text-white">
            +{money(result.reward)} 💵{result.win ? '' : ' for playing'}
          </div>
        )}
      </div>
    </Banner>
  )
}

/** Everything on screen while seated at a table: waiting, countdown, the duel. */
export function MatchUI() {
  const match = useGame((s) => s.match)
  const reveal = useGame((s) => s.reveal)
  const now = useNow(250)
  /** The turn the guess picker was opened on: it closes by itself when the turn ends. */
  const [pickerTurn, setPickerTurn] = useState(-1)
  // Stable, so the memoised picker doesn't re-render on every HUD tick.
  const closePicker = useCallback(() => setPickerTurn(-1), [])

  // A wood-block tick on each second of the "Starting in 3, 2, 1" countdown.
  const countdown = match?.phase === 'countdown' ? Math.max(1, secondsLeft(match.endsAt, now)) : 0
  useEffect(() => {
    if (countdown) sfx.tick()
  }, [countdown])

  const revealing = Boolean(match && reveal && reveal.until > now)
  const choosing = match?.phase === 'choosing' && !match.myApp
  const guessing = match?.phase === 'guessing'
  const pickerOpen = guessing && match.myTurn && !revealing && pickerTurn === match.turnNo
  const mode = modeOf(match)

  return (
    <>
      {match && <EmotePanel hidden={choosing || pickerOpen} />}
      {match && !choosing && !pickerOpen && ['countdown', 'choosing', 'guessing'].includes(match.phase) && (
        <DuelBar match={match} now={now} />
      )}

      {match?.phase === 'waiting' && (
        <div className="pointer-events-none absolute bottom-[14%] left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
          <span className="stroke-text whitespace-nowrap text-[1.7rem] font-bold" style={{ color: mode.color }}>
            {mode.label} · {mode.grid}x{mode.grid} tiles · Win {money(mode.reward)}
          </span>
          <span className="stroke-text whitespace-nowrap text-2xl font-bold text-white">Waiting for an opponent… (1/2)</span>
          <div className="flex items-center gap-3">
            <BotButton />
            <LeaveButton />
          </div>
        </div>
      )}

      {match?.phase === 'countdown' && (
        <>
          <Banner>
            <span className="stroke-text text-[3.6rem] font-bold text-white">
              Starting in {Math.max(1, secondsLeft(match.endsAt, now))}
            </span>
          </Banner>
          <div className="pointer-events-none absolute bottom-[16%] left-1/2 z-30 -translate-x-1/2">
            <LeaveButton />
          </div>
        </>
      )}

      {choosing && <AppPicker match={match} mode="choose" />}
      {match?.phase === 'choosing' && match.myApp && (
        <Banner className="top-auto bottom-[20%]">
          <div className="ui-panel pop-in mx-auto flex w-fit items-center gap-2 px-3 py-1.5">
            <span className="stroke-thin text-lg font-bold text-white">Your app:</span>
            <AppIcon app={appById(match.myApp)} className="size-9" />
            <span className="stroke-text text-xl font-bold text-white">{appById(match.myApp)?.name}</span>
            <span className="stroke-thin text-lg font-bold text-white/80">· waiting for them…</span>
          </div>
        </Banner>
      )}

      {guessing && (
        <>
          {revealing ? (
            <RevealCard reveal={reveal} />
          ) : pickerOpen ? (
            <AppPicker match={match} mode="guess" onClose={closePicker} />
          ) : (
            <TurnPanel match={match} now={now} onGuess={() => setPickerTurn(match.turnNo)} />
          )}
          {!pickerOpen && (
            <div className="quit-pos pointer-events-none absolute right-3 z-40">
              <LeaveButton label="Quit" forfeit className="px-3 py-1 text-sm" />
            </div>
          )}
        </>
      )}

      <ResultBanner />
    </>
  )
}

export default MatchUI
