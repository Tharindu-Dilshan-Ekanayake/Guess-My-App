import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'

import { sfx } from '../audio/sfx'
import { send } from '../net/api'
import { useGame } from '../net/gameStore'
import { appById, drawAppLogo } from './apps'
import { fontReady, GAME_FONT } from './labels'
import { DATA, TABLE } from './layout'
import { useSettings } from './quality'
import { useDisposable } from './useDisposable'

/**
 * The tile boards on every table. Each seat has a square board in front of it: an
 * N x N grid of "?" tiles hiding the opponent's app. Flipping a tile opens it.
 *
 * Draw calls, whatever the number of tables: one instanced mesh for every tile on
 * the plaza, two for the board plates (coloured rim + black bed), and at the
 * player's own table two logo planes under the tiles. Which tiles are open comes
 * from the public table state (rev0 / rev1), so everyone sees boards move; what is
 * under them is drawn only at your own table.
 *
 * Boards face the duel's top-down camera, which looks from the table's -Z side
 * towards the seats: the top of a logo points to +Z, its left to +X.
 */

const SIZE = DATA.board.size
const OFFSET = DATA.board.seatOffset
const RIM = 0.05
const PLATE_H = 0.012
const Y_RIM = TABLE.height + PLATE_H / 2
const Y_BED = TABLE.height + PLATE_H / 2 + 0.004
const Y_LOGO = TABLE.height + PLATE_H + 0.0055
const Y_TILE = TABLE.height + PLATE_H + 0.009
/**
 * A covered tile fills its whole cell: any gap would show the logo underneath. The
 * dark grid lines between tiles are drawn into the tile texture instead.
 */
const TILE_FILL = 1
const FLIP_SECONDS = 0.42
const SEAT_RIM = ['#e53935', '#2a8bff']
const HOVER = new Color('#ffe066')
const WHITE = new Color('#ffffff')
const BOARD_Z = -0.02

/** Every board on the plaza, with where its tiles start in the shared instanced mesh. */
const BOARDS = []
let TOTAL_TILES = 0
for (const t of DATA.tables) {
  const n = DATA.modes[t.mode]?.grid ?? 6
  for (const seat of [0, 1]) {
    BOARDS.push({
      table: t.id,
      seat,
      n,
      cell: SIZE / n,
      x: t.x + (seat === 0 ? -OFFSET : OFFSET),
      z: t.z + BOARD_Z,
      start: TOTAL_TILES,
    })
    TOTAL_TILES += n * n
  }
}
const boardOf = (tableId, seat) => BOARDS.find((b) => b.table === tableId && b.seat === seat)

/** Centre of tile k of board b. Row 0 is the top of the logo (+Z), column 0 its left (+X). */
const tileX = (b, k) => b.x + SIZE / 2 - ((k % b.n) + 0.5) * b.cell
const tileZ = (b, k) => b.z + SIZE / 2 - (Math.floor(k / b.n) + 0.5) * b.cell

/** Is tile k open in the hex bitmask `mask` (see Table.encodeTiles on the server)? */
function isOpen(mask, k) {
  const digit = k >> 2
  if (!mask || digit >= mask.length) return false
  return (parseInt(mask[digit], 16) & (1 << (k & 3))) !== 0
}

/** Flat, facing up, top of the texture towards +Z and its left towards +X. */
const flatPlane = (w, h) => new PlaneGeometry(w, h).rotateX(-Math.PI / 2).rotateY(Math.PI)

const _obj = new Object3D()

