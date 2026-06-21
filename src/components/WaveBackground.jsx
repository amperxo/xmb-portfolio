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
//   3. Sparkles        — ambient motes that cling to the ribbon and twinkle
//                         in place (no drift), like light catching the wave.
//
// Fully self-running: no pointer / device input — it just plays.
// ---------------------------------------------------------------------------

// A 12-stop palette (originally the PS3 XMB's per-month tints). The background
// now drifts continuously through these rather than picking one by the month.
// [topColor, bottomColor] as [h, s, l].
// Brighter, more saturated take on the XMB monthly tints (these are tuned by
// eye, not extracted official values). Top stop is vivid; bottom stays deep so
// the gradient keeps the XMB sense of depth instead of going flat.
export const PALETTE = [
  [[210, 85, 32], [225, 90, 12]], // Jan — winter blue
  [[330, 78, 34], [300, 78, 12]], // Feb — rose / purple
  [[150, 72, 32], [170, 78, 12]], // Mar — spring green
  [[120, 68, 32], [140, 72, 12]], // Apr — fresh green
  [[85, 72, 34], [105, 72, 12]],  // May — lime
  [[175, 78, 32], [190, 82, 12]], // Jun — teal / sea green
  [[200, 88, 34], [212, 90, 13]], // Jul — sky
  [[40, 92, 36], [22, 92, 13]],   // Aug — warm amber
  [[26, 88, 34], [8, 86, 12]],    // Sep — autumn orange
  [[14, 82, 32], [350, 74, 12]],  // Oct — rust
  [[272, 70, 34], [245, 74, 12]], // Nov — violet dusk
  [[195, 84, 36], [215, 88, 14]], // Dec — icy blue
]

