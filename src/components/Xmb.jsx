import { useCallback, useEffect, useState } from 'react'
import { categories, profile, startCategory } from '../config.js'
import Icon from './Icon.jsx'
import BrandIcon from './BrandIcon.jsx'
import Clock from './Clock.jsx'
import WaveBackground, { PALETTE, THEME_NAMES } from './WaveBackground.jsx'

// Switcher cycles: auto (null) -> 0 -> 1 -> ... -> 11 -> auto.
const nextColor = (c) => (c == null ? 0 : c >= PALETTE.length - 1 ? null : c + 1)
// A vivid swatch from a palette top-color (the stored tints are dark).
const swatch = (i) => {
  const [hh, s] = PALETTE[i][0]
  return `hsl(${hh}, ${Math.min(s + 25, 90)}%, 52%)`
}

const CAT_SLOT = 200 // px width of each category column
const ITEM_H = 100   // px vertical spacing between item rows
// The selected item sits LIST_BELOW px under the category header; already-passed
// items (index < selected) jump above the header starting at LIST_ABOVE, so the
// header stays clear between the two groups.
const LIST_BELOW = 96
const LIST_ABOVE = -8

// Land on the configured category (fall back to the first column).
const START_INDEX = Math.max(0, categories.findIndex((c) => c.id === startCategory))

export default function Xmb() {
  const [catIndex, setCatIndex] = useState(START_INDEX)
  const [itemIndices, setItemIndices] = useState(() => categories.map(() => 0))
  const [opened, setOpened] = useState(null) // item object when detail is open
  const [colorIndex, setColorIndex] = useState(null) // null = auto-cycle

  const itemIndex = itemIndices[catIndex]
  const activeCat = categories[catIndex]

  const moveCat = useCallback((dir) => {
    setCatIndex((i) => Math.min(categories.length - 1, Math.max(0, i + dir)))
  }, [])

  const moveItem = useCallback(
    (dir) => {
      setItemIndices((arr) => {
        const cur = arr[catIndex]
        const max = categories[catIndex].items.length - 1
        const next = Math.min(max, Math.max(0, cur + dir))
        if (next === cur) return arr
        const copy = arr.slice()
        copy[catIndex] = next
        return copy
      })
    },
    [catIndex],
  )

  const openItem = useCallback(() => {
    setOpened(categories[catIndex].items[itemIndices[catIndex]])
  }, [catIndex, itemIndices])

  // ── Keyboard navigation ──
  useEffect(() => {
    const onKey = (e) => {
      if (opened) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key.toLowerCase() === 'q') {
          e.preventDefault()
          setOpened(null)
        }
        if (e.key === 'Enter' && opened.href) window.open(opened.href, '_blank', 'noopener')
        return
      }
      switch (e.key.length === 1 ? e.key.toLowerCase() : e.key) {
        case 'ArrowLeft': case 'a': e.preventDefault(); moveCat(-1); break
        case 'ArrowRight': case 'd': e.preventDefault(); moveCat(1); break
        case 'ArrowUp': case 'w': e.preventDefault(); moveItem(-1); break
        case 'ArrowDown': case 's': e.preventDefault(); moveItem(1); break
        case 'Enter': case ' ': e.preventDefault(); openItem(); break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opened, moveCat, moveItem, openItem])

  const barTransform = `translateX(calc(26vw - ${catIndex * CAT_SLOT}px))`

  return (
    <div className="xmb">
      <WaveBackground colorIndex={colorIndex} />

      <header className="xmb-top">
        <div className="xmb-id">
          <span className="xmb-name">{profile.name}</span>
          <span className="xmb-tag">{profile.tagline}</span>
        </div>
        <div className="xmb-top-right">
          <Clock />
        </div>
      </header>

      <div className="xmb-cross">
        <div className="xmb-bar" style={{ transform: barTransform }}>
          {categories.map((cat, ci) => {
            const active = ci === catIndex
            return (
              <div key={cat.id} className={`xmb-col ${active ? 'is-active' : ''}`}>
                <button
                  className="xmb-cat"
                  onClick={() => { active ? openItem() : setCatIndex(ci) }}
                >
                  <span className="xmb-cat-icon"><Icon name={cat.icon} /></span>
                  <span className="xmb-cat-label">{cat.label}</span>
                </button>

                {active && (
                  <ul className="xmb-items">
                    {cat.items.map((it, ii) => {
                      const rel = ii - itemIndex // <0 above header, 0 selected, >0 below
                      const sel = rel === 0
                      const dist = Math.abs(rel)
                      const y = rel >= 0 ? LIST_BELOW + rel * ITEM_H : LIST_ABOVE + rel * ITEM_H
                      return (
                        <li
                          key={it.id}
                          className={`xmb-item ${sel ? 'is-sel' : ''}`}
                          style={{
                            transform: `translateY(${y}px) scale(${sel ? 1.06 : 1})`,
                            opacity: sel ? 1 : Math.max(0.16, 0.66 - dist * 0.16),
                          }}
                          onClick={() => {
                            if (sel) openItem()
                            else {
                              setItemIndices((arr) => { const c = arr.slice(); c[ci] = ii; return c })
                            }
                          }}
                        >
                          {it.logo && (
                            <span className="xmb-item-logo"><BrandIcon name={it.logo} /></span>
                          )}
                          <span className="xmb-item-title">{it.title}</span>
                          {it.subtitle && <span className="xmb-item-sub">{it.subtitle}</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <button
        className="theme-switch"
        onClick={() => setColorIndex(nextColor)}
        title="Switch wave color"
      >
        <span
          className={`theme-swatch ${colorIndex == null ? 'is-auto' : ''}`}
          style={colorIndex == null ? undefined : { background: swatch(colorIndex) }}
        />
        <span className="theme-label">
          {colorIndex == null ? 'Auto' : THEME_NAMES[colorIndex]}
        </span>
      </button>

      {opened && (
        <div className="detail" onClick={() => setOpened(null)}>
          <div className="detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-head">
              <span className="detail-cat">{activeCat.label}</span>
              <button className="detail-close" onClick={() => setOpened(null)}>✕</button>
            </div>
            <h2 className="detail-title">
              {opened.logo && <BrandIcon name={opened.logo} size={26} />}
              {opened.title}
            </h2>
            {opened.subtitle && <div className="detail-sub">{opened.subtitle}</div>}
            <p className="detail-body">{opened.body}</p>
            {opened.href && (
              <a className="detail-link" href={opened.href} target="_blank" rel="noopener noreferrer">
                Open ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
