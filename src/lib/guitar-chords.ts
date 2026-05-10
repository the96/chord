import guitarDb from '@tombatossals/chords-db/lib/guitar.json'
import { normalizeSuffix } from './chord-utils'

export interface ChordPosition {
  frets: number[]    // -1 = muted, 0 = open, 1+ = fret number
  fingers: number[]  // 0 = not pressed, 1-4 = finger number
  baseFret: number
  barres: number[]
  capo?: boolean
  midi?: number[]    // played notes, low to high
}

export interface ChordData {
  key: string
  suffix: string
  positions: ChordPosition[]
}

// Map note names to the keys used in chords-db
const NOTE_TO_DB_KEY: Record<string, string> = {
  'C': 'C', 'C#': 'Csharp', 'Db': 'Csharp',
  'D': 'D', 'D#': 'Eb', 'Eb': 'Eb',
  'E': 'E',
  'F': 'F', 'F#': 'Fsharp', 'Gb': 'Fsharp',
  'G': 'G', 'G#': 'Ab', 'Ab': 'Ab',
  'A': 'A', 'A#': 'Bb', 'Bb': 'Bb',
  'B': 'B',
}

// Map chord suffix from common notation to chords-db suffix
const SUFFIX_MAP: Record<string, string> = {
  '': 'major',
  'm': 'minor',
  'min': 'minor',
  'M': 'major',
  'maj': 'major',
  'dim': 'dim',
  'dim7': 'dim7',
  'aug': 'aug',
  '+': 'aug',
  'sus2': 'sus2',
  'sus4': 'sus4',
  '7': '7',
  'maj7': 'maj7',
  'M7': 'maj7',
  'm7': 'm7',
  'min7': 'm7',
  'm7b5': 'm7b5',
  '7b5': '7b5',
  'aug7': 'aug7',
  '6': '6',
  'm6': 'm6',
  '9': '9',
  'm9': 'm9',
  'maj9': 'maj9',
  'add9': 'add9',
  'madd9': 'madd9',
  '11': '11',
  'm11': 'm11',
  'maj11': 'maj11',
  '13': '13',
  'maj13': 'maj13',
  '7sus4': '7sus4',
  '69': '69',
  'm69': 'm69',
  'mmaj7': 'mmaj7',
  '7b9': '7b9',
  '7#9': '7#9',
  '9b5': '9b5',
  'aug9': 'aug9',
  '9#11': '9#11',
  'maj7b5': 'maj7b5',
  'maj7#5': 'maj7#5',
  'mmaj9': 'mmaj9',
  'mmaj11': 'mmaj11',
  'mmaj7b5': 'mmaj7b5',
  'alt': 'alt',
}

/** Parse chord name into root note and suffix */
function parseChordName(chord: string): { root: string; suffix: string } | null {
  const match = chord.match(/^([A-G][#b]?)(.*)$/)
  if (!match) return null
  return { root: match[1], suffix: match[2] }
}

const NOTE_TO_PC: Record<string, number> = {
  'C': 0, 'B#': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4, 'E#': 5, 'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11,
}

/** Adjust positions so the lowest played note matches the slash bass.
 *  Collects both direct-match voicings and mute-derived voicings (where lower
 *  strings are silenced to expose the bass), then sorts by baseFret so the
 *  most accessible voicing comes first. Falls back to the original positions
 *  if neither approach yields anything. */
function adjustPositionsForBass(positions: ChordPosition[], bassPc: number): ChordPosition[] {
  const candidates: ChordPosition[] = []
  for (const pos of positions) {
    if (!pos.midi || pos.midi.length === 0) continue
    if ((pos.midi[0] % 12) === bassPc) {
      candidates.push(pos)
      continue
    }
    const matchInMidi = pos.midi.findIndex(m => (m % 12) === bassPc)
    if (matchInMidi <= 0) continue
    const remaining = pos.midi.length - matchInMidi
    if (remaining < 3) continue
    const playedStrings: number[] = []
    pos.frets.forEach((f, i) => { if (f >= 0) playedStrings.push(i) })
    const stringToKeep = playedStrings[matchInMidi]
    if (stringToKeep == null) continue
    candidates.push({
      ...pos,
      frets: pos.frets.map((f, i) => (i < stringToKeep ? -1 : f)),
      fingers: pos.fingers.map((f, i) => (i < stringToKeep ? 0 : f)),
      midi: pos.midi.slice(matchInMidi),
    })
  }
  if (!candidates.length) return positions
  candidates.sort((a, b) => a.baseFret - b.baseFret || (b.midi?.length ?? 0) - (a.midi?.length ?? 0))
  return candidates
}

const ENHARMONIC: Record<string, string> = {
  'C#': 'Db', 'Db': 'C#', 'D#': 'Eb', 'Eb': 'D#',
  'F#': 'Gb', 'Gb': 'F#', 'G#': 'Ab', 'Ab': 'G#',
  'A#': 'Bb', 'Bb': 'A#',
}

/** Look up a dedicated slash-chord entry in chord-db (e.g. "D" + "/F#"). */
function lookupSlashEntry(dbKey: string, mainSuffix: string, bassNote: string): ChordData | null {
  if (mainSuffix !== '' && mainSuffix !== 'm') return null
  const chords = (guitarDb.chords as Record<string, ChordData[]>)[dbKey]
  if (!chords) return null
  const candidates = [bassNote, ENHARMONIC[bassNote]].filter(Boolean) as string[]
  for (const bass of candidates) {
    const suffix = `${mainSuffix}/${bass}`
    const found = chords.find(c => c.suffix === suffix)
    if (found) return found
  }
  return null
}

/** Look up guitar chord data from a chord name like "Cm7", "Dmaj7", etc. */
export function lookupChord(chordName: string): ChordData | null {
  const slashIdx = chordName.indexOf('/')
  const mainChord = slashIdx >= 0 ? chordName.substring(0, slashIdx) : chordName
  const bassNote = slashIdx >= 0 ? chordName.substring(slashIdx + 1) : ''

  const parsed = parseChordName(mainChord)
  if (!parsed) return null

  const dbKey = NOTE_TO_DB_KEY[parsed.root]
  if (!dbKey) return null

  if (bassNote) {
    const slashEntry = lookupSlashEntry(dbKey, parsed.suffix, bassNote)
    if (slashEntry) {
      const sorted = [...slashEntry.positions].sort((a, b) => a.baseFret - b.baseFret)
      return { ...slashEntry, positions: sorted }
    }
  }

  const normalized = normalizeSuffix(parsed.suffix)
  const dbSuffix = SUFFIX_MAP[parsed.suffix] ?? SUFFIX_MAP[normalized]
  if (!dbSuffix) return null

  const chords = (guitarDb.chords as Record<string, ChordData[]>)[dbKey]
  if (!chords) return null

  const found = chords.find(c => c.suffix === dbSuffix)
  if (!found) return null

  if (bassNote) {
    const bassPc = NOTE_TO_PC[bassNote]
    if (bassPc != null) {
      return { ...found, positions: adjustPositionsForBass(found.positions, bassPc) }
    }
  }
  return found
}
