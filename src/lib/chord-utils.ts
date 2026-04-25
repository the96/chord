import { Note, Interval, Progression, Key } from 'tonal'

const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#']
const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']
export const ALL_KEYS = [...SHARP_KEYS, ...FLAT_KEYS]

const ENHARMONIC_MAP: Record<string, string> = {
  'Cb': 'B', 'B#': 'C', 'E#': 'F', 'Fb': 'E',
}

/** Determine if a key prefers flats */
function prefersFlats(key: string): boolean {
  return FLAT_KEYS.includes(key)
}

/** Normalize enharmonic spellings for a given key context */
function normalizeNote(note: string, targetKey: string): string {
  if (ENHARMONIC_MAP[note]) return ENHARMONIC_MAP[note]
  if (prefersFlats(targetKey)) {
    // Convert sharps to flats
    const flatMap: Record<string, string> = {
      'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
    }
    return flatMap[note] || note
  } else {
    // Convert flats to sharps
    const sharpMap: Record<string, string> = {
      'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
    }
    return sharpMap[note] || note
  }
}

/**
 * Normalize parenthesized/verbose notation to a simpler suffix.
 * e.g. "m7(11)" -> "m11", "7(b9)" -> "7b9", "7(#9)" -> "7#9"
 *
 * The rule: when a 7th-chord adds a higher extension in parens,
 * the standard name collapses them.
 *   m7 + (9)  = m9     m7 + (11) = m11
 *   7  + (b9) = 7b9    7  + (9)  = 9      7 + (13) = 13
 *   maj7 + (9) = maj9  maj7 + (11) = maj11
 */
export function normalizeSuffix(raw: string): string {
  let s = raw.trim()

  // Unwrap all parentheses / brackets: "m7(11)" -> "m711"
  s = s.replace(/[(\[]/g, '').replace(/[)\]]/g, '')

  const COLLAPSE: [RegExp, string][] = [
    // minor 7th + extensions
    [/^m7(?:#11)$/, 'm11'],
    [/^m7(?:11)$/, 'm11'],
    [/^m7(?:9)$/, 'm9'],
    // dominant 7th + extensions
    [/^7(?:#11)$/, '9#11'],
    [/^7(?:b13)$/, '7b9'],
    [/^7(?:13)$/, '13'],
    [/^7(?:#9)$/, '7#9'],
    [/^7(?:b9)$/, '7b9'],
    [/^7(?:11)$/, '11'],
    [/^7(?:9)$/, '9'],
    // maj7 + extensions
    [/^maj7(?:#11)$/, 'maj9'],
    [/^maj7(?:11)$/, 'maj11'],
    [/^maj7(?:9)$/, 'maj9'],
    [/^M7(?:9)$/, 'maj9'],
    [/^M7(?:11)$/, 'maj11'],
    // mmaj7 + extensions
    [/^mmaj7(?:9)$/, 'mmaj9'],
    [/^mmaj7(?:11)$/, 'mmaj11'],
  ]

  for (const [pattern, replacement] of COLLAPSE) {
    if (pattern.test(s)) return replacement
  }

  return s
}

/** Normalize a full chord name: "Em7(11)" -> "Em11" */
export function normalizeChordName(name: string): string {
  const slashIdx = name.indexOf('/')
  const main = slashIdx >= 0 ? name.substring(0, slashIdx) : name
  const bass = slashIdx >= 0 ? name.substring(slashIdx) : ''

  const match = main.match(/^([A-G][#b]?)(.*)$/)
  if (!match) return name

  const normalized = normalizeSuffix(match[2])
  return match[1] + normalized + bass
}

/** Parse a chord string into root note and suffix (e.g., "Cm7" -> ["C", "m7"]) */
function parseChord(chord: string): { root: string; suffix: string } | null {
  const match = chord.match(/^([A-G][#b]?)(.*)$/)
  if (!match) return null
  return { root: match[1], suffix: match[2] }
}

/** Transpose a single chord from one key to another */
export function transposeChord(chord: string, fromKey: string, toKey: string): string {
  // Handle slash chords (e.g., "C/E")
  if (chord.includes('/')) {
    const [main, bass] = chord.split('/')
    return `${transposeChord(main, fromKey, toKey)}/${transposeChord(bass, fromKey, toKey)}`
  }

  const parsed = parseChord(chord)
  if (!parsed) return chord

  const interval = Interval.distance(fromKey, toKey)
  const transposed = Note.transpose(parsed.root, interval)
  if (!transposed) return chord

  const normalized = normalizeNote(
    Note.get(transposed).pc || transposed,
    toKey,
  )
  return normalized + parsed.suffix
}

/** Transpose a chord progression string */
export function transposeProgression(input: string, fromKey: string, toKey: string): string[] {
  const chords = parseChordInput(input)
  return chords.map(c => transposeChord(c, fromKey, toKey))
}

/** Convert Roman numeral progression to chords in a given key */
export function romanToChords(input: string, key: string): string[] {
  const romans = parseRomanInput(input)
  const chords = Progression.fromRomanNumerals(key, romans)
  return chords.map(c => {
    // tonal may return enharmonic spellings; normalize them
    const parsed = parseChord(c)
    if (!parsed) return c
    return normalizeNote(parsed.root, key) + parsed.suffix
  })
}

/** Convert chords to Roman numerals in a given key */
export function chordsToRoman(input: string, key: string): string[] {
  const chords = parseChordInput(input)
  return Progression.toRomanNumerals(key, chords)
}

/** Get diatonic chords for a key */
export function getDiatonicChords(key: string): { chord: string; roman: string }[] {
  const keyInfo = Key.majorKey(key)
  const chords = keyInfo.chords
  const romans = ['Imaj7', 'IIm7', 'IIIm7', 'IVmaj7', 'V7', 'VIm7', 'VIIdim7']

  return chords.map((c: string, i: number) => ({
    chord: c,
    roman: romans[i] || '',
  }))
}

/** Parse chord input - handles various separators */
export function parseChordInput(input: string): string[] {
  return input
    .replace(/[|｜]/g, ' ')
    .replace(/[-–—→]/g, ' ')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && /^[A-G]/.test(s))
}

/** Parse Roman numeral input */
export function parseRomanInput(input: string): string[] {
  return input
    .replace(/[|｜]/g, ' ')
    .replace(/[-–—→]/g, ' ')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && /^[IiVv#b]/.test(s))
}

/** Detect key from chord progression (best guess) */
export function detectKey(chords: string[]): string | null {
  if (chords.length === 0) return null
  // Simple heuristic: first chord's root is often the key
  const parsed = parseChord(chords[0])
  if (!parsed) return null

  // If suffix suggests minor, return relative major
  if (parsed.suffix.startsWith('m') && !parsed.suffix.startsWith('maj')) {
    // minor chord - could be vi or ii or iii, just return root as minor suggestion
    return parsed.root
  }
  return parsed.root
}
