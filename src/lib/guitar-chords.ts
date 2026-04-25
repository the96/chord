import guitarDb from '@tombatossals/chords-db/lib/guitar.json'
import { normalizeSuffix } from './chord-utils'

export interface ChordPosition {
  frets: number[]    // -1 = muted, 0 = open, 1+ = fret number
  fingers: number[]  // 0 = not pressed, 1-4 = finger number
  baseFret: number
  barres: number[]
  capo?: boolean
}

export interface ChordData {
  key: string
  suffix: string
  positions: ChordPosition[]
}

// Map note names to the keys used in chords-db
const NOTE_TO_DB_KEY: Record<string, string> = {
  'C': 'C', 'C#': 'C#', 'Db': 'C#',
  'D': 'D', 'D#': 'Eb', 'Eb': 'Eb',
  'E': 'E',
  'F': 'F', 'F#': 'F#', 'Gb': 'F#',
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

/** Look up guitar chord data from a chord name like "Cm7", "Dmaj7", etc. */
export function lookupChord(chordName: string): ChordData | null {
  // Handle slash chords - strip bass note for diagram lookup
  const slashIdx = chordName.indexOf('/')
  const mainChord = slashIdx >= 0 ? chordName.substring(0, slashIdx) : chordName

  const parsed = parseChordName(mainChord)
  if (!parsed) return null

  const dbKey = NOTE_TO_DB_KEY[parsed.root]
  if (!dbKey) return null

  // Try direct mapping first, then normalized form
  const normalized = normalizeSuffix(parsed.suffix)
  const dbSuffix = SUFFIX_MAP[parsed.suffix] ?? SUFFIX_MAP[normalized]
  if (!dbSuffix) return null

  const chords = (guitarDb.chords as Record<string, ChordData[]>)[dbKey]
  if (!chords) return null

  const found = chords.find(c => c.suffix === dbSuffix)
  return found || null
}
