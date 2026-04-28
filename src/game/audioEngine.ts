// Web Audio API procedural sound engine — lazy-init on first user gesture

let ctx: AudioContext | null = null
let engineOsc: OscillatorNode | null = null
let engineGain: GainNode | null = null
let engineStarted = false
let muted = false

function getCtx(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    } catch { return null }
  }
  return ctx
}

export function resumeAudio() {
  const ac = getCtx()
  if (ac?.state === 'suspended') ac.resume()
}

export function setMuted(m: boolean) {
  muted = m
  if (m) stopEngine()
}

// ── Engine hum (continuous oscillator) ────────────────────────

export function startEngine() {
  if (engineStarted) return
  const ac = getCtx()
  if (!ac) return
  engineStarted = true

  const osc = ac.createOscillator()
  const gn  = ac.createGain()
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 400

  osc.type = 'sawtooth'
  osc.frequency.value = 75
  gn.gain.value = 0.025
  osc.connect(filter)
  filter.connect(gn)
  gn.connect(ac.destination)
  osc.start()
  engineOsc  = osc
  engineGain = gn
}

export function updateEngineSpeed(normalizedSpeed: number) {
  // 0 = idle (75 Hz), 1 = max (240 Hz)
  if (!engineOsc || !engineGain) return
  const ac = getCtx()
  if (!ac) return
  engineOsc.frequency.setTargetAtTime(75 + normalizedSpeed * 165, ac.currentTime, 0.15)
  engineGain.gain.setTargetAtTime(0.018 + normalizedSpeed * 0.022, ac.currentTime, 0.15)
}

export function stopEngine() {
  try { engineOsc?.stop() } catch { /* ignore */ }
  engineOsc = null
  engineGain = null
  engineStarted = false
}

// ── One-shot sounds ────────────────────────────────────────────

export function playCoin() {
  const ac = getCtx(); if (!ac) return
  const now = ac.currentTime
  oneShot(ac, 'sine', 880, 1320, 0.14, 0, 0.18)
  // Harmony note
  oneShot(ac, 'sine', 1100, 1650, 0.06, 0.04, 0.14)
}

export function playFuel() {
  const ac = getCtx(); if (!ac) return
  oneShot(ac, 'sine', 440, 660, 0.10, 0, 0.25)
  oneShot(ac, 'sine', 550, 825, 0.05, 0.06, 0.18)
}

export function playNitro() {
  const ac = getCtx(); if (!ac) return
  const now = ac.currentTime
  const osc = ac.createOscillator()
  const gn  = ac.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(200, now)
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.35)
  gn.gain.setValueAtTime(0.09, now)
  gn.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
  osc.connect(gn); gn.connect(ac.destination)
  osc.start(now); osc.stop(now + 0.55)
}

export function playCrash(hard: boolean) {
  const ac = getCtx(); if (!ac) return
  const duration = hard ? 0.45 : 0.28
  const len = Math.floor(ac.sampleRate * duration)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5)

  const src = ac.createBufferSource()
  src.buffer = buf
  const gn = ac.createGain()
  gn.gain.value = hard ? 0.22 : 0.13
  src.connect(gn); gn.connect(ac.destination)
  src.start()

  // Pitch drop accompanying tone
  if (hard) {
    const now = ac.currentTime
    const osc = ac.createOscillator()
    const og  = ac.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(180, now)
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.5)
    og.gain.setValueAtTime(0.08, now)
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc.connect(og); og.connect(ac.destination)
    osc.start(now); osc.stop(now + 0.5)
  }
}

export function playOilSkid() {
  const ac = getCtx(); if (!ac) return
  const now = ac.currentTime
  const osc = ac.createOscillator()
  const gn  = ac.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(320, now)
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.6)
  gn.gain.setValueAtTime(0.07, now)
  gn.gain.exponentialRampToValueAtTime(0.001, now + 0.7)
  osc.connect(gn); gn.connect(ac.destination)
  osc.start(now); osc.stop(now + 0.7)
}

// ── Helpers ─────────────────────────────────────────────────────
function oneShot(
  ac: AudioContext, type: OscillatorType,
  freqStart: number, freqEnd: number, vol: number, delayS: number, duration: number,
) {
  const now = ac.currentTime + delayS
  const osc = ac.createOscillator()
  const gn  = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freqStart, now)
  osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration * 0.6)
  gn.gain.setValueAtTime(vol, now)
  gn.gain.exponentialRampToValueAtTime(0.001, now + duration)
  osc.connect(gn); gn.connect(ac.destination)
  osc.start(now); osc.stop(now + duration)
}
