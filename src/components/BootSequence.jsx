import { useEffect, useState } from 'react'
import { boot } from '../config.js'

// Stylised cold-boot: black → configured wordmark → fade out into the XMB.
export default function BootSequence({ onComplete }) {
  const [phase, setPhase] = useState('intro') // intro → title → out

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('title'), 700)
    const t2 = setTimeout(() => setPhase('out'), 3300)
    const t3 = setTimeout(() => onComplete(), 4300)
    return () => [t1, t2, t3].forEach(clearTimeout)
  }, [onComplete])

  return (
    <div className={`boot boot--${phase}`} onClick={onComplete}>
      <div className="boot-title">
        <span className="boot-brand">{boot.wordmark}</span>
      </div>
      <div className="boot-skip">click to skip</div>
    </div>
  )
}
