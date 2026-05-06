import { Chord, Note } from 'tonal'
import { normalizeChordName } from './chord-utils'

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/** MIDI note number to frequency */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Get MIDI notes for a chord name, using a simple piano voicing */
export function chordToMidi(chordName: string, octaveShift = 0): number[] {
  const normalized = normalizeChordName(chordName)
  const main = normalized.includes('/') ? normalized.split('/')[0] : normalized
  const info = Chord.get(main)
  if (!info.notes.length) return []

  const rootMidi = Note.midi(info.notes[0] + '3')
  if (rootMidi == null) return []

  const midis: number[] = [rootMidi]
  for (let i = 1; i < info.notes.length; i++) {
    let m = Note.midi(info.notes[i] + '3')
    if (m == null) continue
    while (m <= midis[midis.length - 1]) m += 12
    if (m > 84) m -= 12
    midis.push(m)
  }

  if (normalized.includes('/')) {
    const bass = normalized.split('/')[1]
    const bassMidi = Note.midi(bass + '2')
    if (bassMidi != null) midis.unshift(bassMidi)
  }

  return octaveShift ? midis.map(m => m + 12 * octaveShift) : midis
}

/** Master volume (0–1) */
let masterVolume = 0.5

export function setVolume(v: number) { masterVolume = Math.max(0, Math.min(1, v)) }
export function getVolume() { return masterVolume }

/** Play a set of MIDI notes as a chord */
export function playChord(midiNotes: number[], duration = 0.8): void {
  const ac = getCtx()
  const now = ac.currentTime

  const master = ac.createGain()
  master.gain.setValueAtTime((masterVolume * 0.6) / Math.max(midiNotes.length, 1), now)
  master.connect(ac.destination)

  for (const midi of midiNotes) {
    const freq = midiToFreq(midi)

    const osc = ac.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now)

    const osc2 = ac.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(freq * 2, now)

    const noteGain = ac.createGain()
    noteGain.gain.setValueAtTime(0, now)
    noteGain.gain.linearRampToValueAtTime(1, now + 0.02)
    noteGain.gain.linearRampToValueAtTime(0.6, now + 0.1)
    noteGain.gain.setValueAtTime(0.6, now + duration - 0.15)
    noteGain.gain.linearRampToValueAtTime(0, now + duration)

    const harmGain = ac.createGain()
    harmGain.gain.setValueAtTime(0.15, now)

    osc.connect(noteGain)
    osc2.connect(harmGain)
    harmGain.connect(noteGain)
    noteGain.connect(master)

    osc.start(now)
    osc.stop(now + duration + 0.05)
    osc2.start(now)
    osc2.stop(now + duration + 0.05)
  }
}

/** Short metronome click. Accent = first beat of pre-count. */
function playClick(accent: boolean): void {
  const ac = getCtx()
  const now = ac.currentTime
  const baseFreq = accent ? 1800 : 1200

  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(baseFreq, now)
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + 0.05)

  const gain = ac.createGain()
  const peak = masterVolume * (accent ? 0.5 : 0.35)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(peak, now + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)

  osc.connect(gain)
  gain.connect(ac.destination)

  osc.start(now)
  osc.stop(now + 0.08)
}

export type PlayerState = 'stopped' | 'playing' | 'paused'

export interface ProgressionPlayer {
  play: () => void
  pause: () => void
  stop: () => void
  state: () => PlayerState
}

/** Create a controllable chord progression player */
export function createProgressionPlayer(
  chordNames: string[],
  bpm: number,
  onChordStart: (index: number) => void,
  options?: {
    mute?: boolean
    loop?: boolean
    octShifts?: number[]
    repeatsPerChord?: number
    preCountBeats?: number
    onPreCountBeat?: (beat: number) => void
  },
): ProgressionPlayer {
  const beatDuration = 60 / bpm
  const chordDuration = beatDuration * 2
  const repeats = Math.max(1, Math.floor(options?.repeatsPerChord ?? 1))
  const octShifts = options?.octShifts ?? []
  const preCountBeats = Math.max(0, Math.floor(options?.preCountBeats ?? 0))
  let currentIndex = 0
  let timeoutId: number | undefined
  let currentState: PlayerState = 'stopped'
  let inPreCount = false

  function playAt(index: number, repeatCount = 0) {
    if (currentState !== 'playing') return
    if (index >= chordNames.length) {
      if (options?.loop) { playAt(0); return }
      currentState = 'stopped'
      onChordStart(-1)
      return
    }
    if (repeatCount === 0) {
      currentIndex = index
      onChordStart(index)
    }
    if (!options?.mute) {
      const midis = chordToMidi(chordNames[index], octShifts[index] ?? 0)
      if (midis.length) playChord(midis, chordDuration * 0.9)
    }
    const isLastRepeat = repeatCount + 1 >= repeats
    timeoutId = window.setTimeout(
      () => playAt(isLastRepeat ? index + 1 : index, isLastRepeat ? 0 : repeatCount + 1),
      chordDuration * 1000,
    )
  }

  function runPreCount(beat: number) {
    if (currentState !== 'playing') return
    if (beat > preCountBeats) {
      inPreCount = false
      options?.onPreCountBeat?.(0)
      playAt(0)
      return
    }
    inPreCount = true
    options?.onPreCountBeat?.(beat)
    playClick(beat === 1)
    timeoutId = window.setTimeout(() => runPreCount(beat + 1), beatDuration * 1000)
  }

  return {
    play() {
      if (currentState === 'paused') {
        currentState = 'playing'
        playAt(currentIndex)
      } else {
        currentState = 'playing'
        if (preCountBeats > 0) runPreCount(1)
        else playAt(0)
      }
    },
    pause() {
      if (currentState !== 'playing') return
      currentState = 'paused'
      if (timeoutId != null) clearTimeout(timeoutId)
      if (inPreCount) {
        // Cancel pre-count; resume will start chord 0 immediately.
        inPreCount = false
        options?.onPreCountBeat?.(0)
      } else {
        // Keep currentIndex so resume continues from next chord
        currentIndex = currentIndex + 1
      }
    },
    stop() {
      currentState = 'stopped'
      if (timeoutId != null) clearTimeout(timeoutId)
      currentIndex = 0
      inPreCount = false
      options?.onPreCountBeat?.(0)
      onChordStart(-1)
    },
    state() { return currentState },
  }
}
