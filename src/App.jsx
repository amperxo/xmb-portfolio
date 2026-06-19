import { useState } from 'react'
import BootSequence from './components/BootSequence.jsx'
import Xmb from './components/Xmb.jsx'

export default function App() {
  const [booted, setBooted] = useState(false)
  return booted ? <Xmb /> : <BootSequence onComplete={() => setBooted(true)} />
}