/** A dark tile with a white "?", drawn once and shared by every tile on the plaza. */
function createTileTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  const draw = () => {
    const ctx = canvas.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 0, size)
    g.addColorStop(0, '#2b2f3a')
    g.addColorStop(1, '#0d0f14')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    // Grid line (half of it on each neighbouring tile), then a faint bevel.
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 14
    ctx.strokeRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 4
    ctx.strokeRect(9, 9, size - 18, size - 18)
    ctx.font = `700 92px ${GAME_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('?', size / 2, size / 2 + 6)
    texture.needsUpdate = true
  }
  draw()
  // Redrawn once the game font is in (the first draw used the fallback font).
  fontReady.then(draw)
  return texture
}

function createLogoTexture(app, size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  drawAppLogo(canvas.getContext('2d'), app, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}

/** Writes tile i's matrix: flat at rest, or part-way through its flip (0..1). */
function placeTile(mesh, b, k, progress) {
  const i = b.start + k
  const s = b.cell * TILE_FILL
  _obj.position.set(tileX(b, k), Y_TILE, tileZ(b, k))
  if (progress < 0) {
    _obj.rotation.set(0, 0, 0)
    _obj.scale.set(s, 1, s)
  } else if (progress >= 1) {
    _obj.rotation.set(0, 0, 0)
    _obj.scale.set(0, 0, 0)
  } else {
    // Lifts, turns over towards the camera and shrinks away at the end.
    const angle = progress * Math.PI
    const shrink = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3
    _obj.position.y += Math.sin(angle) * b.cell * 0.6
    _obj.rotation.set(-angle, 0, 0)
    _obj.scale.set(s * shrink, 1, s * shrink)
  }
  _obj.updateMatrix()
  mesh.setMatrixAt(i, _obj.matrix)
}

export function Boards() {
  const tilesRef = useRef(null)
  /** 1 = covered, 0 = open, per tile instance. */
  const covered = useMemo(() => new Uint8Array(TOTAL_TILES).fill(1), [])
  /** Flip animations in flight: a fixed pool sized to the tile count (never grows). */
  const flips = useMemo(() => createFlipPool(TOTAL_TILES), [])
  const clock = useRef(0)

  const res = useDisposable(
    () => ({
      tile: flatPlane(1, 1),
      tileTex: createTileTexture(),
      plate: new BoxGeometry(1, PLATE_H, 1),
      rimMaterial: new MeshLambertMaterial({ color: '#ffffff' }),
      bedMaterial: new MeshLambertMaterial({ color: '#08090c' }),
    }),
    [],
  )
  const tileMaterial = useDisposable(
    () => new MeshBasicMaterial({ map: res.tileTex, side: DoubleSide }),
    [res.tileTex],
  )

  const rims = useMemo(
    () => BOARDS.map((b) => ({ p: [b.x, Y_RIM, b.z], s: [SIZE + RIM * 2, 1, SIZE + RIM * 2], c: SEAT_RIM[b.seat] })),
    [],
  )
  const beds = useMemo(() => BOARDS.map((b) => ({ p: [b.x, Y_BED, b.z], s: [SIZE, 1, SIZE] })), [])

  // Every tile flat and covered to begin with.
  useLayoutEffect(() => {
    const mesh = tilesRef.current
    if (!mesh) return
    for (const b of BOARDS) {
      for (let k = 0; k < b.n * b.n; k += 1) {
        placeTile(mesh, b, k, -1)
        mesh.setColorAt(b.start + k, WHITE)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [])

  // Table updates open (or, after a reset, cover again) tiles. A subscription, not a
  // selector: no React render, and this runs only when a table changes.
  useEffect(() => {
    const apply = (tables) => {
      const mesh = tilesRef.current
      if (!mesh) return
      const mine = useGame.getState().match?.table
      let changed = false
      let flippedHere = false
      for (const b of BOARDS) {
        const mask = tables[b.table]?.rev?.[b.seat] || ''
        for (let k = 0; k < b.n * b.n; k += 1) {
          const i = b.start + k
          const open = isOpen(mask, k)
          if (open && covered[i]) {
            covered[i] = 0
            flips.start(i, clock.current)
            if (b.table === mine) flippedHere = true
          } else if (!open && !covered[i]) {
            covered[i] = 1
            flips.stop(i)
            placeTile(mesh, b, k, -1)
            changed = true
          }
        }
      }
      if (changed) mesh.instanceMatrix.needsUpdate = true
      if (flippedHere) sfx.flip()
    }
    apply(useGame.getState().tables)
    return useGame.subscribe((state, prev) => {
      if (state.tables !== prev.tables) apply(state.tables)
    })
  }, [covered, flips])

  useFrame((_state, delta) => {
    clock.current += delta
    if (flips.count === 0) return
    const mesh = tilesRef.current
    if (!mesh) return
    // Backwards, so finishing (swap-removing) one never skips another.
    for (let n = flips.count - 1; n >= 0; n -= 1) {
      const i = flips.list[n]
      const b = boardForInstance(i)
      const progress = (clock.current - flips.startAt[i]) / FLIP_SECONDS
      placeTile(mesh, b, i - b.start, progress)
      if (progress >= 1) flips.stop(i)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <Plates geometry={res.plate} material={res.rimMaterial} items={rims} />
      <Plates geometry={res.plate} material={res.bedMaterial} items={beds} />
      <instancedMesh ref={tilesRef} args={[res.tile, tileMaterial, TOTAL_TILES]} frustumCulled={false} />
      <LocalBoards tilesRef={tilesRef} covered={covered} />
    </>
  )
}

/**
 * Tiles mid-flip, without allocating: `list[0..count)` holds instance indices,
 * `slot[i]` where i sits in the list (-1 = not flipping), `startAt[i]` its start time.
 */
function createFlipPool(size) {
  const pool = {
    count: 0,
    list: new Int32Array(size),
    slot: new Int32Array(size).fill(-1),
    startAt: new Float32Array(size),
    start(i, t) {
      pool.startAt[i] = t
      if (pool.slot[i] >= 0) return
      pool.slot[i] = pool.count
      pool.list[pool.count] = i
      pool.count += 1
    },
    stop(i) {
      const at = pool.slot[i]
      if (at < 0) return
      const last = pool.list[pool.count - 1]
      pool.list[at] = last
      pool.slot[last] = at
      pool.slot[i] = -1
      pool.count -= 1
    },
  }
  return pool
}

/** Board that owns instance i (boards are stored in instance order). */
function boardForInstance(i) {
  let lo = 0
  let hi = BOARDS.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (BOARDS[mid].start <= i) lo = mid
    else hi = mid - 1
  }
  return BOARDS[lo]
}

const _plateObj = new Object3D()
const _plateColor = new Color()

/** One instanced box per board (scaled flat), optionally tinted per instance. */
function Plates({ geometry, material, items }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((it, i) => {
      _plateObj.position.set(it.p[0], it.p[1], it.p[2])
      _plateObj.scale.set(it.s[0], it.s[1], it.s[2])
      _plateObj.updateMatrix()
      mesh.setMatrixAt(i, _plateObj.matrix)
      if (it.c) mesh.setColorAt(i, _plateColor.set(it.c))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} receiveShadow />
}

/**
 * The player's own table: the logos under the tiles (theirs under your board, yours
 * under theirs) and, on your turn, the invisible pad that turns taps into flips.
 */
function LocalBoards({ tilesRef, covered }) {
  const match = useGame((s) => s.match)
  const { dpr } = useSettings()
  // LOW (dpr 1) gets 256 px logos; the mobile texture budget is 512.
  const texSize = dpr === 1 ? 256 : 512
  const playing = match && (match.phase === 'choosing' || match.phase === 'guessing' || match.phase === 'ended')
  if (!playing) return null

  const mine = boardOf(match.table, match.seat)
  const theirs = boardOf(match.table, 1 - match.seat)
  const canFlip = match.phase === 'guessing' && match.myTurn && !match.flipped

  return (
    <>
      {/* Your board hides their app; their board hides yours. */}
      <LogoPlane board={mine} appId={match.theirApp} size={texSize} />
      <LogoPlane board={theirs} appId={match.myApp} size={texSize} />
      {canFlip && <FlipPad board={mine} tilesRef={tilesRef} covered={covered} />}
    </>
  )
}

function LogoPlane({ board, appId, size }) {
  const app = appById(appId)
  const geometry = useDisposable(() => flatPlane(SIZE, SIZE), [])
  const material = useDisposable(
    () => (app ? new MeshBasicMaterial({ map: createLogoTexture(app, size) }) : null),
    [app, size],
  )
  // The material owns its map: free both when the app changes or the duel ends.
  useEffect(() => () => material?.map?.dispose(), [material])
  if (!material) return null
  return <mesh geometry={geometry} material={material} position={[board.x, Y_LOGO, board.z]} />
}

/**
 * An invisible plane over your board while you may flip: maps the pointer to a tile,
 * highlights it, and sends the flip on tap/click. Cheaper and more exact than
 * raycasting the plaza-wide tile mesh.
 */
function FlipPad({ board, tilesRef, covered }) {
  const hovered = useRef(-1)
  const geometry = useDisposable(() => flatPlane(SIZE, SIZE), [])
  // visible:false draws nothing (no draw call) but still takes pointer events.
  const material = useDisposable(() => new MeshBasicMaterial({ visible: false }), [])

  const tileAt = (point) => {
    const c = Math.floor((board.x + SIZE / 2 - point.x) / board.cell)
    const r = Math.floor((board.z + SIZE / 2 - point.z) / board.cell)
    if (c < 0 || r < 0 || c >= board.n || r >= board.n) return -1
    const k = r * board.n + c
    return covered[board.start + k] ? k : -1
  }

  const highlight = (k) => {
    const mesh = tilesRef.current
    if (!mesh || k === hovered.current) return
    if (hovered.current >= 0) mesh.setColorAt(board.start + hovered.current, WHITE)
    if (k >= 0) mesh.setColorAt(board.start + k, HOVER)
    hovered.current = k
    mesh.instanceColor.needsUpdate = true
    document.body.style.cursor = k >= 0 ? 'pointer' : ''
  }

  // Leaving the pad (turn over) clears the highlight.
  useEffect(() => () => highlight(-1), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[board.x, Y_TILE + 0.002, board.z]}
      onPointerMove={(e) => {
        e.stopPropagation()
        highlight(tileAt(e.point))
      }}
      onPointerOut={() => highlight(-1)}
      onClick={(e) => {
        e.stopPropagation()
        const k = tileAt(e.point)
        if (k < 0) return
        highlight(-1)
        send({ t: 'flip', i: k })
      }}
    />
  )
}

export default Boards
