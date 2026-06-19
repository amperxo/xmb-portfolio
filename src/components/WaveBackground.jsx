import { useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
// PS3 XMB-inspired generative wave.
//
// Renderer: Canvas API (2D) — chosen to stay dependency-free and because the
// XMB "wave" is a shaded ribbon of light, not a polygonal mesh. Depth comes
// from a pseudo-3D projection of stacked bezier strands plus slope-based
// lighting, which reads as 3D while staying cheap enough for a locked 60 FPS.
//
// Pieces:
//   1. Central ribbon  — stacked cubic-bezier paths (Catmull-Rom -> bezier)
//                         whose control points morph with layered noise.
//   2. Background      — vertical gradient tinted by month AND local time of
//                         day (dawn / day / dusk / night).
//   3. Particles       — ambient rising motes emitted continuously.
//
// Fully self-running: no pointer / device input — it just plays.
// ---------------------------------------------------------------------------

// A 12-stop palette (originally the PS3 XMB's per-month tints). The background
// now drifts continuously through these rather than picking one by the month.
// [topColor, bottomColor] as [h, s, l].
const PALETTE = [
  [[210, 70, 18], [225, 80, 6]], // Jan — deep winter blue
  [[330, 55, 18], [300, 60, 6]], // Feb — rose / purple
  [[150, 50, 16], [170, 60, 6]], // Mar — spring green
  [[120, 45, 16], [140, 55, 6]], // Apr — fresh green
  [[90, 45, 16], [110, 55, 6]],  // May — lime
  [[160, 55, 16], [185, 65, 6]], // Jun — teal / sea green
  [[195, 65, 16], [210, 75, 6]], // Jul — sky
  [[35, 60, 18], [20, 65, 6]],   // Aug — warm amber
  [[25, 55, 18], [10, 60, 6]],   // Sep — autumn orange
  [[20, 50, 16], [350, 55, 6]],  // Oct — rust
  [[260, 45, 16], [240, 55, 6]], // Nov — violet dusk
  [[205, 60, 18], [220, 75, 6]], // Dec — icy blue
]

const TAU = Math.PI * 2
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a, b, t) => a + (b - a) * t
const smoothstep = (x) => x * x * (3 - 2 * x)

// Seconds each palette entry holds before it has fully crossfaded to the next.
// One full loop through all 12 = SECONDS_PER_STOP * 12.
const SECONDS_PER_STOP = 16

// Interpolate hue along the shortest path so we never sweep through off-colors.
const lerpHue = (a, b, t) => a + (((b - a + 540) % 360) - 180) * t
const lerpColor = (c1, c2, t) => [
  lerpHue(c1[0], c2[0], t),
  lerp(c1[1], c2[1], t),
  lerp(c1[2], c2[2], t),
]

// Blend the whole palette into the current top/bottom colors for a given time.
const paletteAt = (secs) => {
  const cyc = secs / SECONDS_PER_STOP
  const i = Math.floor(cyc) % PALETTE.length
  const j = (i + 1) % PALETTE.length
  const f = smoothstep(cyc - Math.floor(cyc))
  return [
    lerpColor(PALETTE[i][0], PALETTE[j][0], f), // top
    lerpColor(PALETTE[i][1], PALETTE[j][1], f), // bottom
  ]
}

// Time-of-day shaping: returns multipliers/shifts applied to the month theme.
// dayFrac in [0,1) (0 = midnight). Smoothly cycles night -> dawn -> day -> dusk.
function timeOfDay(dayFrac) {
  // A soft "sun elevation" curve: peaks ~13:00, troughs ~01:00.
  const sun = Math.sin((dayFrac - 0.25) * TAU) // -1 at ~00:00, +1 at ~12:00
  const elev = (sun + 1) / 2 // 0..1
  // Warmth spikes near sunrise (~0.27) and sunset (~0.78).
  const warmth =
    Math.exp(-((dayFrac - 0.27) ** 2) / 0.0009) +
    Math.exp(-((dayFrac - 0.78) ** 2) / 0.0009)
  return {
    lightMul: lerp(0.55, 1.35, elev),    // dim at night, bright midday
    satMul: lerp(0.8, 1.1, elev),
    hueShift: clamp(warmth, 0, 1) * -28,  // pull toward warm/orange at golden hour
    glow: lerp(0.25, 0.7, elev),
  }
}

