export interface HistoryEntry {
  id: string
  name: string
  mode: 'chord' | 'degree'
  input: string
  fromKey: string
  toKey: string
  createdAt: number
  guitar?: boolean
  repeats?: number
  bpm?: number
}

const STORAGE_KEY = 'chord-transposer-history'
const MAX_ENTRIES = 50

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HistoryEntry[]
  } catch {
    return []
  }
}

function save(entries: HistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

export function getHistory(): HistoryEntry[] {
  return load()
}

export function addHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): HistoryEntry {
  const entries = load()
  const newEntry: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  save([newEntry, ...entries])
  return newEntry
}

export function updateHistoryName(id: string, name: string): void {
  const entries = load()
  const entry = entries.find(e => e.id === id)
  if (entry) {
    entry.name = name
    save(entries)
  }
}

export function removeHistory(id: string): void {
  const entries = load().filter(e => e.id !== id)
  save(entries)
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}
