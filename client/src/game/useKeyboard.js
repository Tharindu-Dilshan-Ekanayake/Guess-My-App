import { useEffect, useRef } from 'react'

/**
 * Keyboard state in a ref, deliberately *not* React state.
 *
 * Movement is read every frame inside `useFrame`; routing keydown/keyup through
 * React state would re-render the whole scene 60x a second for no benefit.
 */
const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
}

/**
 * True while the player is typing in a text field (the app search boxes): game keys
 * must then neither move the avatar nor swallow the letters (W, A, S, D, E…).
 */
export function isTyping(e) {
  const el = e.target
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
}

export function useKeyboard() {
  const keys = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  })

  useEffect(() => {
    const set = (code, value) => {
      const action = KEY_MAP[code]
      if (action) keys.current[action] = value
    }

    const onKeyDown = (e) => {
      if (isTyping(e)) return
      if (KEY_MAP[e.code]) e.preventDefault() // stop Space scrolling the page
      set(e.code, true)
    }
    const onKeyUp = (e) => set(e.code, false)
    // Alt-tabbing away mid-run otherwise leaves a key stuck down.
    const onBlur = () => {
      for (const action of Object.keys(keys.current)) keys.current[action] = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return keys
}

export default useKeyboard
