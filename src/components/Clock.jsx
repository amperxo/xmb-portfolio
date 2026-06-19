import { useEffect, useState } from 'react'

export default function Clock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 10)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = now.toLocaleDateString([], { day: '2-digit', month: '2-digit' })

  return (
    <div className="xmb-clock">
      <span className="xmb-date">{date}</span>
      <span className="xmb-time">{time}</span>
    </div>
  )
}
