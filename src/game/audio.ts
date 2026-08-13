let context: AudioContext | null = null

const getContext = () => {
  if (typeof window === 'undefined') return null
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

const tone = (frequency: number, duration: number, type: OscillatorType, volume = 0.08, delay = 0) => {
  const ctx = getContext()
  if (!ctx) return
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  const start = ctx.currentTime + delay
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration)
}

export const playSound = (name: 'tap' | 'kick' | 'coin' | 'goal' | 'fail' | 'whistle' | 'crowd' | 'save', enabled = true) => {
  if (!enabled) return
  if (name === 'tap') tone(420, 0.08, 'sine', 0.04)
  if (name === 'kick') {
    tone(115, 0.16, 'triangle', 0.12)
    tone(70, 0.11, 'sine', 0.08, 0.02)
  }
  if (name === 'coin') {
    tone(880, 0.1, 'sine', 0.07)
    tone(1320, 0.12, 'sine', 0.055, 0.07)
  }
  if (name === 'goal') {
    tone(392, 0.18, 'square', 0.045)
    tone(523, 0.2, 'square', 0.045, 0.1)
    tone(659, 0.32, 'square', 0.045, 0.2)
  }
  if (name === 'fail') {
    tone(220, 0.2, 'sawtooth', 0.035)
    tone(150, 0.3, 'sawtooth', 0.025, 0.15)
  }
  if (name === 'whistle') {
    tone(2350, 0.22, 'square', 0.035)
    tone(2450, 0.22, 'square', 0.03, 0.28)
    tone(2350, 0.5, 'square', 0.04, 0.62)
  }
  if (name === 'crowd') {
    const ctx = getContext()
    if (!ctx) return
    const seconds = 0.9
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / data.length)
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900
    filter.Q.value = 0.6
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    source.start()
    tone(620, 0.7, 'sawtooth', 0.02, 0.1)
  }
  if (name === 'save') {
    tone(170, 0.14, 'triangle', 0.1)
    tone(95, 0.16, 'sine', 0.08, 0.06)
  }
}