export default function WaveBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    let raf
    let w = 0
    let h = 0
    let dpr = 1
    let last = performance.now()
    const mountedAt = last // intro timeline starts the moment we mount

    // Eased ramp from 0→1 as x crosses [a,b]; used to stage the intro reveal.
    const ramp = (x, a, b) => smoothstep(clamp((x - a) / (b - a), 0, 1))

    // ---- the central ribbon --------------------------------------------
    // Each strand is a horizontal cubic-bezier path; stacking + projection
    // gives the ribbon volume. Control-point heights morph every frame.
    const COLS = 14            // control points across the width
    const STRANDS = 9          // stacked strands forming ribbon thickness
    const pts = new Float32Array(COLS) // reused scratch buffer per strand

    // Generative wave: superposed sines with slowly drifting parameters so the
    // shape never exactly repeats. Returns vertical offset for a given u in
    // [0,1] across the screen, at time t (seconds) and strand depth d.
    const wave = (u, t, d) => {
      const a = Math.sin(u * 6.0 + t * 0.6 + d * 0.4) * 34
      const b = Math.sin(u * 2.3 - t * 0.35 + d * 0.9) * 22
      const c = Math.sin(u * 11.0 + t * 1.1) * 9
      return a + b + c
    }

    // Catmull-Rom -> cubic bezier so control points morph as smooth bezier
    // curves (the requirement) instead of polylines.
    const strokeRibbonStrand = (yArr, baseX, stepX, fill) => {
      ctx.beginPath()
      ctx.moveTo(baseX, yArr[0])
      for (let i = 0; i < COLS - 1; i++) {
        const x0 = baseX + i * stepX
        const x1 = baseX + (i + 1) * stepX
        const yPrev = yArr[i === 0 ? 0 : i - 1]
        const y0 = yArr[i]
        const y1 = yArr[i + 1]
        const yNext = yArr[i + 2 > COLS - 1 ? COLS - 1 : i + 2]
        const c1x = x0 + stepX / 3
        const c1y = y0 + (y1 - yPrev) / 6
        const c2x = x1 - stepX / 3
        const c2y = y1 - (yNext - y0) / 6
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1)
      }
      if (fill) {
        ctx.lineTo(baseX + (COLS - 1) * stepX, h)
        ctx.lineTo(baseX, h)
        ctx.closePath()
      }
    }

    // ---- ambient particle emitter --------------------------------------
    let motes = []
    const seedMotes = () => {
      const count = Math.round(clamp(w / 28, 18, 46))
      motes = Array.from({ length: count }, () => spawnMote(true))
    }
    const spawnMote = (anywhere) => ({
      x: Math.random(),
      y: anywhere ? Math.random() : 1.04,
      r: Math.random() * 1.8 + 0.4,
      spd: Math.random() * 0.05 + 0.02, // screen-heights per second
      drift: (Math.random() - 0.5) * 0.6,
      a: Math.random() * 0.4 + 0.12,
      tw: Math.random() * TAU, // twinkle phase
    })

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seedMotes()
    }

    const hsl = (hh, s, l, a = 1) =>
      `hsla(${((hh % 360) + 360) % 360}, ${clamp(s, 0, 100)}%, ${clamp(l, 0, 100)}%, ${a})`

    const draw = (now) => {
      // Delta time keeps motion frame-rate independent -> steady 60 FPS feel
      // even if a frame is dropped. Clamp guards against tab-switch jumps.
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = reduceMotion ? 0 : now / 1000

      // ---- slowly cycling, time-of-day tinted gradient ----
      const [topBase, bottomBase] = paletteAt(t)
      const d = new Date()
      const dayFrac = (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400
      const tod = timeOfDay(dayFrac)
      const tH = topBase[0] + tod.hueShift
      const tS = topBase[1] * tod.satMul
      const tL = topBase[2] * tod.lightMul
      const bH = bottomBase[0] + tod.hueShift
      const bS = bottomBase[1] * tod.satMul
      const bL = bottomBase[2] * tod.lightMul

      // ---- intro reveal: black → ribbon glows in → background fills ----
      const since = (now - mountedAt) / 1000
      const ribbonReveal = reduceMotion ? 1 : ramp(since, 0.2, 2.4)
      const bgReveal = reduceMotion ? 1 : ramp(since, 1.8, 4.2)
      // The ribbon blooms in white/milky, then takes on its color as the
      // background arrives: 0 = milky white, 1 = full color.
      const colorize = reduceMotion ? 1 : ramp(since, 2.0, 4.8)
      const milky = (1 - colorize) * 22 // lightness boost while still white

      // Black base every frame; each stage fades up over it.
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)

      // Background gradient (held back until the ribbon has emerged).
      ctx.globalAlpha = bgReveal
      const g = ctx.createLinearGradient(0, 0, w * 0.5, h)
      g.addColorStop(0, hsl(tH, tS, tL))
      g.addColorStop(1, hsl(bH, bS, bL))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      // Soft "sun" glow whose position tracks time of day across the sky.
      const sunX = w * lerp(0.1, 0.9, dayFrac)
      const sunY = h * lerp(0.05, 0.45, 1 - Math.sin(dayFrac * Math.PI))
      const rg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 1.2)
      rg.addColorStop(0, hsl(tH, tS + 6, tL + 16, tod.glow))
      rg.addColorStop(1, hsl(tH, tS, tL, 0))
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, w, h)

      // Darken the bottom-left corner toward black (opposite the sun glow).
      const vg = ctx.createRadialGradient(0, h, 0, 0, h, Math.max(w, h) * 0.85)
      vg.addColorStop(0, 'rgba(0, 0, 0, 0.6)')
      vg.addColorStop(0.6, 'rgba(0, 0, 0, 0.28)')
      vg.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1

      // ---- central ribbon ----
      const centerY = h * 0.52
      const baseX = -w * 0.06
      const stepX = (w * 1.12) / (COLS - 1)

      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = ribbonReveal // ribbon is the first thing to surface
      // Soft focus: a light blur over the whole ribbon so edges feather into
      // the background instead of cutting a hard silhouette.
      ctx.filter = 'blur(2.5px)'
      // Back-to-front so nearer strands overlay farther ones (depth cue).
      for (let s = STRANDS - 1; s >= 0; s--) {
        const depth = s / (STRANDS - 1)        // 0 = front, 1 = back
        const sway = (depth - 0.5) * 46         // vertical spread = thickness
        const scale = lerp(1, 0.82, depth)      // perspective: back strands flatter
        for (let i = 0; i < COLS; i++) {
          const u = i / (COLS - 1)
          pts[i] = centerY + sway + wave(u, t + depth * 0.5, s) * scale
        }
        strokeRibbonStrand(pts, baseX, stepX, true)

        // Lighting: front strands brightest, slight hue sweep across depth.
        const crest = pts[Math.floor(COLS / 2)]
        // Feathered gradient: the bright band fades in gradually rather than
        // peaking right at the strand's top edge, which kept the line crisp.
        const lg = ctx.createLinearGradient(0, crest - 90, 0, crest + 150)
        const hue = tH + 40 + depth * 30
        const li = lerp(60, 22, depth)
        const al = lerp(0.13, 0.035, depth)
        lg.addColorStop(0, hsl(hue, 50 * colorize, li + 14 + milky, 0))
        lg.addColorStop(0.28, hsl(hue, 52 * colorize, li + 10 + milky, al * 1.3))
        lg.addColorStop(0.55, hsl(hue, 55 * colorize, li + milky, al * 0.8))
        lg.addColorStop(1, hsl(hue, 55 * colorize, li - 10 + milky, 0))
        ctx.fillStyle = lg
        ctx.fill()
      }

      // Bright crest highlight — the signature XMB sheen line.
      for (let i = 0; i < COLS; i++) {
        const u = i / (COLS - 1)
        pts[i] = centerY - 18 + wave(u, t, 0)
      }
      strokeRibbonStrand(pts, baseX, stepX, false)
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = hsl(tH + 40, 40 * colorize, 92, 0.35 * tod.glow + 0.1)
      ctx.shadowColor = hsl(tH + 40, 60 * colorize, 80 + milky * 0.4, 0.5)
      ctx.shadowBlur = 24
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.filter = 'none'

      // ---- ambient particles ---- (join in with the background)
      ctx.globalAlpha = bgReveal
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i]
        m.y -= m.spd * dt
        m.tw += dt * 2
        if (m.y < -0.04) Object.assign(m, spawnMote(false))
        const px = (m.x + Math.sin(t * 0.3 + m.y * 6) * 0.012 + m.drift * (1 - m.y) * 0.04) * w
        const py = m.y * h
        const twinkle = 0.6 + Math.sin(m.tw) * 0.4
        ctx.beginPath()
        ctx.arc(px, py, m.r, 0, TAU)
        ctx.fillStyle = hsl(tH, tS - 18, 92, m.a * twinkle * (0.4 + tod.glow))
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="wave-canvas" />
}
