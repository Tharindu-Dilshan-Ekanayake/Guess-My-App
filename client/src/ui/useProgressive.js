import { useEffect, useRef, useState } from 'react'

/**
 * Renders a long list a page at a time: the first `step` items, then another page
 * whenever the sentinel (put it after the list) scrolls near view. With ~380 app
 * cards, mounting them all at once took ~1 s on a slow phone; a page is instant.
 *
 * `resetKey` (e.g. the search text and tab) starts again from the first page when
 * it changes. Pass the sentinel ref to an element at the end of the list.
 */
export function useProgressive(items, resetKey, step = 30) {
  const [state, setState] = useState({ key: resetKey, count: step })
  const count = state.key === resetKey ? state.count : step
  const sentinel = useRef(null)
  const more = count < items.length

  useEffect(() => {
    const el = sentinel.current
    if (!el || !more) return undefined
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setState({ key: resetKey, count: count + step })
      },
      // Load the next page a little before the end is reached.
      { root: el.closest('.game-scroll'), rootMargin: '400px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [count, more, resetKey, step])

  return { visible: more ? items.slice(0, count) : items, sentinel, more }
}

export default useProgressive
