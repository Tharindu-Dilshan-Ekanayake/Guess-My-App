import { useEffect, useMemo, useState } from 'react'

import { sfx } from '../audio/sfx'
import { APPS, appById, searchKey, TIER_LABEL, TIER_RARITY } from '../game/apps'
import { DATA, RARITY_COLORS } from '../game/layout'
import { send } from '../net/api'
import { useGame } from '../net/gameStore'
import AppIcon from './AppIcon'
import { money } from './format'
import { useProgressive } from './useProgressive'

const TABS = [
  ['all', 'All 📱'],
  ['locked', 'Locked 🔒'],
  ['owned', 'Owned ✅'],
]

/** How long the "You unboxed…" card stays up after opening a crate. */
const UNBOX_SHOW_MS = 4500

function UnboxCard() {
  const unboxed = useGame((s) => s.unboxed)
  useEffect(() => {
    if (!unboxed) return undefined
    const id = setTimeout(() => useGame.setState({ unboxed: null }), UNBOX_SHOW_MS)
    return () => clearTimeout(id)
  }, [unboxed])
  if (!unboxed) return null
  const app = appById(unboxed.id)
  if (!app) return null
  const color = RARITY_COLORS[TIER_RARITY[app.tier]]
  return (
    <div
      key={unboxed.at}
      className="slam flex shrink-0 items-center gap-3 rounded-xl border-[3px] bg-[#1d2433] px-3 py-2"
      style={{ borderColor: color, boxShadow: `0 0 1.2rem ${color}` }}
    >
      <AppIcon app={app} className="size-16 shrink-0" />
      <div className="min-w-0">
        <div className="stroke-thin text-sm font-bold text-white/80">📦 You unboxed…</div>
        <div className="stroke-text truncate text-[1.8rem] font-bold leading-tight text-white">{app.name}!</div>
        <div className="stroke-thin text-sm font-bold uppercase" style={{ color }}>
          {TIER_LABEL[app.tier]}
        </div>
      </div>
    </div>
  )
}

/**
 * The App Store: every logo in the game. Owned apps can be chosen as your secret
 * app in a duel; the rest are bought with cash, one by one or at random from the
 * App Crate. Rarer apps cost more and are harder for opponents to recognise.
 */
export function AppStore({ profile }) {
  const tab = useGame((s) => s.appsTab)
  const [query, setQuery] = useState('')
  const owned = useMemo(() => new Set(profile.ownedApps || []), [profile.ownedApps])
  const q = query.trim().toLowerCase()

  const shown = useMemo(
    () =>
      APPS.filter((a) => {
        if (tab === 'owned' && !owned.has(a.id)) return false
        if (tab === 'locked' && owned.has(a.id)) return false
        return !q || searchKey(a).includes(q)
      }),
    [tab, owned, q],
  )
  // A page of cards at a time: all ~380 at once froze slow phones for ~1 s.
  const { visible, sentinel, more } = useProgressive(shown, `${tab}|${q}`)
  const allOwned = owned.size >= APPS.length
  const crate = DATA.appCrate

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 rounded-xl border-[3px] border-[#6b3a00] bg-gradient-to-b from-[#ffb04d] to-[#ff7a1f] px-3 py-2">
        <span className="text-[2.4rem] leading-none">📦</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="stroke-text text-[1.4rem] font-bold text-white">App Crate</div>
          <div className="stroke-thin text-sm font-bold text-white">A random app you don&apos;t own yet. Could be Epic!</div>
        </div>
        <button
          type="button"
          disabled={allOwned}
          onClick={() => {
            sfx.click()
            send({ t: 'buy', kind: 'crate' })
          }}
          className={`press btn-3d min-w-[6rem] px-3 py-1.5 text-lg font-bold text-white ${allOwned ? 'bg-[#3b3e45]' : 'bg-[#22d43a]'}`}
        >
          <span className="stroke-text">{allOwned ? 'DONE' : money(crate.price)}</span>
        </button>
      </div>

      <UnboxCard />

      <div className="flex shrink-0 items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 Search apps…"
          className="min-w-0 flex-1 rounded-full border-[3px] border-black/60 bg-[#123540] px-4 py-1.5 text-base font-bold text-white placeholder:text-white/60 focus:outline-none"
        />
        <span className="stroke-thin shrink-0 text-sm font-bold text-white">
          {owned.size}/{APPS.length} owned
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-4">
        {visible.map((app) => {
          const has = owned.has(app.id)
          const color = RARITY_COLORS[TIER_RARITY[app.tier]]
          return (
            <div
              key={app.id}
              className="app-card relative flex flex-col items-center gap-1 rounded-xl border-[3px] bg-[#123540] p-1.5"
              style={{ borderColor: color }}
            >
              <AppIcon app={app} className={`aspect-square w-full ${has ? '' : 'opacity-80'}`} />
              <span className="stroke-thin w-full truncate text-center text-sm font-bold leading-tight text-white">
                {app.name}
              </span>
              <span className="stroke-thin text-[0.65rem] font-bold uppercase leading-none" style={{ color }}>
                {TIER_LABEL[app.tier]}
              </span>
              {has ? (
                <span className="stroke-thin w-full rounded-lg bg-[#3b3e45] py-1 text-center text-sm font-bold text-white">
                  OWNED ✅
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    sfx.click()
                    send({ t: 'buy', kind: 'app', id: app.id })
                  }}
                  className={`press btn-3d w-full py-1 text-sm font-bold text-white ${
                    profile.cash >= app.price ? 'bg-[#22d43a]' : 'bg-[#6b7280]'
                  }`}
                >
                  <span className="stroke-thin">{money(app.price)}</span>
                </button>
              )}
              {app.new && (
                <span className="absolute -right-1.5 -top-1.5 rotate-12 rounded bg-[#ff2d55] px-1 text-[0.65rem] font-bold text-white">
                  NEW!
                </span>
              )}
            </div>
          )
        })}
        {more && <div ref={sentinel} className="col-span-full h-8" aria-hidden="true" />}
        {shown.length === 0 && (
          <p className="stroke-thin col-span-full py-6 text-center text-lg font-bold text-white">
            {tab === 'locked' ? 'You own every app! 🏆' : 'Nothing here'}
          </p>
        )}
      </div>
    </>
  )
}

export function AppStoreTabs() {
  const tab = useGame((s) => s.appsTab)
  return (
    <div className="mb-2 grid grid-cols-3 gap-1.5">
      {TABS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            sfx.click()
            useGame.setState({ appsTab: id })
          }}
          className={`press btn-3d whitespace-nowrap px-0.5 py-1.5 text-sm font-bold text-white ${
            tab === id ? 'bg-[#ff7a1f]' : 'bg-[#2d6b78]'
          }`}
        >
          <span className="stroke-thin">{label}</span>
        </button>
      ))}
    </div>
  )
}

export default AppStore