// Friendly names for each palette stop, used by the color switcher UI.
export const THEME_NAMES = [
  'Winter Blue', 'Rose', 'Spring Green', 'Fresh Green', 'Lime', 'Sea Green',
  'Sky', 'Amber', 'Orange', 'Rust', 'Violet', 'Icy Blue',
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

export default function WaveBackground({ colorIndex = null }) {
  const canvasRef = useRef(null)
  // Read inside the rAF loop without restarting it. null = auto-cycle through
  // the palette; a number locks the wave to that single stop (cross-faded).
  const colorIndexRef = useRef(colorIndex)
  useEffect(() => {
    colorIndexRef.current = colorIndex
  }, [colorIndex])

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

    // Smoothed current top/bottom colors so switching themes cross-fades
    // instead of snapping. Seeded lazily on the first frame.
    let curTop = null
    let curBottom = null

    // Time-of-day only shifts perceptibly over minutes, so there's no point
    // allocating a Date and recomputing the sun curve 60x/sec. Recompute at
    // most ~1x/sec and cache the result for the frames in between.
    let todCacheAt = -Infinity
    let dayFrac = 0
    let tod = timeOfDay(0)

    // Eased ramp from 0→1 as x crosses [a,b]; used to stage the intro reveal.
    const ramp = (x, a, b) => smoothstep(clamp((x - a) / (b - a), 0, 1))

    // ---- the central ribbon --------------------------------------------
    // The wave is a band of thin parallel filaments of light (XMB-style): each
    // is a horizontal cubic-bezier stroke; stacked with offset phases and drawn
    // additively they weave into a glowing ribbon. Heights morph every frame.
    const COLS = 14            // control points across the width
    const FILAMENTS = 150      // thin light strands forming the band (dense
                               // enough that stretched regions don't show gaps)
    const BAND_H = 104         // vertical thickness the filaments spread across
    const pts = new Float32Array(COLS) // reused scratch buffer per strand

    // Generative wave: superposed sines with slowly drifting parameters so the
    // shape never exactly repeats. Returns vertical offset for a given u in
    // [0,1] across the screen, at time t (seconds) and strand depth d.
    //
    // The dominant term is a STANDING swell: sin(k·u) sets the crest/trough
    // shape across the screen, and cos(ω·t) makes those crests heave up and
    // down *in place* — so the ribbon undulates like water rather than sliding
    // sideways. A small traveling term rolls through underneath for life and
    // to break the perfect symmetry; fine chop rides on top.
    const wave = (u, t, d) => {
      const a = Math.sin(u * 5.0 + d * 0.4) * Math.cos(t * 0.9 + d * 0.5) * 42
      const b = Math.sin(u * 3.0 - t * 0.6 + d * 0.9) * 18
      const c = Math.sin(u * 11.0 + t * 1.1 + d * 0.3) * 10
      return a + b + c
    }

    // Catmull-Rom -> cubic bezier so control points morph as smooth bezier
    // curves (the requirement) instead of polylines.
    const strokeRibbonStrand = (yArr, baseX, stepX, fill, c = ctx) => {
      c.beginPath()
      c.moveTo(baseX, yArr[0])
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
        c.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1)
      }
      if (fill) {
        c.lineTo(baseX + (COLS - 1) * stepX, h)
        c.lineTo(baseX, h)
        c.closePath()
      }
    }

    // ---- ambient sparkles ----------------------------------------------
    // The XMB motes don't stream across the screen — they cling to the wave
    // and twinkle in place, like flecks of light catching the ribbon. Each
    // sparkle has a fixed home along the ribbon (u across, band into its
    // thickness) and pulses its brightness on its own little clock.
    let motes = []
    const seedMotes = () => {
      const count = Math.round(clamp(w / 2.2, 300, 700))
      motes = Array.from({ length: count }, () => spawnMote())
    }
    const spawnMote = () => ({
      u: Math.random(),                       // position along the ribbon
      // Gaussian-ish: dense on the ribbon, thinning into a halo around it.
      // Tighter spread -> the bulk clusters right on the ribbon.
      band: (Math.random() + Math.random() + Math.random() - 1.5) * 1.1,
      r: Math.random() * 1.5 + 0.5,
      drift: (Math.random() - 0.5) * 0.015,   // gentle horizontal shimmer speed
      tw: Math.random() * TAU,                // twinkle phase
      twSpd: Math.random() * 1.8 + 0.9,       // how fast it sparkles
      a: Math.random() * 0.5 + 0.3,           // peak brightness
    })

    // Pre-rendered sparkle sprite. Baking one soft glowing dot to an offscreen
    // canvas lets us stamp every sparkle with a cheap drawImage instead of an
    // arc + per-sparkle shadowBlur (which re-runs a blur convolution hundreds
    // of times per frame — the main source of lag). White core so it tints
    // correctly under the additive 'lighter' blend.
    const SPRITE = 64 // px; higher res keeps the hard core crisp when scaled
    const spriteCanvas = document.createElement('canvas')
    spriteCanvas.width = SPRITE
    spriteCanvas.height = SPRITE
    {
      const sc = spriteCanvas.getContext('2d')
      const c = SPRITE / 2
      // Soft outer halo first...
      const grd = sc.createRadialGradient(c, c, 0, c, c, c)
      grd.addColorStop(0, 'rgba(255,255,255,0.9)')
      grd.addColorStop(0.12, 'rgba(255,255,255,0.45)')
      grd.addColorStop(0.4, 'rgba(255,255,255,0.12)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      sc.fillStyle = grd
      sc.fillRect(0, 0, SPRITE, SPRITE)
      // ...then a small, hard, blown-out core stamped on top. This bright
      // point next to the soft halo is what reads as a sharp sparkle.
      const core = sc.createRadialGradient(c, c, 0, c, c, SPRITE * 0.09)
      core.addColorStop(0, 'rgba(255,255,255,1)')
      core.addColorStop(0.7, 'rgba(255,255,255,1)')
      core.addColorStop(1, 'rgba(255,255,255,0)')
      sc.fillStyle = core
      sc.fillRect(0, 0, SPRITE, SPRITE)
    }

    // Offscreen buffer for the filament band. The filaments are drawn here
    // sharp (no per-stroke filter), then blitted to the screen with a single
    // blur pass — one blur convolution per frame instead of one per strand.
    const ribbonCanvas = document.createElement('canvas')
    const rctx = ribbonCanvas.getContext('2d')

    // The bottom-left vignette never changes shape, so build it once per resize
    // instead of reallocating a gradient (and the garbage it makes) every frame.
    let vignette = null

    const resize = () => {
      // Cap DPR at 1.5: every full-screen blur/gradient cost scales with pixel
      // count, and the wave is blurred + the bg is smooth, so 1.5 vs 2 is
      // visually nil but ~44% cheaper to render.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ribbonCanvas.width = canvas.width
      ribbonCanvas.height = canvas.height
      rctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      vignette = ctx.createRadialGradient(0, h, 0, 0, h, Math.max(w, h) * 0.85)
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0.6)')
      vignette.addColorStop(0.6, 'rgba(0, 0, 0, 0.28)')
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0)')
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
      // Target colors: auto-cycle through the palette, or lock to one stop when
      // the switcher has picked a color. Either way we ease toward the target
      // so theme changes cross-fade smoothly.
      const ci = colorIndexRef.current
      const [tgtTop, tgtBottom] =
        ci == null ? paletteAt(t) : [PALETTE[ci][0], PALETTE[ci][1]]
      if (!curTop) {
        curTop = tgtTop.slice()
        curBottom = tgtBottom.slice()
      }
      const k = clamp(dt * 2.5, 0, 1) // ~0.4s cross-fade
      curTop = lerpColor(curTop, tgtTop, k)
      curBottom = lerpColor(curBottom, tgtBottom, k)
      const topBase = curTop
      const bottomBase = curBottom
      if (now - todCacheAt >= 1000) {
        todCacheAt = now
        const d = new Date()
        dayFrac = (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400
        tod = timeOfDay(dayFrac)
      }
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
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1

      // ---- central ribbon ----
      const centerY = h * 0.52
      const baseX = -w * 0.06
      const stepX = (w * 1.12) / (COLS - 1)

      // The real XMB wave isn't a filled sheet — it's a band of many thin,
      // parallel filaments of light that undulate together with slightly
      // offset phases. Drawn additively, they pile into a glowing woven band
      // that's densest in the middle and frays softly at the top/bottom edges.
      // They're drawn SHARP onto an offscreen buffer here, then blitted to the
      // screen with one blur pass below (cheap) — blurring per-stroke tanks FPS.
      rctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      rctx.clearRect(0, 0, w, h)
      rctx.globalCompositeOperation = 'lighter'
      rctx.lineCap = 'round'
      rctx.lineJoin = 'round'
      for (let s = 0; s < FILAMENTS; s++) {
        const fd = s / (FILAMENTS - 1)          // 0 = top edge, 1 = bottom edge
        const off = (fd - 0.5) * BAND_H         // vertical place within the band
        const edge = 1 - Math.abs(fd - 0.5) * 2 // 1 at center, 0 at the frayed edges
        const scale = lerp(0.86, 1, edge)       // center strands swing a touch more
        // Per-filament phase so neighbours weave rather than move in lockstep.
        const phase = fd * 5.0
        for (let i = 0; i < COLS; i++) {
          const u = i / (COLS - 1)
          pts[i] = centerY + off + wave(u, t + phase * 0.12, phase) * scale
        }
        strokeRibbonStrand(pts, baseX, stepX, false, rctx)
        // Like the real XMB: the bright crest (edge≈1) washes out near-white,
        // while the body and frayed edges carry a pale, luminous tint of the
        // theme color — high saturation but kept light so it glows, not muddy.
        const hue = tH + 18
        const li = lerp(66, 94, edge)              // edges deeper, crest brightest
        const al = (0.028 + 0.095 * edge * edge) * (0.55 + 0.45 * colorize)
        rctx.lineWidth = lerp(0.8, 1.5, edge)
        rctx.strokeStyle = hsl(hue, lerp(85, 42, edge) * colorize, li + milky * 0.5, al)
        rctx.stroke()
      }

      // Single blurred composite of the whole band onto the scene. The buffer
      // is device-sized; drawing it at CSS size (w×h) keeps the blur in CSS px.
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = ribbonReveal // ribbon is the first thing to surface
      ctx.filter = 'blur(1.8px)'
      ctx.drawImage(ribbonCanvas, 0, 0, w, h)
      ctx.filter = 'none'

      // Bright crest highlight — the signature XMB sheen line (soft bloom).
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (let i = 0; i < COLS; i++) {
        const u = i / (COLS - 1)
        pts[i] = centerY - 18 + wave(u, t, 0)
      }
      strokeRibbonStrand(pts, baseX, stepX, false)
      ctx.lineWidth = 3
      ctx.strokeStyle = hsl(tH + 18, 38 * colorize, 93, 0.35 * tod.glow + 0.1)
      ctx.shadowColor = hsl(tH + 18, 60 * colorize, 80 + milky * 0.4, 0.5)
      ctx.shadowBlur = 24
      ctx.stroke()
      ctx.shadowBlur = 0

      // ---- glassy specular edge: a crisp, thin catch of light riding just
      // above the crest. The sharpness (almost no blur) next to the soft bloom
      // above is what sells "polished glass" vs. a glowing ribbon.
      ctx.filter = 'blur(0.6px)'
      for (let i = 0; i < COLS; i++) {
        const u = i / (COLS - 1)
        pts[i] = centerY - 27 + wave(u, t, 0)
      }
      strokeRibbonStrand(pts, baseX, stepX, false)
      ctx.lineWidth = 1.3
      ctx.strokeStyle = hsl(tH + 18, 22 * colorize, 99, 0.55 * tod.glow + 0.2)
      ctx.shadowColor = hsl(tH + 18, 45 * colorize, 96, 0.6)
      ctx.shadowBlur = 7
      ctx.stroke()
      ctx.shadowBlur = 0

      // ---- internal reflection: a fainter, blurrier band lower in the body,
      // like light refracting back through the glass.
      ctx.filter = 'blur(2.5px)'
      for (let i = 0; i < COLS; i++) {
        const u = i / (COLS - 1)
        pts[i] = centerY + 14 + wave(u, t, 0) * 0.82
      }
      strokeRibbonStrand(pts, baseX, stepX, false)
      ctx.lineWidth = 2.4
      ctx.strokeStyle = hsl(tH + 20, 55 * colorize, 86, 0.13 * tod.glow + 0.05)
      ctx.stroke()
      ctx.filter = 'none'

      // ---- ambient sparkles ---- (twinkle along the ribbon, no drift up)
      // Stamp the pre-baked sprite per sparkle — no arcs, no shadowBlur.
      ctx.globalCompositeOperation = 'lighter' // additive -> they read as light
      const glow = 0.4 + tod.glow
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i]
        m.tw += dt * m.twSpd
        m.u += m.drift * dt
        if (m.u > 1.02) m.u -= 1.04
        else if (m.u < -0.02) m.u += 1.04
        // Sharp-peaked pulse: dark most of the time, a quick bright sparkle.
        const s = Math.max(0, Math.sin(m.tw))
        const spark = s * s
        if (spark < 0.01) continue
        // Sit on the ribbon: the same wave the crest uses places them on it.
        const px = baseX + m.u * (w * 1.12)
        const py = centerY + m.band * 42 + wave(m.u, t, 0)
        // Sprite box scales with the dot's glow radius (~9x its core radius).
        const size = m.r * (0.7 + spark * 0.6) * 9
        ctx.globalAlpha = bgReveal * clamp(m.a * spark * glow, 0, 1)
        ctx.drawImage(spriteCanvas, px - size / 2, py - size / 2, size, size)
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
