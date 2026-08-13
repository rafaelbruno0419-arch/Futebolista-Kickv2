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

export const playSound = (name: 'tap' | 'kick' | 'coin' | 'goal' | 'fail', enabled = true) => {
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
}
